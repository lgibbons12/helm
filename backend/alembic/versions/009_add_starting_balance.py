"""Add starting_balance to budget_settings.

Revision ID: 009
Revises: 008
Create Date: 2026-02-19

Changes:
- Add starting_balance NUMERIC(12,2) column to budget_settings
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "budget_settings",
        sa.Column(
            "starting_balance",
            sa.Numeric(12, 2),
            nullable=True,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("budget_settings", "starting_balance")
