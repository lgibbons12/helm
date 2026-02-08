"""Brain memory management service for LLM context."""

from uuid import UUID
from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import BrainMemory, ChatConversation

settings = get_settings()


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

        # Use last 10 messages for context (avoid token limits)
        recent_messages = conversation_history[-10:]

        # Call Claude to analyze
        try:
            message = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                system=system_prompt,
                messages=recent_messages,
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
            print(f"Brain update failed: {str(e)}")
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

        # Update every 5 user messages
        return user_message_count > 0 and user_message_count % 5 == 0

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
