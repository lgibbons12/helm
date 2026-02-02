# Helm Backend

FastAPI backend for Helm - Personal Academic Planner + Budgeting App.

## Tech Stack

- **Framework**: FastAPI
- **Database**: PostgreSQL with SQLAlchemy 2.0 (async)
- **Migrations**: Alembic
- **Auth**: JWT with Google OAuth
- **Package Manager**: [uv](https://docs.astral.sh/uv/)

## Quick Start

### Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (install: `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker & Docker Compose

### Setup

```bash
# Clone and navigate to backend
cd helm/backend

# Install dependencies with uv
uv sync

# Copy environment variables
cp .env.example .env
# Edit .env with your Google OAuth client ID

# Start PostgreSQL
docker compose up -d

# Run migrations
uv run alembic upgrade head

# Start development server
uv run uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000

### Common Commands

```bash
# Install dependencies (creates .venv automatically)
uv sync

# Add a new dependency
uv add <package>

# Add a dev dependency
uv add --dev <package>

# Run any command in the virtual environment
uv run <command>

# Start the dev server
uv run uvicorn app.main:app --reload

# Run tests
uv run pytest

# Format code
uv run black .
uv run ruff check --fix .

# Type checking
uv run mypy app
```

### Database Commands

```bash
# Start database
docker compose up -d

# Stop database
docker compose down

# Stop and remove data
docker compose down -v

# View logs
docker compose logs -f postgres

# Connect to database (psql)
docker compose exec postgres psql -U helm -d helm
```

### Migrations

```bash
# Apply all migrations
uv run alembic upgrade head

# Create new migration (after model changes)
uv run alembic revision --autogenerate -m "description"

# Rollback one migration
uv run alembic downgrade -1

# View migration history
uv run alembic history
```

## API Endpoints

### Authentication
- `POST /auth/google` - Exchange Google id_token for session
- `POST /auth/logout` - Clear session
- `GET /auth/me` - Get current user profile

### Health
- `GET /health` - Health check

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py          # Auth dependencies
│   │   └── routes/
│   │       └── auth.py      # Auth endpoints
│   ├── db/
│   │   ├── base.py          # SQLAlchemy base
│   │   ├── models.py        # All models
│   │   └── session.py       # Database session
│   ├── schemas/             # Pydantic schemas
│   ├── config.py            # Settings
│   └── main.py              # App entry point
├── alembic/
│   └── versions/            # Migration files
├── sql/
│   └── schema.sql           # Raw DDL (reference)
├── docker-compose.yml       # PostgreSQL setup
├── pyproject.toml           # uv/Python project config
└── .env.example             # Environment template
```

## Database Schema

See `sql/schema.sql` for complete DDL with comments explaining design decisions.

### Key Design Decisions

1. **UUID Primary Keys**: Prevents enumeration attacks, enables distributed ID generation
2. **CITEXT for Email**: Case-insensitive uniqueness at DB level
3. **TEXT[] for Tags**: Simpler than JSONB for flat string arrays, GIN indexed
4. **JSONB for Links**: Flexible storage for varying link types
5. **DB-level updated_at Triggers**: Guarantees consistency even for raw SQL
6. **No Soft Delete**: Kept simple; add if undo/recovery needed later

### Auth Design

- Auth identities are separate from users (supports multiple OAuth providers)
- We do NOT store OAuth access/refresh tokens (only verify id_tokens at login)
- JWTs are stateless; for revocation, implement a token blocklist

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_HOST` | Database host | localhost |
| `POSTGRES_PORT` | Database port | 5432 |
| `POSTGRES_USER` | Database user | helm |
| `POSTGRES_PASSWORD` | Database password | (required) |
| `POSTGRES_DB` | Database name | helm |
| `JWT_SECRET_KEY` | Secret for JWT signing | (required, change in prod) |
| `JWT_EXPIRE_MINUTES` | JWT expiry in minutes | 10080 (7 days) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | (required) |

## Testing

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=app

# Run specific test file
uv run pytest tests/test_auth.py -v
```

## Development

### Code Style

This project uses:
- **Black** for code formatting
- **Ruff** for linting
- **mypy** for type checking

```bash
# Format
uv run black .

# Lint
uv run ruff check .
uv run ruff check --fix .  # auto-fix

# Type check
uv run mypy app
```

### Pre-commit (optional)

```bash
uv add --dev pre-commit
uv run pre-commit install
```
