"""Pydantic schemas for chat operations."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.base import BaseSchema, IDMixin, TimestampMixin


# Request schemas
class ConversationCreateRequest(BaseModel):
    """Request to create a new conversation."""

    title: str | None = "New Conversation"
    context_class_ids: list[UUID] = Field(default_factory=list)
    context_assignment_ids: list[UUID] = Field(default_factory=list)
    context_pdf_ids: list[UUID] = Field(default_factory=list)
    context_note_ids: list[UUID] = Field(default_factory=list)


class ChatMessageRequest(BaseModel):
    """Request to send a chat message."""

    message: str = Field(..., min_length=1, max_length=10000)


class ConversationUpdateContextRequest(BaseModel):
    """Request to update conversation context."""

    context_class_ids: list[UUID] | None = None
    context_assignment_ids: list[UUID] | None = None
    context_pdf_ids: list[UUID] | None = None
    context_note_ids: list[UUID] | None = None


# Response schemas
class ChatMessageResponse(BaseSchema, IDMixin):
    """Chat message response."""

    conversation_id: UUID
    role: str
    content: str
    created_at: datetime


class ConversationResponse(BaseSchema, IDMixin, TimestampMixin):
    """Conversation response."""

    user_id: UUID
    title: str
    context_class_ids: list[UUID]
    context_assignment_ids: list[UUID]
    context_pdf_ids: list[UUID]
    context_note_ids: list[UUID]


class ConversationWithMessages(ConversationResponse):
    """Conversation with message history."""

    messages: list[ChatMessageResponse]


class ConversationListResponse(BaseModel):
    """List of conversations."""

    conversations: list[ConversationResponse]
    total: int


class BrainResponse(BaseSchema):
    """Brain memory response."""

    content: str
    update_count: int
    brain_type: str
    class_id: UUID | None = None
    last_updated_by_conversation_id: UUID | None = None
    updated_at: datetime
