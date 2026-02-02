"""Pydantic schemas for API request/response validation."""

from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.schemas.auth import (
    GoogleAuthRequest,
    TokenResponse,
    AuthIdentityRead,
)
from app.schemas.classes import ClassCreate, ClassRead, ClassUpdate
from app.schemas.assignments import AssignmentCreate, AssignmentRead, AssignmentUpdate
from app.schemas.exams import ExamCreate, ExamRead, ExamUpdate
from app.schemas.notes import NoteCreate, NoteRead, NoteUpdate
from app.schemas.time_blocks import TimeBlockCreate, TimeBlockRead, TimeBlockUpdate
from app.schemas.transactions import TransactionCreate, TransactionRead
from app.schemas.budget import BudgetSettingsRead, BudgetSettingsUpdate

__all__ = [
    # User
    "UserCreate",
    "UserRead",
    "UserUpdate",
    # Auth
    "GoogleAuthRequest",
    "TokenResponse",
    "AuthIdentityRead",
    # Classes
    "ClassCreate",
    "ClassRead",
    "ClassUpdate",
    # Assignments
    "AssignmentCreate",
    "AssignmentRead",
    "AssignmentUpdate",
    # Exams
    "ExamCreate",
    "ExamRead",
    "ExamUpdate",
    # Notes
    "NoteCreate",
    "NoteRead",
    "NoteUpdate",
    # Time Blocks
    "TimeBlockCreate",
    "TimeBlockRead",
    "TimeBlockUpdate",
    # Transactions
    "TransactionCreate",
    "TransactionRead",
    # Budget
    "BudgetSettingsRead",
    "BudgetSettingsUpdate",
]
