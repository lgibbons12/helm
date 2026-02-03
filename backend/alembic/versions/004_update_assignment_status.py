"""Update assignment_status enum to 4 options.

Revision ID: 004
Revises: 003
Create Date: 2026-02-02

Changes:
- Add 'almost_done' value to assignment_status enum
- Add 'finished' value to assignment_status enum
- Migrate existing 'done' values to 'finished'
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new enum values
    # PostgreSQL allows adding values to an enum
    op.execute("ALTER TYPE assignment_status ADD VALUE IF NOT EXISTS 'almost_done'")
    op.execute("ALTER TYPE assignment_status ADD VALUE IF NOT EXISTS 'finished'")
    
    # Commit the transaction so the new enum values are available
    op.execute("COMMIT")
    
    # Update existing 'done' values to 'finished'
    op.execute("UPDATE assignments SET status = 'finished' WHERE status = 'done'")


def downgrade() -> None:
    # Update 'finished' back to 'done'
    op.execute("UPDATE assignments SET status = 'done' WHERE status = 'finished'")
    
    # Update 'almost_done' to 'in_progress' (closest approximation)
    op.execute("UPDATE assignments SET status = 'in_progress' WHERE status = 'almost_done'")
    
    # Note: PostgreSQL doesn't allow removing enum values easily
    # The 'almost_done' and 'finished' values will remain in the enum type
    # but won't be used after downgrade
