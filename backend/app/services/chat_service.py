"""Chat service with streaming support and context building."""

from uuid import UUID
from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import PDF, Class, Assignment, Note
from app.services.brain_manager import brain_manager

settings = get_settings()


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

        # 1. Load global brain
        global_brain = await brain_manager.get_or_create_brain(db, user_id, None)
        if global_brain.content:
            context_parts.append(f"# Global Knowledge\n{global_brain.content}\n")

        # 2. Load class brains and metadata
        for class_id in class_ids:
            # Get class info
            stmt = select(Class).where(Class.id == class_id, Class.user_id == user_id)
            result = await db.execute(stmt)
            class_obj = result.scalar_one_or_none()

            if class_obj:
                context_parts.append(f"# Class: {class_obj.name}")
                if class_obj.code:
                    context_parts[-1] += f" ({class_obj.code})"
                context_parts[-1] += "\n"

            # Get class brain
            class_brain = await brain_manager.get_or_create_brain(db, user_id, class_id)
            if class_brain.content:
                context_parts.append(f"## Class Brain\n{class_brain.content}\n")

        # 3. Load assignment metadata
        if assignment_ids:
            stmt = select(Assignment).where(
                Assignment.id.in_(assignment_ids), Assignment.user_id == user_id
            )
            result = await db.execute(stmt)
            assignments = result.scalars().all()

            if assignments:
                context_parts.append("# Assignments in Context\n")
                for assignment in assignments:
                    context_parts.append(
                        f"- **{assignment.title}** (Due: {assignment.due_date or 'No due date'})"
                    )
                    if assignment.notes_short:
                        context_parts.append(f"  - Notes: {assignment.notes_short}")
                context_parts.append("\n")

        # 4. Load PDF content
        if pdf_ids:
            stmt = select(PDF).where(PDF.id.in_(pdf_ids), PDF.user_id == user_id)
            result = await db.execute(stmt)
            pdfs = result.scalars().all()

            for pdf in pdfs:
                if pdf.extracted_text:
                    context_parts.append(f"# Document: {pdf.filename}\n")
                    # Limit PDF content to avoid token limits (first 10k chars)
                    pdf_text = pdf.extracted_text[:10000]
                    if len(pdf.extracted_text) > 10000:
                        pdf_text += "\n\n[... content truncated ...]"
                    context_parts.append(f"{pdf_text}\n")

        # 5. Load note content
        if note_ids:
            stmt = select(Note).where(Note.id.in_(note_ids), Note.user_id == user_id)
            result = await db.execute(stmt)
            notes = result.scalars().all()

            for note in notes:
                if note.content_text:
                    context_parts.append(f"# Note: {note.title}\n")
                    # Limit note content to avoid token limits (first 5k chars)
                    note_text = note.content_text[:5000]
                    if len(note.content_text) > 5000:
                        note_text += "\n\n[... content truncated ...]"
                    context_parts.append(f"{note_text}\n")

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
        # Build system prompt with context
        system_prompt = f"""You are a helpful AI tutor assistant for students.

You have access to the following context:

{context}

Use this context to answer questions accurately. Reference specific materials when relevant.
Be concise but thorough. If you don't know something, say so."""

        # Build messages list
        messages = conversation_history + [{"role": "user", "content": user_message}]

        # Stream response from Claude
        try:
            async with self.client.messages.stream(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield text

        except Exception as e:
            yield f"\n\n[Error: {str(e)}]"

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
        system_prompt = f"""You are a helpful AI tutor assistant for students.

You have access to the following context:

{context}

Use this context to answer questions accurately. Reference specific materials when relevant.
Be concise but thorough. If you don't know something, say so."""

        messages = conversation_history + [{"role": "user", "content": user_message}]

        try:
            message = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                system=system_prompt,
                messages=messages,
            )

            return message.content[0].text

        except Exception as e:
            return f"Error: {str(e)}"


# Singleton instance
chat_service = ChatService()
