"""add manual text column for task plan entry

Revision ID: 20260421_0005
Revises: 20260421_0004
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260421_0005"
down_revision = "20260421_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("task_plan_entries") as batch:
        batch.add_column(sa.Column("manual_text", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("task_plan_entries") as batch:
        batch.drop_column("manual_text")
