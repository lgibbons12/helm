"""Add PDFs, chat, and brain memory tables.

Revision ID: 007
Revises: 006
Create Date: 2026-02-08

Changes:
- Create pdfs table for storing PDF metadata and extracted content
- Create chat_conversations table for chat sessions
- Create chat_messages table for conversation history
- Create brain_memories table for LLM-generated knowledge base
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, ARRAY

# revision identifiers, used by Alembic.
revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ==========================================================================
    # PDFS TABLE
    # ==========================================================================
    op.create_table(
        "pdfs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", UUID(as_uuid=True), sa.ForeignKey("classes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assignment_id", UUID(as_uuid=True), sa.ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True),

        # File metadata
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("s3_key", sa.String(), nullable=False, unique=True),
        sa.Column("content_type", sa.String(), nullable=False, server_default="application/pdf"),
        sa.Column("file_size_bytes", sa.Integer(), nullable=True),

        # Extracted content for LLM context
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("extraction_status", sa.String(), nullable=False, server_default="pending"),  # pending, success, failed
        sa.Column("page_count", sa.Integer(), nullable=True),

        # Timestamps
        sa.Column("created_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Indexes for PDFs
    op.create_index("idx_pdfs_user_id", "pdfs", ["user_id"])
    op.create_index("idx_pdfs_class_id", "pdfs", ["class_id"])
    op.create_index("idx_pdfs_assignment_id", "pdfs", ["assignment_id"])
    op.create_index("idx_pdfs_s3_key", "pdfs", ["s3_key"])

    # ==========================================================================
    # CHAT CONVERSATIONS TABLE
    # ==========================================================================
    op.create_table(
        "chat_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default="New Conversation"),

        # Context - what PDFs/classes/assignments are in scope
        sa.Column("context_class_ids", ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"),
        sa.Column("context_assignment_ids", ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"),
        sa.Column("context_pdf_ids", ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}"),

        # Timestamps
        sa.Column("created_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Indexes for chat conversations
    op.create_index("idx_chat_conversations_user_id", "chat_conversations", ["user_id"])

    # ==========================================================================
    # CHAT MESSAGES TABLE
    # ==========================================================================
    op.create_table(
        "chat_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(), nullable=False),  # 'user' or 'assistant'
        sa.Column("content", sa.Text(), nullable=False),

        # Timestamp
        sa.Column("created_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Indexes for chat messages
    op.create_index("idx_chat_messages_conversation_id", "chat_messages", ["conversation_id"])

    # ==========================================================================
    # BRAIN MEMORIES TABLE
    # ==========================================================================
    op.create_table(
        "brain_memories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", UUID(as_uuid=True), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=True),

        # If class_id is NULL, this is the global brain
        sa.Column("brain_type", sa.String(), nullable=False, server_default="class"),  # 'global' or 'class'

        # The actual brain content (Markdown)
        sa.Column("content", sa.Text(), nullable=False, server_default=""),

        # Metadata
        sa.Column("last_updated_by_conversation_id", UUID(as_uuid=True), nullable=True),
        sa.Column("update_count", sa.Integer(), nullable=False, server_default="0"),

        # Timestamps
        sa.Column("created_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Unique constraint: one global brain per user, one class brain per (user, class)
    op.create_unique_constraint(
        "unique_user_class_brain",
        "brain_memories",
        ["user_id", "class_id", "brain_type"],
    )

    # Indexes for brain memories
    op.create_index("idx_brain_memories_user_id", "brain_memories", ["user_id"])
    op.create_index("idx_brain_memories_class_id", "brain_memories", ["class_id"])


def downgrade() -> None:
    # Drop brain_memories table
    op.drop_index("idx_brain_memories_class_id", table_name="brain_memories")
    op.drop_index("idx_brain_memories_user_id", table_name="brain_memories")
    op.drop_constraint("unique_user_class_brain", "brain_memories", type_="unique")
    op.drop_table("brain_memories")

    # Drop chat_messages table
    op.drop_index("idx_chat_messages_conversation_id", table_name="chat_messages")
    op.drop_table("chat_messages")

    # Drop chat_conversations table
    op.drop_index("idx_chat_conversations_user_id", table_name="chat_conversations")
    op.drop_table("chat_conversations")

    # Drop pdfs table
    op.drop_index("idx_pdfs_s3_key", table_name="pdfs")
    op.drop_index("idx_pdfs_assignment_id", table_name="pdfs")
    op.drop_index("idx_pdfs_class_id", table_name="pdfs")
    op.drop_index("idx_pdfs_user_id", table_name="pdfs")
    op.drop_table("pdfs")
