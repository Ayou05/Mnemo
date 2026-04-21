"""Add released_at column to memory_cards for drip-feed feature.

Revision ID: 20260421_0007_card_released_at
Revises: 20260421_0006_task_plan_export_mapping
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa

revision = "20260421_0007_card_released_at"
down_revision = "20260421_0006_task_plan_export_mapping"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "memory_cards",
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Existing cards are treated as already released
    op.execute(
        "UPDATE memory_cards SET released_at = created_at WHERE released_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("memory_cards", "released_at")
