"""API routes package."""

from app.api.routes import (
    assignments,
    auth,
    budget,
    classes,
    exams,
    notes,
    time_blocks,
    transactions,
)

__all__ = [
    "assignments",
    "auth",
    "budget",
    "classes",
    "exams",
    "notes",
    "time_blocks",
    "transactions",
]
