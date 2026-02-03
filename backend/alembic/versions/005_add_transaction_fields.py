"""Add is_weekly and income_source fields to transactions.

Revision ID: 005
Revises: 004
Create Date: 2026-02-02

Changes:
- Add is_weekly boolean field (default false) to distinguish weekly vs one-time/large expenses
- Add income_source string field (nullable) for income transactions
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_weekly column with default false
    op.add_column(
        "transactions",
        sa.Column("is_weekly", sa.Boolean(), nullable=False, server_default="false"),
    )
    
    # Add income_source column (nullable)
    op.add_column(
        "transactions",
        sa.Column("income_source", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transactions", "income_source")
    op.drop_column("transactions", "is_weekly")
