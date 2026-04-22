"""add memory card last wrong detail

Revision ID: 20260422_0001
Revises: 20260421_0007
Create Date: 2026-04-22
"""

from alembic import op
import sqlalchemy as sa


revision = "20260422_0001"
down_revision = "20260421_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("memory_cards", sa.Column("last_wrong_detail", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("memory_cards", "last_wrong_detail")
