-- =============================================================================
-- Helm: Personal Academic Planner + Budgeting App
-- PostgreSQL DDL Schema (Production-Ready)
-- =============================================================================
-- 
-- Design Decisions:
-- 1. UUID v4 PKs: Avoids sequential ID enumeration attacks, enables distributed generation
-- 2. CITEXT for email: Case-insensitive uniqueness without app-level lowercasing
-- 3. timestamptz: Timezone-aware timestamps, critical for scheduling features
-- 4. TEXT[] for tags: Simpler than JSONB for string arrays, efficient with GIN index
-- 5. JSONB for links: Flexible key-value storage for varying link types
-- 6. DB-level updated_at trigger: Guarantees consistency even for raw SQL updates
-- 7. No soft delete: Kept simple; can add later if undo/recovery is needed
--
-- =============================================================================

-- Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation
CREATE EXTENSION IF NOT EXISTS "citext";      -- Case-insensitive text

-- =============================================================================
-- ENUMS
-- =============================================================================
-- Using enums over check constraints for:
-- - Type safety in application code
-- - Self-documenting schema
-- - Efficient storage (4 bytes vs variable text)

CREATE TYPE assignment_status AS ENUM ('not_started', 'in_progress', 'done');

CREATE TYPE assignment_type AS ENUM ('pset', 'reading', 'project', 'quiz', 'other');

CREATE TYPE time_block_kind AS ENUM ('assignment', 'meeting', 'class', 'personal');

-- =============================================================================
-- USERS TABLE
-- =============================================================================
-- Core user identity. Decoupled from auth providers to support multiple login methods.
-- email is nullable to support future providers that may not provide email.

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email CITEXT UNIQUE,  -- CITEXT for case-insensitive uniqueness
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint: email format validation (if provided)
    CONSTRAINT valid_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);

COMMENT ON TABLE users IS 'Core user accounts. Auth handled separately via auth_identities.';

-- =============================================================================
-- AUTH IDENTITIES TABLE
-- =============================================================================
-- Supports multiple OAuth providers per user (Google now, GitHub/Apple later).
-- Design: One user can have multiple auth_identities (e.g., Google + GitHub linked).
-- 
-- Security notes:
-- - We do NOT store OAuth access/refresh tokens. We only verify id_tokens at login.
-- - provider_user_id is the "sub" claim from the provider's id_token.
-- - email is denormalized here for audit/debugging (may differ from users.email).

CREATE TABLE auth_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,              -- 'google', 'github', 'apple'
    provider_user_id TEXT NOT NULL,      -- Provider's unique user ID (sub claim)
    email TEXT,                          -- Email from provider (for audit)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one identity per provider per provider_user_id
    CONSTRAINT unique_provider_identity UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_auth_identities_user_id ON auth_identities(user_id);
CREATE INDEX idx_auth_identities_provider_lookup ON auth_identities(provider, provider_user_id);

COMMENT ON TABLE auth_identities IS 'OAuth provider identities linked to users. Supports multiple providers per user.';

-- =============================================================================
-- CLASSES TABLE
-- =============================================================================
-- Academic classes/courses. Core organizational unit for assignments, exams, notes.
-- 
-- Design:
-- - code can be NULL (some institutions don't use course codes)
-- - semester as TEXT: Flexible for various formats ("Spring 2026", "2025-2026 Fall")
-- - links_json: JSONB for flexible link storage (syllabus_url, zoom_url, canvas_url, etc.)
-- - Uniqueness: user + semester + (code OR name if code is null)

CREATE TABLE classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,                           -- e.g., "CS 101" (nullable)
    semester TEXT NOT NULL,              -- e.g., "Spring 2026"
    color TEXT,                          -- Hex color for UI (e.g., "#3B82F6")
    instructor TEXT,
    links_json JSONB DEFAULT '{}',       -- {syllabus_url, zoom_url, canvas_url, ...}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Color format validation (hex)
    CONSTRAINT valid_color CHECK (color IS NULL OR color ~* '^#[0-9A-Fa-f]{6}$')
);

-- Uniqueness: Per user+semester, either code is unique OR (if code is null) name is unique
-- Using a partial unique index approach
CREATE UNIQUE INDEX idx_classes_user_semester_code 
    ON classes(user_id, semester, code) 
    WHERE code IS NOT NULL;

CREATE UNIQUE INDEX idx_classes_user_semester_name_no_code 
    ON classes(user_id, semester, name) 
    WHERE code IS NULL;

CREATE INDEX idx_classes_user_id ON classes(user_id);
CREATE INDEX idx_classes_semester ON classes(user_id, semester);

COMMENT ON TABLE classes IS 'Academic classes/courses. Parent for assignments, exams, notes.';

-- =============================================================================
-- ASSIGNMENTS TABLE
-- =============================================================================
-- Homework, readings, projects, quizzes. Core scheduling entity.
-- 
-- Design:
-- - class_id nullable: Supports standalone assignments not tied to a class
-- - planned_start_date: For scheduling/calendar features
-- - estimated_minutes: For time-boxing and productivity tracking
-- - notes_short: Quick notes, not full markdown (use notes table for detailed notes)

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    type assignment_type NOT NULL DEFAULT 'other',
    due_date DATE,                       -- Date only (time is usually end of day)
    planned_start_date DATE,             -- When to start working
    estimated_minutes INTEGER,           -- Time estimate for planning
    status assignment_status NOT NULL DEFAULT 'not_started',
    notes_short TEXT,                    -- Brief notes (< 500 chars typically)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Validation
    CONSTRAINT valid_estimated_minutes CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
    CONSTRAINT valid_date_order CHECK (planned_start_date IS NULL OR due_date IS NULL OR planned_start_date <= due_date)
);

-- Query indexes per requirements
CREATE INDEX idx_assignments_user_planned_start ON assignments(user_id, planned_start_date);
CREATE INDEX idx_assignments_user_due_date ON assignments(user_id, due_date);
CREATE INDEX idx_assignments_user_status ON assignments(user_id, status);
CREATE INDEX idx_assignments_class_id ON assignments(class_id);

COMMENT ON TABLE assignments IS 'Homework, readings, projects. Core academic tasks.';

-- =============================================================================
-- EXAMS TABLE
-- =============================================================================
-- Scheduled exams/tests with datetime, location, and weighting.

CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    exam_datetime TIMESTAMPTZ,           -- Full datetime (not just date)
    location TEXT,                       -- Room/building
    weight NUMERIC(5, 2),                -- e.g., 25.00 for 25% of grade
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Weight should be 0-100 if provided
    CONSTRAINT valid_weight CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100))
);

CREATE INDEX idx_exams_user_datetime ON exams(user_id, exam_datetime);
CREATE INDEX idx_exams_class_id ON exams(class_id);

COMMENT ON TABLE exams IS 'Scheduled exams and tests.';

-- =============================================================================
-- NOTES TABLE
-- =============================================================================
-- Class notes, study notes, etc. Supports markdown and optional rich text.
--
-- Design:
-- - content_text: Markdown text (primary storage)
-- - content_json: Optional JSONB for rich text editors (e.g., TipTap, Slate)
-- - tags: TEXT[] chosen over JSONB because:
--   - Simpler for flat string arrays
--   - Native array operators (<@, @>, &&)
--   - GIN index support for containment queries
--   - Cleaner in SQLAlchemy (ARRAY type vs JSON parsing)

CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content_text TEXT,                   -- Markdown content
    content_json JSONB,                  -- Optional: Rich text JSON (TipTap/Slate)
    tags TEXT[] DEFAULT '{}',            -- String array for simple tagging
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_user_updated_at ON notes(user_id, updated_at DESC);
CREATE INDEX idx_notes_class_id ON notes(class_id);
CREATE INDEX idx_notes_tags ON notes USING GIN(tags);  -- For tag filtering

COMMENT ON TABLE notes IS 'User notes with markdown and optional rich text support.';

-- =============================================================================
-- TIME BLOCKS TABLE
-- =============================================================================
-- Calendar/schedule blocks. Can be linked to assignments or standalone.
--
-- Design:
-- - kind: Type of block (assignment work, meeting, class session, personal)
-- - assignment_id: Links to assignment for "work on assignment X" blocks
-- - title_override: Custom title when not using assignment title

CREATE TABLE time_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    kind time_block_kind NOT NULL DEFAULT 'personal',
    assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
    title_override TEXT,                 -- Custom title (overrides assignment title)
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- End must be after start
    CONSTRAINT valid_time_range CHECK (end_datetime > start_datetime)
);

CREATE INDEX idx_time_blocks_user_start ON time_blocks(user_id, start_datetime);
CREATE INDEX idx_time_blocks_user_range ON time_blocks(user_id, start_datetime, end_datetime);
CREATE INDEX idx_time_blocks_assignment_id ON time_blocks(assignment_id);

COMMENT ON TABLE time_blocks IS 'Calendar schedule blocks for planning.';

-- =============================================================================
-- TRANSACTIONS TABLE
-- =============================================================================
-- Financial transactions for budgeting features.
--
-- Design:
-- - amount_signed: Positive for income, negative for expenses (simplifies sum queries)
-- - is_income: Denormalized flag for filtering (could derive from amount_signed > 0)
-- - category: Free text (not enum) for user flexibility
-- - No updated_at: Transactions are typically immutable after creation

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount_signed NUMERIC(12, 2) NOT NULL,  -- Positive = income, negative = expense
    merchant TEXT,
    category TEXT,
    note TEXT,
    is_income BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Amount sign should match is_income flag
    CONSTRAINT valid_amount_sign CHECK (
        (is_income = TRUE AND amount_signed > 0) OR 
        (is_income = FALSE AND amount_signed <= 0)
    )
);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_transactions_user_category ON transactions(user_id, category);

COMMENT ON TABLE transactions IS 'Financial transactions for budgeting.';

-- =============================================================================
-- BUDGET SETTINGS TABLE
-- =============================================================================
-- Per-user budget configuration. One row per user (1:1 relationship).
--
-- Design:
-- - user_id as PK: Enforces exactly one settings row per user
-- - Optional fields with sensible defaults

CREATE TABLE budget_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    large_expense_threshold NUMERIC(10, 2) DEFAULT 100.00,
    weekly_budget_target NUMERIC(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Thresholds must be positive
    CONSTRAINT valid_threshold CHECK (large_expense_threshold IS NULL OR large_expense_threshold > 0),
    CONSTRAINT valid_weekly_target CHECK (weekly_budget_target IS NULL OR weekly_budget_target > 0)
);

COMMENT ON TABLE budget_settings IS 'Per-user budget configuration (1:1 with users).';

-- =============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =============================================================================
-- Automatically updates updated_at timestamp on row modification.
-- Using DB trigger vs app-level for:
-- - Guaranteed consistency (works even for raw SQL updates)
-- - Single source of truth (no forgotten SET updated_at = NOW())
-- - Works across all clients (psql, admin tools, etc.)

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_blocks_updated_at
    BEFORE UPDATE ON time_blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budget_settings_updated_at
    BEFORE UPDATE ON budget_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
