"""Chat service with streaming support and context building."""

import asyncio
import logging
from datetime import date, timedelta
from pathlib import Path
from uuid import UUID
from anthropic import AsyncAnthropic, APIConnectionError, RateLimitError, APIStatusError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings, sanitize_error
from app.db.models import PDF, Class, Assignment, Note
from app.services.brain_manager import brain_manager

logger = logging.getLogger(__name__)
settings = get_settings()


def _load_soul() -> str:
    """Load the SOUL.md persona file for the system prompt."""
    soul_path = Path(__file__).parent.parent.parent / "SOUL.md"
    try:
        return soul_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("SOUL.md not found at %s, using fallback persona", soul_path)
        return "You are Odin, a strategic academic advisor. Be direct, deadline-aware, and action-oriented."


# Load once at module import
_SOUL_PROMPT = _load_soul()

# Transient error types that warrant retrying
_RETRYABLE_ERRORS = (APIConnectionError, RateLimitError)


class ChatService:
    """Service for handling LLM chat with context from brains and PDFs."""

    def __init__(self):
        """Initialize Anthropic client."""
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def build_context(
        self,
        db: AsyncSession,
        user_id: UUID,
        class_ids: list[UUID],
        assignment_ids: list[UUID],
        pdf_ids: list[UUID],
        note_ids: list[UUID] | None = None,
    ) -> str:
        """
        Build context string from PDFs, notes, and brains.

        Args:
            db: Database session
            user_id: User ID
            class_ids: List of class IDs in scope
            assignment_ids: List of assignment IDs in scope
            pdf_ids: List of PDF IDs in scope
            note_ids: List of note IDs in scope

        Returns:
            Combined context string as markdown
        """
        context_parts = []
        total_chars = 0
        max_total = settings.max_total_context_chars

        def _add_part(part: str) -> bool:
            """Add a context part if within the total character budget. Returns False if budget exhausted."""
            nonlocal total_chars
            if total_chars + len(part) > max_total:
                return False
            context_parts.append(part)
            total_chars += len(part)
            return True

        # 1. Load global brain
        global_brain = await brain_manager.get_or_create_brain(db, user_id, None)
        if global_brain.content:
            _add_part(f"# Global Knowledge\n{global_brain.content}\n")

        # 2. Load class brains and metadata
        for class_id in class_ids:
            if total_chars >= max_total:
                break

            # Get class info
            stmt = select(Class).where(Class.id == class_id, Class.user_id == user_id)
            result = await db.execute(stmt)
            class_obj = result.scalar_one_or_none()

            if class_obj:
                header = f"# Class: {class_obj.name}"
                if class_obj.code:
                    header += f" ({class_obj.code})"
                header += "\n"
                _add_part(header)

            # Get class brain
            class_brain = await brain_manager.get_or_create_brain(db, user_id, class_id)
            if class_brain.content:
                _add_part(f"## Class Brain\n{class_brain.content}\n")

        # 3. Load assignment metadata
        if assignment_ids and total_chars < max_total:
            stmt = select(Assignment).where(
                Assignment.id.in_(assignment_ids), Assignment.user_id == user_id
            )
            result = await db.execute(stmt)
            assignments = result.scalars().all()

            if assignments:
                assignment_parts = ["# Assignments in Context\n"]
                for assignment in assignments:
                    assignment_parts.append(
                        f"- **{assignment.title}** (Due: {assignment.due_date or 'No due date'})"
                    )
                    if assignment.notes_short:
                        assignment_parts.append(f"  - Notes: {assignment.notes_short}")
                assignment_parts.append("\n")
                _add_part("\n".join(assignment_parts))

        # 4. Load PDF content
        if pdf_ids and total_chars < max_total:
            stmt = select(PDF).where(PDF.id.in_(pdf_ids), PDF.user_id == user_id)
            result = await db.execute(stmt)
            pdfs = result.scalars().all()

            for pdf in pdfs:
                if total_chars >= max_total:
                    break
                if pdf.extracted_text:
                    # Limit individual PDF content
                    pdf_text = pdf.extracted_text[:settings.pdf_context_max_chars]
                    if len(pdf.extracted_text) > settings.pdf_context_max_chars:
                        pdf_text += "\n\n[... content truncated ...]"
                    _add_part(f"# Document: {pdf.filename}\n{pdf_text}\n")

        # 5. Load note content
        if note_ids and total_chars < max_total:
            stmt = select(Note).where(Note.id.in_(note_ids), Note.user_id == user_id)
            result = await db.execute(stmt)
            notes = result.scalars().all()

            for note in notes:
                if total_chars >= max_total:
                    break
                if note.content_text:
                    # Limit individual note content
                    note_text = note.content_text[:settings.note_context_max_chars]
                    if len(note.content_text) > settings.note_context_max_chars:
                        note_text += "\n\n[... content truncated ...]"
                    _add_part(f"# Note: {note.title}\n{note_text}\n")

        if total_chars >= max_total:
            context_parts.append("\n\n[... additional context omitted due to size limits ...]")

        return "\n\n".join(context_parts) if context_parts else "No context available."

    async def stream_response(
        self,
        user_message: str,
        conversation_history: list[dict],
        context: str,
    ):
        """
        Stream Claude response using async generator.

        Args:
            user_message: Current user message
            conversation_history: Previous messages (list of dicts with 'role' and 'content')
            context: Context string built from brains and PDFs

        Yields:
            Text chunks from Claude's streaming response
        """
        # Build system prompt from SOUL.md persona + injected context
        system_prompt = f"""{_SOUL_PROMPT}

---

## Active Context

{context}

---

Use the active context above to ground your responses. Reference specific materials, deadlines, and assignments when relevant."""

        # Build messages list
        messages = conversation_history + [{"role": "user", "content": user_message}]

        # Stream response from Claude (with retry for transient connection errors)
        max_attempts = 3
        last_error = None

        for attempt in range(max_attempts):
            try:
                async with self.client.messages.stream(
                    model=settings.llm_model,
                    max_tokens=settings.llm_max_tokens,
                    system=system_prompt,
                    messages=messages,
                ) as stream:
                    async for text in stream.text_stream:
                        yield text
                return  # Success, exit the retry loop

            except _RETRYABLE_ERRORS as e:
                last_error = e
                if attempt < max_attempts - 1:
                    delay = 1.0 * (2 ** attempt)
                    logger.warning(
                        "Anthropic stream transient error (attempt %d/%d), retrying in %.1fs: %s",
                        attempt + 1, max_attempts, delay, str(e),
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.exception("LLM streaming failed after %d attempts", max_attempts)
                    safe_msg = sanitize_error(e, generic_message="An error occurred while generating the response.")
                    yield f"\n\n[Error: {safe_msg}]"

            except Exception as e:
                logger.exception("Error during LLM streaming response")
                safe_msg = sanitize_error(e, generic_message="An error occurred while generating the response.")
                yield f"\n\n[Error: {safe_msg}]"
                return  # Non-retryable error

    async def get_full_response(
        self,
        user_message: str,
        conversation_history: list[dict],
        context: str,
    ) -> str:
        """
        Get non-streaming response (useful for testing or background tasks).

        Args:
            user_message: Current user message
            conversation_history: Previous messages
            context: Context string

        Returns:
            Full response text
        """
        system_prompt = f"""{_SOUL_PROMPT}

---

## Active Context

{context}

---

Use the active context above to ground your responses. Reference specific materials, deadlines, and assignments when relevant."""

        messages = conversation_history + [{"role": "user", "content": user_message}]

        max_attempts = 3
        last_error = None

        for attempt in range(max_attempts):
            try:
                message = await self.client.messages.create(
                    model=settings.llm_model,
                    max_tokens=settings.llm_max_tokens,
                    system=system_prompt,
                    messages=messages,
                )
                return message.content[0].text

            except _RETRYABLE_ERRORS as e:
                last_error = e
                if attempt < max_attempts - 1:
                    delay = 1.0 * (2 ** attempt)
                    logger.warning(
                        "Anthropic API transient error (attempt %d/%d), retrying in %.1fs: %s",
                        attempt + 1, max_attempts, delay, str(e),
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.exception("LLM full response failed after %d attempts", max_attempts)
                    safe_msg = sanitize_error(e, generic_message="An error occurred while generating the response.")
                    return f"Error: {safe_msg}"

            except Exception as e:
                logger.exception("Error during LLM full response")
                safe_msg = sanitize_error(e, generic_message="An error occurred while generating the response.")
                return f"Error: {safe_msg}"

        # Should not reach here, but just in case
        safe_msg = sanitize_error(last_error, generic_message="An error occurred while generating the response.")
        return f"Error: {safe_msg}"


# Singleton instance
chat_service = ChatService()
