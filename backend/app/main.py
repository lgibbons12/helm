"""
Helm FastAPI Application Entry Point.

Run with: uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.routes import (
    auth,
    assignments,
    budget,
    classes,
    exams,
    notes,
    time_blocks,
    transactions,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager for startup/shutdown."""
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title=settings.app_name,
    description="Personal Academic Planner + Budgeting API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(classes.router)
app.include_router(assignments.router)
app.include_router(exams.router)
app.include_router(notes.router)
app.include_router(time_blocks.router)
app.include_router(transactions.router)
app.include_router(budget.router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}
