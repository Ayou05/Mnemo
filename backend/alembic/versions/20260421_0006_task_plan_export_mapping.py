"""add export mapping to task plan template

Revision ID: 20260421_0006
Revises: 20260421_0005
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260421_0006"
down_revision = "20260421_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("task_plan_templates") as batch:
        batch.add_column(sa.Column("export_mapping", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("task_plan_templates") as batch:
        batch.drop_column("export_mapping")
