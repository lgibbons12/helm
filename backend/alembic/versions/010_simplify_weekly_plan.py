"""Simplify weekly_plans to one plan per user.

Revision ID: 010
Revises: 009
Create Date: 2026-03-29

Changes:
- Drop week_start column and unique constraint
- Add unique constraint on user_id (one plan per user)
- Keep only the most recently updated plan per user
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep only the most recently updated plan per user
    op.execute("""
        DELETE FROM weekly_plans
        WHERE id NOT IN (
            SELECT DISTINCT ON (user_id) id
            FROM weekly_plans
            ORDER BY user_id, updated_at DESC
        )
    """)

    # Drop the old unique constraint and index
    op.drop_constraint("unique_user_week_plan", "weekly_plans", type_="unique")
    op.drop_index("idx_weekly_plans_user_week", table_name="weekly_plans")

    # Drop the week_start column
    op.drop_column("weekly_plans", "week_start")

    # Add unique constraint on user_id (one plan per user)
    op.create_unique_constraint("unique_user_plan", "weekly_plans", ["user_id"])


def downgrade() -> None:
    op.drop_constraint("unique_user_plan", "weekly_plans", type_="unique")
    op.add_column(
        "weekly_plans",
        sa.Column("week_start", sa.Date(), nullable=True),
    )
    op.create_unique_constraint(
        "unique_user_week_plan", "weekly_plans", ["user_id", "week_start"]
    )
    op.create_index(
        "idx_weekly_plans_user_week", "weekly_plans", ["user_id", "week_start"]
    )
