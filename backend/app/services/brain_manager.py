"""Brain memory management service for LLM context."""

import asyncio
import logging
from uuid import UUID
from anthropic import AsyncAnthropic, APIConnectionError, RateLimitError, APIStatusError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import BrainMemory, ChatConversation

logger = logging.getLogger(__name__)
settings = get_settings()

# Transient error types that warrant retrying
_RETRYABLE_ERRORS = (APIConnectionError, RateLimitError)


async def _retry_anthropic(coro_factory, *, max_attempts: int = 3, base_delay: float = 1.0):
    """
    Retry an Anthropic API call with exponential backoff.

    Args:
        coro_factory: Callable that returns a new coroutine each invocation.
        max_attempts: Maximum number of attempts.
        base_delay: Base delay in seconds (doubles each retry).

    Returns:
        The result of the coroutine.
    """
    last_error = None
    for attempt in range(max_attempts):
        try:
            return await coro_factory()
        except _RETRYABLE_ERRORS as e:
            last_error = e
            if attempt < max_attempts - 1:
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    "Anthropic API transient error (attempt %d/%d), retrying in %.1fs: %s",
                    attempt + 1, max_attempts, delay, str(e),
                )
                await asyncio.sleep(delay)
            else:
                raise
        except APIStatusError as e:
            # Non-retryable server errors (4xx except rate limit, 5xx that aren't transient)
            if e.status_code == 529:  # Overloaded
                last_error = e
                if attempt < max_attempts - 1:
                    delay = base_delay * (2 ** attempt)
                    logger.warning(
                        "Anthropic API overloaded (attempt %d/%d), retrying in %.1fs",
                        attempt + 1, max_attempts, delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    raise
            else:
                raise
    raise last_error  # Should never reach here


class BrainManager:
    """Manages persistent brain memories for user context."""

    def __init__(self):
        """Initialize Anthropic client."""
        self.client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def get_or_create_brain(
        self,
        db: AsyncSession,
        user_id: UUID,
        class_id: UUID | None = None,
    ) -> BrainMemory:
        """
        Get existing brain or create new one.

        Args:
            db: Database session
            user_id: User ID
            class_id: Optional class ID (None for global brain)

        Returns:
            BrainMemory instance
        """
        # Determine brain type
        brain_type = "global" if class_id is None else "class"

        # Try to fetch existing brain
        stmt = select(BrainMemory).where(
            BrainMemory.user_id == user_id,
            BrainMemory.class_id == class_id,
            BrainMemory.brain_type == brain_type,
        )
        result = await db.execute(stmt)
        brain = result.scalar_one_or_none()

        # Create if doesn't exist
        if brain is None:
            brain = BrainMemory(
                user_id=user_id,
                class_id=class_id,
                brain_type=brain_type,
                content="",
                update_count=0,
            )
            db.add(brain)
            await db.commit()
            await db.refresh(brain)

        return brain

    async def update_brain_after_conversation(
        self,
        db: AsyncSession,
        brain: BrainMemory,
        conversation_history: list[dict],
        conversation_id: UUID,
    ) -> str:
        """
        Analyze conversation and update brain with Claude.

        Args:
            db: Database session
            brain: BrainMemory to update
            conversation_history: List of message dicts with 'role' and 'content'
            conversation_id: ID of the conversation triggering this update

        Returns:
            Updated brain content
        """
        # Prepare prompt for Claude to analyze and update brain
        current_content = brain.content if brain.content else "No existing knowledge yet."

        system_prompt = f"""You are a memory system for a student assistant.

Current brain content:
{current_content}

Analyze the conversation and update the brain with:
- New concepts or topics learned
- Preferences or patterns (study habits, question types)
- Recurring questions or difficulties
- Important insights

Return ONLY the updated brain content as Markdown. Be concise and organized.
If there's no new information worth remembering, return the current content unchanged."""

        # Use last N messages for context (avoid token limits)
        recent_messages = conversation_history[-settings.brain_history_window:]

        # Call Claude to analyze (with retry for transient errors)
        try:
            message = await _retry_anthropic(
                lambda: self.client.messages.create(
                    model=settings.llm_model,
                    max_tokens=settings.llm_brain_max_tokens,
                    system=system_prompt,
                    messages=recent_messages,
                )
            )

            updated_content = message.content[0].text

            # Save updated brain
            brain.content = updated_content
            brain.update_count += 1
            brain.last_updated_by_conversation_id = conversation_id

            await db.commit()
            await db.refresh(brain)

            return updated_content

        except Exception as e:
            # Log error but don't fail - brain updates are not critical
            logger.exception("Brain update failed for brain_id=%s", brain.id)
            return brain.content

    async def detect_pattern_update(
        self,
        conversation_history: list[dict],
    ) -> bool:
        """
        Detect if a pattern has emerged that warrants brain update.

        Args:
            conversation_history: List of message dicts

        Returns:
            True if brain should be updated, False otherwise
        """
        if not conversation_history:
            return False

        # Count user messages only
        user_message_count = sum(1 for msg in conversation_history if msg["role"] == "user")

        # Check for explicit memory triggers in last message
        last_message = conversation_history[-1]["content"].lower()
        memory_keywords = ["remember", "important", "always", "prefer", "don't forget"]

        if any(keyword in last_message for keyword in memory_keywords):
            return True

        # Update every N user messages
        return user_message_count > 0 and user_message_count % settings.brain_update_message_interval == 0

    async def get_brain_summary(
        self,
        db: AsyncSession,
        user_id: UUID,
        class_id: UUID | None = None,
    ) -> str:
        """
        Get a readable summary of brain content.

        Args:
            db: Database session
            user_id: User ID
            class_id: Optional class ID

        Returns:
            Brain content as markdown string
        """
        brain = await self.get_or_create_brain(db, user_id, class_id)

        if not brain.content:
            return "No knowledge stored yet."

        return brain.content


# Singleton instance
brain_manager = BrainManager()
