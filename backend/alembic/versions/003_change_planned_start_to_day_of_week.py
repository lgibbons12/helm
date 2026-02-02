"""Change planned_start_date to planned_start_day enum.

Revision ID: 003
Revises: 002
Create Date: 2026-02-01

Changes:
- Creates day_of_week enum type
- Drops valid_date_order constraint
- Replaces planned_start_date (DATE) with planned_start_day (day_of_week enum)
- Updates index
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the day_of_week enum type
    day_of_week = postgresql.ENUM(
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        name="day_of_week",
        create_type=True,
    )
    day_of_week.create(op.get_bind(), checkfirst=True)

    # Drop the old constraint that compared dates
    op.drop_constraint("valid_date_order", "assignments", type_="check")

    # Drop the old index
    op.drop_index("idx_assignments_user_planned_start", table_name="assignments")

    # Drop the old column
    op.drop_column("assignments", "planned_start_date")

    # Add the new column with enum type
    op.add_column(
        "assignments",
        sa.Column(
            "planned_start_day",
            postgresql.ENUM(
                "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
                name="day_of_week",
                create_type=False,
            ),
            nullable=True,
        ),
    )

    # Create new index
    op.create_index(
        "idx_assignments_user_planned_start",
        "assignments",
        ["user_id", "planned_start_day"],
    )


def downgrade() -> None:
    # Drop the new index
    op.drop_index("idx_assignments_user_planned_start", table_name="assignments")

    # Drop the new column
    op.drop_column("assignments", "planned_start_day")

    # Add back the old column
    op.add_column(
        "assignments",
        sa.Column("planned_start_date", sa.DATE(), nullable=True),
    )

    # Recreate the old index
    op.create_index(
        "idx_assignments_user_planned_start",
        "assignments",
        ["user_id", "planned_start_date"],
    )

    # Recreate the old constraint
    op.create_check_constraint(
        "valid_date_order",
        "assignments",
        "planned_start_date IS NULL OR due_date IS NULL OR planned_start_date <= due_date",
    )

    # Drop the enum type
    op.execute("DROP TYPE IF EXISTS day_of_week")
