"""Add quiz_sessions for Plato.

Revision ID: 011
Revises: 010
Create Date: 2026-09-07

Changes:
- Add quiz_sessions table holding generated questions and graded responses

Note: the per-class quiz brain needs no schema change. brain_memories.brain_type
is an unconstrained string and the unique key is already
(user_id, class_id, brain_type), so 'quiz' slots in beside 'global' and 'class'.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quiz_sessions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "class_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "source_note_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("status", sa.String(), nullable=False, server_default="in_progress"),
        sa.Column(
            "questions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "responses",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("completed_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_quiz_sessions_user_created",
        "quiz_sessions",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_quiz_sessions_user_created", table_name="quiz_sessions")
    op.drop_table("quiz_sessions")
