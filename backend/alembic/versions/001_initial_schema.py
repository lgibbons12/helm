"""Initial schema with all tables.

Revision ID: 001_initial
Revises:
Create Date: 2026-02-01

This migration creates the complete Helm database schema:
- Extensions: uuid-ossp, citext
- Enums: assignment_status, assignment_type, time_block_kind
- Tables: users, auth_identities, classes, assignments, exams, notes, time_blocks, transactions, budget_settings
- Indexes: All performance indexes per requirements
- Triggers: updated_at auto-update function and triggers
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ==========================================================================
    # EXTENSIONS
    # ==========================================================================
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "citext"')

    # ==========================================================================
    # ENUMS
    # ==========================================================================
    assignment_status = postgresql.ENUM(
        "not_started", "in_progress", "done",
        name="assignment_status",
        create_type=True,
    )
    assignment_status.create(op.get_bind(), checkfirst=True)

    assignment_type = postgresql.ENUM(
        "pset", "reading", "project", "quiz", "other",
        name="assignment_type",
        create_type=True,
    )
    assignment_type.create(op.get_bind(), checkfirst=True)

    time_block_kind = postgresql.ENUM(
        "assignment", "meeting", "class", "personal",
        name="time_block_kind",
        create_type=True,
    )
    time_block_kind.create(op.get_bind(), checkfirst=True)

    # ==========================================================================
    # USERS TABLE
    # ==========================================================================
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.CheckConstraint(
            "email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'",
            name="valid_email",
        ),
    )
    op.create_index("idx_users_email", "users", ["email"])

    # ==========================================================================
    # AUTH_IDENTITIES TABLE
    # ==========================================================================
    op.create_table(
        "auth_identities",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("provider_user_id", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("last_login_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("provider", "provider_user_id", name="unique_provider_identity"),
    )
    op.create_index("idx_auth_identities_user_id", "auth_identities", ["user_id"])
    op.create_index("idx_auth_identities_provider_lookup", "auth_identities", ["provider", "provider_user_id"])

    # ==========================================================================
    # CLASSES TABLE
    # ==========================================================================
    op.create_table(
        "classes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("code", sa.String(50), nullable=True),
        sa.Column("semester", sa.String(50), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("instructor", sa.String(255), nullable=True),
        sa.Column("links_json", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.CheckConstraint("color IS NULL OR color ~* '^#[0-9A-Fa-f]{6}$'", name="valid_color"),
    )
    op.create_index("idx_classes_user_id", "classes", ["user_id"])
    op.create_index("idx_classes_semester", "classes", ["user_id", "semester"])
    # Partial unique indexes for code/name uniqueness
    op.execute("""
        CREATE UNIQUE INDEX idx_classes_user_semester_code 
        ON classes(user_id, semester, code) 
        WHERE code IS NOT NULL
    """)
    op.execute("""
        CREATE UNIQUE INDEX idx_classes_user_semester_name_no_code 
        ON classes(user_id, semester, name) 
        WHERE code IS NULL
    """)

    # ==========================================================================
    # ASSIGNMENTS TABLE
    # ==========================================================================
    op.create_table(
        "assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("class_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("type", postgresql.ENUM("pset", "reading", "project", "quiz", "other", name="assignment_type", create_type=False), nullable=False, server_default="other"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("planned_start_date", sa.Date(), nullable=True),
        sa.Column("estimated_minutes", sa.Integer(), nullable=True),
        sa.Column("status", postgresql.ENUM("not_started", "in_progress", "done", name="assignment_status", create_type=False), nullable=False, server_default="not_started"),
        sa.Column("notes_short", sa.Text(), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="SET NULL"),
        sa.CheckConstraint("estimated_minutes IS NULL OR estimated_minutes > 0", name="valid_estimated_minutes"),
        sa.CheckConstraint("planned_start_date IS NULL OR due_date IS NULL OR planned_start_date <= due_date", name="valid_date_order"),
    )
    op.create_index("idx_assignments_user_planned_start", "assignments", ["user_id", "planned_start_date"])
    op.create_index("idx_assignments_user_due_date", "assignments", ["user_id", "due_date"])
    op.create_index("idx_assignments_user_status", "assignments", ["user_id", "status"])
    op.create_index("idx_assignments_class_id", "assignments", ["class_id"])

    # ==========================================================================
    # EXAMS TABLE
    # ==========================================================================
    op.create_table(
        "exams",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("class_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("exam_datetime", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("weight", sa.Numeric(5, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="SET NULL"),
        sa.CheckConstraint("weight IS NULL OR (weight >= 0 AND weight <= 100)", name="valid_weight"),
    )
    op.create_index("idx_exams_user_datetime", "exams", ["user_id", "exam_datetime"])
    op.create_index("idx_exams_class_id", "exams", ["class_id"])

    # ==========================================================================
    # NOTES TABLE
    # ==========================================================================
    op.create_table(
        "notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("class_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("content_json", postgresql.JSONB(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.Text()), server_default=sa.text("'{}'::text[]"), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_notes_user_updated_at", "notes", ["user_id", sa.text("updated_at DESC")])
    op.create_index("idx_notes_class_id", "notes", ["class_id"])
    op.execute("CREATE INDEX idx_notes_tags ON notes USING GIN(tags)")

    # ==========================================================================
    # TIME_BLOCKS TABLE
    # ==========================================================================
    op.create_table(
        "time_blocks",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("start_datetime", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("end_datetime", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("kind", postgresql.ENUM("assignment", "meeting", "class", "personal", name="time_block_kind", create_type=False), nullable=False, server_default="personal"),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title_override", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"], ondelete="SET NULL"),
        sa.CheckConstraint("end_datetime > start_datetime", name="valid_time_range"),
    )
    op.create_index("idx_time_blocks_user_start", "time_blocks", ["user_id", "start_datetime"])
    op.create_index("idx_time_blocks_user_range", "time_blocks", ["user_id", "start_datetime", "end_datetime"])
    op.create_index("idx_time_blocks_assignment_id", "time_blocks", ["assignment_id"])

    # ==========================================================================
    # TRANSACTIONS TABLE
    # ==========================================================================
    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount_signed", sa.Numeric(12, 2), nullable=False),
        sa.Column("merchant", sa.String(255), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_income", sa.Boolean(), server_default=sa.text("FALSE"), nullable=False),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "(is_income = TRUE AND amount_signed > 0) OR (is_income = FALSE AND amount_signed <= 0)",
            name="valid_amount_sign",
        ),
    )
    op.create_index("idx_transactions_user_date", "transactions", ["user_id", sa.text("date DESC")])
    op.create_index("idx_transactions_user_category", "transactions", ["user_id", "category"])

    # ==========================================================================
    # BUDGET_SETTINGS TABLE
    # ==========================================================================
    op.create_table(
        "budget_settings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("large_expense_threshold", sa.Numeric(10, 2), server_default=sa.text("100.00"), nullable=True),
        sa.Column("weekly_budget_target", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.CheckConstraint("large_expense_threshold IS NULL OR large_expense_threshold > 0", name="valid_threshold"),
        sa.CheckConstraint("weekly_budget_target IS NULL OR weekly_budget_target > 0", name="valid_weekly_target"),
    )

    # ==========================================================================
    # UPDATED_AT TRIGGER FUNCTION
    # ==========================================================================
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Apply triggers to all tables with updated_at
    for table in ["users", "classes", "assignments", "exams", "notes", "time_blocks", "budget_settings"]:
        op.execute(f"""
            CREATE TRIGGER update_{table}_updated_at
                BEFORE UPDATE ON {table}
                FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
        """)


def downgrade() -> None:
    # Drop triggers
    for table in ["users", "classes", "assignments", "exams", "notes", "time_blocks", "budget_settings"]:
        op.execute(f"DROP TRIGGER IF EXISTS update_{table}_updated_at ON {table}")

    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column()")

    # Drop tables in reverse dependency order
    op.drop_table("budget_settings")
    op.drop_table("transactions")
    op.drop_table("time_blocks")
    op.drop_table("notes")
    op.drop_table("exams")
    op.drop_table("assignments")
    op.drop_table("classes")
    op.drop_table("auth_identities")
    op.drop_table("users")

    # Drop enums
    op.execute("DROP TYPE IF EXISTS time_block_kind")
    op.execute("DROP TYPE IF EXISTS assignment_type")
    op.execute("DROP TYPE IF EXISTS assignment_status")
