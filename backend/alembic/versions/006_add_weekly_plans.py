"""Add weekly_plans table.

Revision ID: 006
Revises: 005
Create Date: 2026-02-08

Changes:
- Create weekly_plans table for persisted weekly plan documents
- One plan per user per week (unique constraint on user_id + week_start)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP


# revision identifiers, used by Alembic.
revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weekly_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("created_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # Unique constraint: one plan per user per week
    op.create_unique_constraint(
        "unique_user_week_plan",
        "weekly_plans",
        ["user_id", "week_start"],
    )

    # Index for fast lookups
    op.create_index(
        "idx_weekly_plans_user_week",
        "weekly_plans",
        ["user_id", "week_start"],
    )


def downgrade() -> None:
    op.drop_index("idx_weekly_plans_user_week", table_name="weekly_plans")
    op.drop_constraint("unique_user_week_plan", "weekly_plans", type_="unique")
    op.drop_table("weekly_plans")
