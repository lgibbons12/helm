"""
SQLAlchemy 2.0 Models for Helm.

Uses modern declarative syntax with Mapped[] type annotations.
All models use UUID primary keys and proper relationship definitions.
"""

import datetime as dt
from datetime import date, datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, ENUM as PGENUM, JSONB, TIMESTAMP, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    pass


# =============================================================================
# ENUMS
# =============================================================================


class AssignmentStatus(str, PyEnum):
    """Progress status of an assignment."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    ALMOST_DONE = "almost_done"
    FINISHED = "finished"


class AssignmentType(str, PyEnum):
    """Type of assignment."""

    PSET = "pset"
    READING = "reading"
    PROJECT = "project"
    QUIZ = "quiz"
    OTHER = "other"


class TimeBlockKind(str, PyEnum):
    """Kind of time block."""

    ASSIGNMENT = "assignment"
    MEETING = "meeting"
    CLASS = "class"
    PERSONAL = "personal"


class DayOfWeek(str, PyEnum):
    """Day of the week for planned start."""

    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class ExtractionStatus(str, PyEnum):
    """PDF text extraction status."""

    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"


class BrainType(str, PyEnum):
    """Type of brain memory scope."""

    GLOBAL = "global"
    CLASS = "class"


class ChatRole(str, PyEnum):
    """Role in chat conversation."""

    USER = "user"
    ASSISTANT = "assistant"


# =============================================================================
# MODELS
# =============================================================================


class User(Base):
    """
    Core user account.

    Decoupled from auth providers - users can have multiple auth_identities
    (Google, GitHub, Apple, etc.) linked to one account.
    """

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    email: Mapped[Optional[str]] = mapped_column(
        CITEXT(), unique=True, index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    auth_identities: Mapped[list["AuthIdentity"]] = relationship(
        "AuthIdentity", back_populates="user", cascade="all, delete-orphan"
    )
    classes: Mapped[list["Class"]] = relationship(
        "Class", back_populates="user", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["Assignment"]] = relationship(
        "Assignment", back_populates="user", cascade="all, delete-orphan"
    )
    exams: Mapped[list["Exam"]] = relationship(
        "Exam", back_populates="user", cascade="all, delete-orphan"
    )
    notes: Mapped[list["Note"]] = relationship(
        "Note", back_populates="user", cascade="all, delete-orphan"
    )
    time_blocks: Mapped[list["TimeBlock"]] = relationship(
        "TimeBlock", back_populates="user", cascade="all, delete-orphan"
    )
    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction", back_populates="user", cascade="all, delete-orphan"
    )
    budget_settings: Mapped[Optional["BudgetSettings"]] = relationship(
        "BudgetSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    weekly_plans: Mapped[list["WeeklyPlan"]] = relationship(
        "WeeklyPlan", back_populates="user", cascade="all, delete-orphan"
    )
    pdfs: Mapped[list["PDF"]] = relationship(
        "PDF", back_populates="user", cascade="all, delete-orphan"
    )
    chat_conversations: Mapped[list["ChatConversation"]] = relationship(
        "ChatConversation", back_populates="user", cascade="all, delete-orphan"
    )
    brain_memories: Mapped[list["BrainMemory"]] = relationship(
        "BrainMemory", back_populates="user", cascade="all, delete-orphan"
    )


class AuthIdentity(Base):
    """
    OAuth provider identity linked to a user.

    Supports multiple providers per user (e.g., Google + GitHub linked).
    Does NOT store OAuth access/refresh tokens - we only verify id_tokens at login.
    """

    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="unique_provider_identity"),
        Index("idx_auth_identities_provider_lookup", "provider", "provider_user_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # 'google', 'github', 'apple'
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)  # Provider's 'sub' claim
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # For audit
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    last_login_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="auth_identities")


class Class(Base):
    """
    Academic class/course.

    Parent entity for assignments, exams, and notes.
    Uses JSONB for flexible link storage (syllabus, Zoom, Canvas, etc.).
    """

    __tablename__ = "classes"
    __table_args__ = (
        # Partial unique indexes for code/name uniqueness
        Index(
            "idx_classes_user_semester_code",
            "user_id", "semester", "code",
            unique=True,
            postgresql_where=text("code IS NOT NULL"),
        ),
        Index(
            "idx_classes_user_semester_name_no_code",
            "user_id", "semester", "name",
            unique=True,
            postgresql_where=text("code IS NULL"),
        ),
        Index("idx_classes_semester", "user_id", "semester"),
        CheckConstraint(
            "color IS NULL OR color ~* '^#[0-9A-Fa-f]{6}$'",
            name="valid_color",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # e.g., "CS 101"
    semester: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "Spring 2026"
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # Hex color
    instructor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    links_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="classes")
    assignments: Mapped[list["Assignment"]] = relationship(
        "Assignment", back_populates="class_", passive_deletes=True
    )
    exams: Mapped[list["Exam"]] = relationship(
        "Exam", back_populates="class_", passive_deletes=True
    )
    notes: Mapped[list["Note"]] = relationship(
        "Note", back_populates="class_", passive_deletes=True
    )
    pdfs: Mapped[list["PDF"]] = relationship(
        "PDF", back_populates="class_", passive_deletes=True
    )
    brain_memories: Mapped[list["BrainMemory"]] = relationship(
        "BrainMemory", back_populates="class_", passive_deletes=True
    )


class Assignment(Base):
    """
    Academic assignment (homework, reading, project, quiz).

    Core scheduling entity with due dates, time estimates, and status tracking.
    """

    __tablename__ = "assignments"
    __table_args__ = (
        Index("idx_assignments_user_planned_start", "user_id", "planned_start_day"),
        Index("idx_assignments_user_due_date", "user_id", "due_date"),
        Index("idx_assignments_user_status", "user_id", "status"),
        CheckConstraint(
            "estimated_minutes IS NULL OR estimated_minutes > 0",
            name="valid_estimated_minutes",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(
        PGENUM("pset", "reading", "project", "quiz", "other", name="assignment_type", create_type=False),
        nullable=False,
        default="other",
    )
    due_date: Mapped[Optional[date]] = mapped_column(nullable=True)
    planned_start_day: Mapped[Optional[str]] = mapped_column(
        PGENUM("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", name="day_of_week", create_type=False),
        nullable=True,
    )
    estimated_minutes: Mapped[Optional[int]] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(
        PGENUM("not_started", "in_progress", "almost_done", "finished", name="assignment_status", create_type=False),
        nullable=False,
        default="not_started",
    )
    notes_short: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="assignments")
    class_: Mapped[Optional["Class"]] = relationship("Class", back_populates="assignments")
    time_blocks: Mapped[list["TimeBlock"]] = relationship(
        "TimeBlock", back_populates="assignment", passive_deletes=True
    )
    notes: Mapped[list["Note"]] = relationship(
        "Note", back_populates="assignment", passive_deletes=True
    )
    pdfs: Mapped[list["PDF"]] = relationship(
        "PDF", back_populates="assignment", passive_deletes=True
    )


class Exam(Base):
    """Scheduled exam or test."""

    __tablename__ = "exams"
    __table_args__ = (
        Index("idx_exams_user_datetime", "user_id", "exam_datetime"),
        CheckConstraint(
            "weight IS NULL OR (weight >= 0 AND weight <= 100)",
            name="valid_weight",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    exam_datetime: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="exams")
    class_: Mapped[Optional["Class"]] = relationship("Class", back_populates="exams")


class Note(Base):
    """
    User notes with markdown content.

    Notes can be standalone or attached to a class or assignment.
    Content is stored as markdown in content_text for AI readability.
    Uses TEXT[] for tags (simpler than JSONB for flat string arrays).
    """

    __tablename__ = "notes"
    __table_args__ = (
        Index("idx_notes_user_updated_at", "user_id", "updated_at"),
        Index("idx_notes_tags", "tags", postgresql_using="gin"),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    assignment_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Untitled")
    content_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Markdown content
    content_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)  # Deprecated, unused
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="notes")
    class_: Mapped[Optional["Class"]] = relationship("Class", back_populates="notes")
    assignment: Mapped[Optional["Assignment"]] = relationship("Assignment", back_populates="notes")


class TimeBlock(Base):
    """Calendar schedule block for planning."""

    __tablename__ = "time_blocks"
    __table_args__ = (
        Index("idx_time_blocks_user_start", "user_id", "start_datetime"),
        Index("idx_time_blocks_user_range", "user_id", "start_datetime", "end_datetime"),
        CheckConstraint(
            "end_datetime > start_datetime",
            name="valid_time_range",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    start_datetime: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    end_datetime: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    kind: Mapped[str] = mapped_column(
        PGENUM("assignment", "meeting", "class", "personal", name="time_block_kind", create_type=False),
        nullable=False,
        default="personal",
    )
    assignment_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title_override: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="time_blocks")
    assignment: Mapped[Optional["Assignment"]] = relationship("Assignment", back_populates="time_blocks")


class Transaction(Base):
    """Financial transaction for budgeting."""

    __tablename__ = "transactions"
    __table_args__ = (
        Index("idx_transactions_user_date", "user_id", "date"),
        Index("idx_transactions_user_category", "user_id", "category"),
        CheckConstraint(
            "(is_income = TRUE AND amount_signed > 0) OR (is_income = FALSE AND amount_signed <= 0)",
            name="valid_amount_sign",
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    date: Mapped[dt.date] = mapped_column(nullable=False)
    amount_signed: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    merchant: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_income: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_weekly: Mapped[bool] = mapped_column(default=False, nullable=False)
    income_source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="transactions")


class BudgetSettings(Base):
    """Per-user budget configuration (1:1 with users)."""

    __tablename__ = "budget_settings"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    large_expense_threshold: Mapped[Optional[float]] = mapped_column(
        Numeric(10, 2), default=100.00
    )
    weekly_budget_target: Mapped[Optional[float]] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="budget_settings")


class WeeklyPlan(Base):
    """
    Weekly plan document (one per user per week).

    Keyed by week_start (the Monday of each week).
    Content is stored as markdown for the TipTap editor.
    """

    __tablename__ = "weekly_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "week_start", name="unique_user_week_plan"),
        Index("idx_weekly_plans_user_week", "user_id", "week_start"),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    week_start: Mapped[date] = mapped_column(nullable=False)  # Monday of the week
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Markdown
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="weekly_plans")


class PDF(Base):
    """
    PDF file metadata and extracted content.

    Stores reference to S3 file and extracted text for LLM context.
    Can be attached to a class or assignment for organization.
    """

    __tablename__ = "pdfs"
    __table_args__ = (
        Index("idx_pdfs_user_id", "user_id"),
        Index("idx_pdfs_class_id", "class_id"),
        Index("idx_pdfs_assignment_id", "assignment_id"),
        Index("idx_pdfs_s3_key", "s3_key"),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("classes.id", ondelete="SET NULL"), nullable=True
    )
    assignment_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True
    )

    # File metadata
    filename: Mapped[str] = mapped_column(String(), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(
        String(), nullable=False, server_default="application/pdf"
    )
    file_size_bytes: Mapped[Optional[int]] = mapped_column(nullable=True)

    # Extracted content for LLM context
    extracted_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extraction_status: Mapped[str] = mapped_column(
        String(), nullable=False, server_default="pending"
    )
    page_count: Mapped[Optional[int]] = mapped_column(nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="pdfs")
    class_: Mapped[Optional["Class"]] = relationship("Class", back_populates="pdfs")
    assignment: Mapped[Optional["Assignment"]] = relationship("Assignment", back_populates="pdfs")


class ChatConversation(Base):
    """
    Chat conversation with LLM.

    Groups messages and tracks context (PDFs, classes, assignments in scope).
    """

    __tablename__ = "chat_conversations"
    __table_args__ = (Index("idx_chat_conversations_user_id", "user_id"),)

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(
        String(), nullable=False, server_default="New Conversation"
    )

    # Context - what PDFs/classes/assignments are in scope
    context_class_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=False, server_default="{}"
    )
    context_assignment_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=False, server_default="{}"
    )
    context_pdf_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=False, server_default="{}"
    )
    context_note_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=False, server_default="{}"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="chat_conversations")
    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="conversation", cascade="all, delete-orphan"
    )


class ChatMessage(Base):
    """
    Individual message in a chat conversation.

    Stores user messages and assistant responses.
    """

    __tablename__ = "chat_messages"
    __table_args__ = (Index("idx_chat_messages_conversation_id", "conversation_id"),)

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    conversation_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(), nullable=False)  # 'user' or 'assistant'
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    conversation: Mapped["ChatConversation"] = relationship(
        "ChatConversation", back_populates="messages"
    )


class BrainMemory(Base):
    """
    Persistent knowledge base (brain) for LLM context.

    Can be global (user-wide) or class-specific.
    Content is markdown that accumulates learning from conversations and PDFs.
    """

    __tablename__ = "brain_memories"
    __table_args__ = (
        UniqueConstraint("user_id", "class_id", "brain_type", name="unique_user_class_brain"),
        Index("idx_brain_memories_user_id", "user_id"),
        Index("idx_brain_memories_class_id", "class_id"),
    )

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid4
    )
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("classes.id", ondelete="CASCADE"), nullable=True
    )

    # If class_id is NULL, this is the global brain
    brain_type: Mapped[str] = mapped_column(
        String(), nullable=False, server_default="class"
    )  # 'global' or 'class'

    # The actual brain content (Markdown)
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")

    # Metadata
    last_updated_by_conversation_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    update_count: Mapped[int] = mapped_column(nullable=False, server_default="0")

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="brain_memories")
    class_: Mapped[Optional["Class"]] = relationship("Class", back_populates="brain_memories")
