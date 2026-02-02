"""Add assignment_id to notes table.

Revision ID: 002
Revises: 001_initial
Create Date: 2026-02-01

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add assignment_id column to notes table
    op.add_column(
        "notes",
        sa.Column(
            "assignment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("assignments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Create index for filtering notes by assignment
    op.create_index(
        "idx_notes_user_assignment",
        "notes",
        ["user_id", "assignment_id", "updated_at"],
        postgresql_ops={"updated_at": "DESC"},
    )

    # Create simple index on assignment_id for FK lookups
    op.create_index(
        "idx_notes_assignment_id",
        "notes",
        ["assignment_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_notes_assignment_id", table_name="notes")
    op.drop_index("idx_notes_user_assignment", table_name="notes")
    op.drop_column("notes", "assignment_id")
