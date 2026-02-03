# Helm

Helm is a personal academic command center that puts you in control of your time, coursework, and energy.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TanStack Start, Vite, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic |
| Database | PostgreSQL (Neon for production) |
| Auth | Google OAuth + JWT |

## Production Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | https://helm-bice.vercel.app |
| Backend | Render | https://helm-api-ynxq.onrender.com |
| Database | Neon | (connection string in Render env vars) |

---

## Local Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- pnpm
- uv (Python package manager)
- Docker (for local PostgreSQL)

### Backend Setup

```bash
cd backend

# Start PostgreSQL
docker-compose up -d

# Install dependencies
uv sync

# Run migrations
uv run alembic upgrade head

# Start server
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

### Environment Variables

**Backend (`backend/.env`):**
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=helm
POSTGRES_PASSWORD=helm_dev_password
POSTGRES_DB=helm

JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com

ENVIRONMENT=development
DEBUG=true
CORS_ORIGINS=["http://localhost:3000"]
```

**Frontend (`frontend/.env`):**
```env
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
```

---

## Production Deployment Guide

### 1. Neon (Database)

1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string (looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`)

### 2. Render (Backend)

1. Create account at [render.com](https://render.com)
2. New → Web Service → Connect your GitHub repo
3. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install uv && uv sync`
   - **Start Command:** `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`

4. Set environment variables:

| Variable | Value |
|----------|-------|
| `DATABASE_URL_OVERRIDE` | Your Neon connection string |
| `JWT_SECRET_KEY` | Generate with `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID |
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `CORS_ORIGINS` | `["https://helm-bice.vercel.app"]` |
| `COOKIE_CROSS_DOMAIN` | `true` |

### 3. Vercel (Frontend)

1. Create account at [vercel.com](https://vercel.com)
2. Import your GitHub repo
3. Configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite

4. Set environment variables:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://helm-api-ynxq.onrender.com` |
| `VITE_GOOGLE_CLIENT_ID` | Your Google OAuth client ID |

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. Add to **Authorized JavaScript origins:**
   - `http://localhost:3000` (dev)
   - `https://helm-bice.vercel.app` (prod)
4. Add to **Authorized redirect URIs:**
   - `http://localhost:3000` (dev)
   - `https://helm-bice.vercel.app` (prod)

---

## Troubleshooting

### CORS Errors
- Verify `CORS_ORIGINS` on Render includes your exact Vercel URL with `https://`
- No trailing slash
- Must be a JSON array: `["https://your-app.vercel.app"]`

### 401 Unauthorized After Login
- Check Render logs for actual error
- Verify `GOOGLE_CLIENT_ID` matches on both Vercel and Render
- Verify `JWT_SECRET_KEY` is set on Render
- Auth uses localStorage token as fallback for mobile browsers that block cross-site cookies

### Database Connection Errors
- Neon connection string must include `?sslmode=require`
- Variable name must be `DATABASE_URL_OVERRIDE` (not `DATABASE_URL`)
- Don't wrap value in quotes in Render UI

### Mobile Safari Login Issues
- Cross-site cookies are blocked by default on iOS Safari
- The app uses localStorage + Authorization header as fallback
- If login redirects back to login page, check browser console for errors

### Render Cold Starts
- Free tier sleeps after 15 min of inactivity
- First request takes ~30 seconds
- Upgrade to paid tier ($7/mo) for always-on

### Running Migrations on Production
```bash
# Option 1: Local with Neon connection
cd backend
# Set DATABASE_URL_OVERRIDE in .env to Neon connection string
uv run alembic upgrade head

# Option 2: Render Shell
# Go to Render dashboard → your service → Shell
uv run alembic upgrade head
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/auth/google` | POST | Google OAuth login |
| `/auth/logout` | POST | Logout |
| `/auth/me` | GET | Get current user |
| `/classes` | GET/POST | List/create classes |
| `/classes/{id}` | GET/PATCH/DELETE | Class operations |
| `/assignments` | GET/POST | List/create assignments |
| `/notes` | GET/POST | List/create notes |
| `/transactions` | GET/POST | List/create transactions |

---

## Project Structure

```
helm/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # API endpoints
│   │   ├── db/             # Database models & session
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── config.py       # Settings
│   │   └── main.py         # FastAPI app
│   ├── alembic/            # Database migrations
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── lib/            # API client, auth, utils
│   │   └── routes/         # TanStack Router pages
│   └── package.json
└── README.md
```
