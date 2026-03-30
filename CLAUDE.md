# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helm is a personal academic command center (time, coursework, budget management). React 19 + TanStack Start frontend, FastAPI async backend, PostgreSQL database, Google OAuth authentication.

## Development Commands

### Backend (from `backend/`)
```bash
docker-compose up -d                    # Start PostgreSQL + MinIO
uv sync                                 # Install Python dependencies
uv run alembic upgrade head             # Run migrations
uv run uvicorn app.main:app --reload --port 8000  # Start dev server
uv run alembic revision --autogenerate -m "description"  # New migration
uv run pytest                           # Run tests
uv run pytest tests/test_foo.py::test_bar  # Single test
uv run black .                          # Format
uv run ruff check .                     # Lint
uv run mypy .                           # Type check
```

### Frontend (from `frontend/`)
```bash
pnpm install                            # Install dependencies
pnpm dev                                # Start dev server (port 3000)
pnpm build                              # Production build
pnpm test                               # Run tests (Vitest)
pnpm lint                               # ESLint
pnpm format                             # Prettier
pnpm check                              # Format + auto-fix lint
pnpm dlx shadcn@latest add <component>  # Add shadcn component
```

## Architecture

### Backend (`backend/app/`)
- **Entry:** `main.py` — FastAPI app with lifespan, CORS, 11 routers
- **Routes:** `api/routes/` — auth, classes, assignments, exams, notes, time_blocks, transactions, budget, weekly_plans, pdfs, chat
- **Auth:** `api/deps.py` — JWT in HttpOnly cookies (localStorage fallback). `CurrentUser` dependency for user-scoped queries. `verify_ownership_or_404()` for privacy-preserving access checks
- **Models:** `db/models.py` — All SQLAlchemy models, UUID PKs, `TIMESTAMP(timezone=True)`, CITEXT emails
- **Schemas:** `schemas/` — Pydantic schemas per domain, all extend `BaseSchema` with `from_attributes=True`
- **DB:** `db/session.py` — async SQLAlchemy 2.0 + asyncpg, auto SSL for Neon
- **Config:** `config.py` — Pydantic Settings, `DATABASE_URL_OVERRIDE` for production Neon URL

### Frontend (`frontend/src/`)
- **Routing:** TanStack Router with file-based routing in `routes/`. Route tree auto-generated in `routeTree.gen.ts`
- **API Client:** `lib/api.ts` — typed `get<T>()`, `post<T>()`, `put<T>()`, `patch<T>()`, `delete<T>()` methods with `credentials: 'include'`; all TypeScript types co-located here
- **Auth:** `lib/auth.tsx` — AuthProvider context, `useAuth()` hook, query key `['auth', 'user']`
- **State:** TanStack React Query with key prefixes like `['transactions', ...]` and invalidation cascades on mutations
- **Pages:** `routes/dashboard/` — assignments, classes, notes, pdfs, chat, budget, board, plan, odin
- **UI:** shadcn/ui (Radix) + Tailwind CSS, lucide-react icons, lowercase text style, `glass-card` class

### Database
- PostgreSQL 16 (local via docker-compose, production on Neon with SSL)
- MinIO for S3-compatible object storage (local), AWS S3 in production
- Alembic migrations in `backend/alembic/versions/`, sequentially numbered (001–009)

## Key Conventions

- All DB models use UUID primary keys and user-scoped queries
- Backend schemas import `BaseSchema` from `app.schemas.base`
- Migrations use sequential numbering with string revision IDs; post-write hook formats with black
- Frontend API types and methods are all in `lib/api.ts` — add new types there
- `EXPENSE_CATEGORIES` constant is defined in both `backend/app/schemas/budget.py` and `frontend/src/lib/api.ts` — keep in sync
- Category colors are in `frontend/src/routes/dashboard/budget.tsx` (`CATEGORY_COLORS` map)
- Anthropic Claude API used for chat/PDF features (model configured in `config.py`)

## Deployment

- **Frontend:** Vercel (root dir `frontend/`)
- **Backend:** Render (root dir `backend/`, start: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`)
- **Database:** Neon PostgreSQL (via `DATABASE_URL_OVERRIDE` with `sslmode=require`)
- **Storage:** AWS S3 (endpoint configurable for MinIO locally)
