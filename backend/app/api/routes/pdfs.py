"""API routes for PDF upload and management."""

import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.config import sanitize_error
from app.db.models import PDF

logger = logging.getLogger(__name__)
from app.schemas.pdfs import (
    PDFUploadURLRequest,
    PDFUploadURLResponse,
    PDFResponse,
    PDFWithText,
    PDFProcessResponse,
    PDFListResponse,
)
from app.services import s3_service, pdf_processor

router = APIRouter(prefix="/pdfs", tags=["pdfs"])


# =============================================================================
# PDF UPLOAD
# =============================================================================


@router.post("/upload-url", response_model=PDFUploadURLResponse)
async def get_upload_url(
    request: PDFUploadURLRequest,
    db: DbSession,
    user: CurrentUser,
):
    """
    Generate presigned URL for direct PDF upload to S3.

    Flow:
    1. Client calls this endpoint with filename
    2. Server creates PDF record (status='pending') and generates presigned URL
    3. Client uploads file directly to S3 using presigned URL
    4. Client calls /pdfs/{pdf_id}/process to extract text
    """
    # Generate unique S3 key
    file_key = f"users/{user.id}/pdfs/{uuid4()}_{request.filename}"

    # Get presigned URL from S3
    presigned = await s3_service.generate_presigned_upload_url(
        file_key=file_key,
        content_type="application/pdf",
    )

    # Create PDF record in database (status='pending')
    pdf = PDF(
        user_id=user.id,
        filename=request.filename,
        s3_key=file_key,
        content_type="application/pdf",
        class_id=request.class_id,
        assignment_id=request.assignment_id,
        extraction_status="pending",
    )
    db.add(pdf)
    await db.commit()
    await db.refresh(pdf)

    return PDFUploadURLResponse(
        upload_url=presigned["url"],
        fields=presigned["fields"],
        pdf_id=pdf.id,
    )


@router.post("/{pdf_id}/process", response_model=PDFProcessResponse)
async def process_pdf(
    pdf_id: UUID,
    db: DbSession,
    user: CurrentUser,
):
    """
    Extract text from uploaded PDF.

    Call this after successfully uploading file to S3 using presigned URL.
    This downloads the PDF from S3, extracts text, and updates the database.
    """
    # Get PDF record (with ownership check)
    pdf = await get_user_resource_or_404(db, PDF, pdf_id, user.id)

    # Check if already processed
    if pdf.extraction_status == "success":
        return PDFProcessResponse(
            status="already_processed",
            page_count=pdf.page_count or 0,
            text_length=len(pdf.extracted_text) if pdf.extracted_text else 0,
        )

    try:
        # Download from S3
        logger.info("Downloading PDF from S3: %s", pdf.s3_key)
        pdf_bytes = await s3_service.download_pdf(pdf.s3_key)
        logger.info("Downloaded %d bytes from S3", len(pdf_bytes))

        # Update file size
        pdf.file_size_bytes = len(pdf_bytes)

        # Validate the file is actually a valid PDF
        is_valid = await pdf_processor.validate_pdf(pdf_bytes)
        if not is_valid:
            logger.error("File is not a valid PDF: %s", pdf.filename)
            pdf.extraction_status = "failed"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded file is not a valid PDF.",
            )

        # Extract text
        logger.info("Extracting text from PDF: %s", pdf.filename)
        result = await pdf_processor.extract_text(pdf_bytes)

        # Check if extraction itself reported failure
        if result["status"] == "failed":
            error_msg = result.get("error", "unknown extraction error")
            logger.error("PDF text extraction failed for %s: %s", pdf.filename, error_msg)
            pdf.extraction_status = "failed"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Text extraction failed: {sanitize_error(Exception(error_msg), generic_message='Text extraction failed.')}",
            )

        # Update PDF record
        pdf.extracted_text = result["text"]
        pdf.page_count = result["page_count"]
        pdf.extraction_status = result["status"]

        await db.commit()
        await db.refresh(pdf)

        logger.info(
            "PDF processed successfully: %s (%d pages, %d chars)",
            pdf.filename,
            result["page_count"],
            len(result["text"]) if result["text"] else 0,
        )

        return PDFProcessResponse(
            status=result["status"],
            page_count=result["page_count"],
            text_length=len(result["text"]) if result["text"] else 0,
        )

    except HTTPException:
        raise  # Re-raise HTTP exceptions (like the extraction failure above)

    except Exception as e:
        # Mark as failed
        logger.error("Failed to process PDF %s: %s", pdf.filename, str(e), exc_info=True)
        pdf.extraction_status = "failed"
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error(e, generic_message="Failed to process PDF."),
        )


# =============================================================================
# PDF MANAGEMENT
# =============================================================================


@router.get("/", response_model=PDFListResponse)
async def list_pdfs(
    db: DbSession,
    user: CurrentUser,
    class_id: UUID | None = None,
    assignment_id: UUID | None = None,
    skip: int = 0,
    limit: int = 100,
):
    """
    List user's PDFs with optional filtering.

    Query parameters:
    - class_id: Filter by class
    - assignment_id: Filter by assignment
    - skip: Pagination offset
    - limit: Max results (default 100)
    """
    # Build query
    query = select(PDF).where(PDF.user_id == user.id)

    if class_id is not None:
        query = query.where(PDF.class_id == class_id)

    if assignment_id is not None:
        query = query.where(PDF.assignment_id == assignment_id)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get paginated results
    query = query.order_by(PDF.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    pdfs = result.scalars().all()

    return PDFListResponse(
        pdfs=[PDFResponse.model_validate(pdf) for pdf in pdfs],
        total=total,
    )


@router.get("/{pdf_id}", response_model=PDFWithText)
async def get_pdf(
    pdf_id: UUID,
    db: DbSession,
    user: CurrentUser,
):
    """Get PDF details including extracted text."""
    pdf = await get_user_resource_or_404(db, PDF, pdf_id, user.id)
    return PDFWithText.model_validate(pdf)


@router.delete("/{pdf_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pdf(
    pdf_id: UUID,
    db: DbSession,
    user: CurrentUser,
):
    """
    Delete PDF from both S3 and database.

    Deletes from S3 first, then from the database. If S3 deletion fails,
    the database record is preserved to avoid orphaning S3 files.

    Returns 204 No Content on success.
    """
    # Get PDF record (with ownership check)
    pdf = await get_user_resource_or_404(db, PDF, pdf_id, user.id)

    # Delete from S3 first to avoid orphaning files
    try:
        await s3_service.delete_pdf(pdf.s3_key)
    except Exception as e:
        logger.error("Failed to delete from S3 (key=%s): %s", pdf.s3_key, str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=sanitize_error(e, generic_message="Failed to delete PDF file from storage."),
        )

    # Only delete from database after successful S3 deletion
    await db.delete(pdf)
    await db.commit()

    return None
