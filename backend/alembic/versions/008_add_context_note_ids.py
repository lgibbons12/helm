"""Add context_note_ids to chat_conversations.

Revision ID: 008
Revises: 007
Create Date: 2026-02-08

Changes:
- Add context_note_ids ARRAY(UUID) column to chat_conversations
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, ARRAY

# revision identifiers, used by Alembic.
revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_conversations",
        sa.Column(
            "context_note_ids",
            ARRAY(UUID(as_uuid=True)),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("chat_conversations", "context_note_ids")
