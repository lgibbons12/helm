"""API routes for chat conversations with streaming support."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func
from sse_starlette.sse import EventSourceResponse

from app.api.deps import CurrentUser, DbSession, get_user_resource_or_404
from app.db.models import ChatConversation, ChatMessage, BrainMemory
from app.schemas.chat import (
    ConversationCreateRequest,
    ConversationResponse,
    ConversationWithMessages,
    ConversationListResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    BrainResponse,
    ConversationUpdateContextRequest,
)
from app.services import chat_service, brain_manager

router = APIRouter(prefix="/chat", tags=["chat"])


# =============================================================================
# CONVERSATION MANAGEMENT
# =============================================================================


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    request: ConversationCreateRequest,
    db: DbSession,
    user: CurrentUser,
):
    """
    Create a new chat conversation.

    Specify context (classes, assignments, PDFs) that will be included
    in the LLM context for this conversation.
    """
    conversation = ChatConversation(
        user_id=user.id,
        title=request.title or "New Conversation",
        context_class_ids=request.context_class_ids,
        context_assignment_ids=request.context_assignment_ids,
        context_pdf_ids=request.context_pdf_ids,
        context_note_ids=request.context_note_ids,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)

    return ConversationResponse.model_validate(conversation)


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    db: DbSession,
    user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
):
    """List user's conversations, ordered by most recent."""
    # Get total count
    count_stmt = select(func.count()).select_from(ChatConversation).where(
        ChatConversation.user_id == user.id
    )
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    # Get conversations
    stmt = (
        select(ChatConversation)
        .where(ChatConversation.user_id == user.id)
        .order_by(ChatConversation.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    conversations = result.scalars().all()

    return ConversationListResponse(
        conversations=[ConversationResponse.model_validate(c) for c in conversations],
        total=total,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationWithMessages)
async def get_conversation(
    conversation_id: UUID,
    db: DbSession,
    user: CurrentUser,
):
    """Get conversation with full message history."""
    # Get conversation
    conversation = await get_user_resource_or_404(
        db, ChatConversation, conversation_id, user.id
    )

    # Get messages
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    # Build response
    return ConversationWithMessages(
        **ConversationResponse.model_validate(conversation).model_dump(),
        messages=[ChatMessageResponse.model_validate(m) for m in messages],
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation_context(
    conversation_id: UUID,
    request: ConversationUpdateContextRequest,
    db: DbSession,
    user: CurrentUser,
):
    """Update conversation context (classes, assignments, PDFs in scope)."""
    conversation = await get_user_resource_or_404(
        db, ChatConversation, conversation_id, user.id
    )

    # Update fields that are provided
    if request.context_class_ids is not None:
        conversation.context_class_ids = request.context_class_ids
    if request.context_assignment_ids is not None:
        conversation.context_assignment_ids = request.context_assignment_ids
    if request.context_pdf_ids is not None:
        conversation.context_pdf_ids = request.context_pdf_ids
    if request.context_note_ids is not None:
        conversation.context_note_ids = request.context_note_ids

    await db.commit()
    await db.refresh(conversation)

    return ConversationResponse.model_validate(conversation)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    db: DbSession,
    user: CurrentUser,
):
    """Delete conversation and all its messages."""
    conversation = await get_user_resource_or_404(
        db, ChatConversation, conversation_id, user.id
    )

    await db.delete(conversation)
    await db.commit()

    return None


# =============================================================================
# CHAT STREAMING
# =============================================================================


@router.post("/conversations/{conversation_id}/messages/stream")
async def stream_chat_message(
    conversation_id: UUID,
    request: ChatMessageRequest,
    db: DbSession,
    user: CurrentUser,
):
    """
    Send a chat message and stream the response using Server-Sent Events (SSE).

    Events:
    - 'message': Text chunks from the assistant
    - 'done': Streaming complete
    - 'error': Error occurred

    After streaming completes, the brain may be automatically updated
    if patterns are detected (every 5 messages or on memory keywords).
    """
    # Get conversation
    conversation = await get_user_resource_or_404(
        db, ChatConversation, conversation_id, user.id
    )

    # Build context from classes, assignments, and PDFs
    context = await chat_service.build_context(
        db=db,
        user_id=user.id,
        class_ids=conversation.context_class_ids,
        assignment_ids=conversation.context_assignment_ids,
        pdf_ids=conversation.context_pdf_ids,
        note_ids=conversation.context_note_ids,
    )

    # Get conversation history
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    history = [{"role": msg.role, "content": msg.content} for msg in messages]

    # Save user message
    user_message = ChatMessage(
        conversation_id=conversation_id,
        role="user",
        content=request.message,
    )
    db.add(user_message)
    await db.commit()

    async def event_generator():
        """Generate SSE events for streaming response."""
        full_response = ""

        try:
            # Stream response from LLM
            async for chunk in chat_service.stream_response(
                user_message=request.message,
                conversation_history=history,
                context=context,
            ):
                full_response += chunk
                yield {"event": "message", "data": chunk}

            # Save assistant response
            assistant_message = ChatMessage(
                conversation_id=conversation_id,
                role="assistant",
                content=full_response,
            )
            db.add(assistant_message)
            await db.commit()

            # Update conversation timestamp
            await db.refresh(conversation)

            # Build updated history for brain update
            updated_history = history + [
                {"role": "user", "content": request.message},
                {"role": "assistant", "content": full_response},
            ]

            # Check if we should update brains
            should_update = await brain_manager.detect_pattern_update(updated_history)

            if should_update:
                # Update class brains
                for class_id in conversation.context_class_ids:
                    try:
                        brain = await brain_manager.get_or_create_brain(db, user.id, class_id)
                        await brain_manager.update_brain_after_conversation(
                            db=db,
                            brain=brain,
                            conversation_history=updated_history,
                            conversation_id=conversation.id,
                        )
                    except Exception as e:
                        print(f"Failed to update class brain {class_id}: {str(e)}")

                # Update global brain
                try:
                    global_brain = await brain_manager.get_or_create_brain(db, user.id, None)
                    await brain_manager.update_brain_after_conversation(
                        db=db,
                        brain=global_brain,
                        conversation_history=updated_history,
                        conversation_id=conversation.id,
                    )
                except Exception as e:
                    print(f"Failed to update global brain: {str(e)}")

            yield {"event": "done", "data": ""}

        except Exception as e:
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(event_generator())


# =============================================================================
# BRAIN MANAGEMENT
# =============================================================================


@router.post("/conversations/{conversation_id}/update-brain")
async def manually_update_brain(
    conversation_id: UUID,
    db: DbSession,
    user: CurrentUser,
):
    """
    Manually trigger brain update for a conversation.

    Use this to force a brain update without waiting for automatic triggers.
    """
    # Get conversation
    conversation = await get_user_resource_or_404(
        db, ChatConversation, conversation_id, user.id
    )

    # Get conversation history
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    history = [{"role": msg.role, "content": msg.content} for msg in messages]

    # Update all relevant brains
    updated_brains = []

    # Update class brains
    for class_id in conversation.context_class_ids:
        brain = await brain_manager.get_or_create_brain(db, user.id, class_id)
        await brain_manager.update_brain_after_conversation(
            db=db,
            brain=brain,
            conversation_history=history,
            conversation_id=conversation.id,
        )
        updated_brains.append({"brain_type": "class", "class_id": str(class_id)})

    # Update global brain
    global_brain = await brain_manager.get_or_create_brain(db, user.id, None)
    await brain_manager.update_brain_after_conversation(
        db=db,
        brain=global_brain,
        conversation_history=history,
        conversation_id=conversation.id,
    )
    updated_brains.append({"brain_type": "global", "class_id": None})

    return {"status": "updated", "brains": updated_brains}


@router.get("/brains/global", response_model=BrainResponse)
async def get_global_brain(
    db: DbSession,
    user: CurrentUser,
):
    """Get global brain content (user-wide knowledge)."""
    brain = await brain_manager.get_or_create_brain(db, user.id, None)
    return BrainResponse.model_validate(brain)


@router.get("/brains/class/{class_id}", response_model=BrainResponse)
async def get_class_brain(
    class_id: UUID,
    db: DbSession,
    user: CurrentUser,
):
    """Get class-specific brain content."""
    brain = await brain_manager.get_or_create_brain(db, user.id, class_id)
    return BrainResponse.model_validate(brain)


@router.get("/brains", response_model=list[BrainResponse])
async def list_brains(
    db: DbSession,
    user: CurrentUser,
):
    """List all brains for the user (global + all class brains)."""
    stmt = select(BrainMemory).where(BrainMemory.user_id == user.id)
    result = await db.execute(stmt)
    brains = result.scalars().all()

    return [BrainResponse.model_validate(brain) for brain in brains]
