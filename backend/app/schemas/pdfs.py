"""Pydantic schemas for PDF operations."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.base import BaseSchema, IDMixin, TimestampMixin


# Request schemas
class PDFUploadURLRequest(BaseModel):
    """Request for presigned upload URL."""

    filename: str = Field(..., min_length=1, max_length=255)
    class_id: UUID | None = None
    assignment_id: UUID | None = None


# Response schemas
class PDFUploadURLResponse(BaseModel):
    """Response with presigned upload URL."""

    upload_url: str
    fields: dict
    pdf_id: UUID


class PDFBase(BaseSchema):
    """Base PDF schema."""

    filename: str
    s3_key: str
    content_type: str
    file_size_bytes: int | None = None
    extraction_status: str
    page_count: int | None = None
    class_id: UUID | None = None
    assignment_id: UUID | None = None


class PDFResponse(PDFBase, IDMixin, TimestampMixin):
    """Full PDF response."""

    user_id: UUID


class PDFWithText(PDFResponse):
    """PDF response including extracted text."""

    extracted_text: str | None = None


class PDFProcessResponse(BaseModel):
    """Response from PDF processing."""

    status: str
    page_count: int
    text_length: int | None = None


class PDFListResponse(BaseModel):
    """List of PDFs."""

    pdfs: list[PDFResponse]
    total: int
