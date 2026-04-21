"""add task plan template tables

Revision ID: 20260421_0003
Revises: 20260421_0002
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260421_0003"
down_revision = "20260421_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_plan_templates",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_plan_templates_user_id", "task_plan_templates", ["user_id"])
    op.create_index("ix_task_plan_templates_month", "task_plan_templates", ["month"])

    op.create_table(
        "task_plan_entries",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("template_id", sa.String(length=36), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("planned_text", sa.Text(), nullable=False),
        sa.Column("actual_text", sa.Text(), nullable=True),
        sa.Column("completion_rate", sa.Float(), nullable=True),
        sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["task_plan_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_plan_entries_template_id", "task_plan_entries", ["template_id"])


def downgrade() -> None:
    op.drop_index("ix_task_plan_entries_template_id", table_name="task_plan_entries")
    op.drop_table("task_plan_entries")
    op.drop_index("ix_task_plan_templates_month", table_name="task_plan_templates")
    op.drop_index("ix_task_plan_templates_user_id", table_name="task_plan_templates")
    op.drop_table("task_plan_templates")
