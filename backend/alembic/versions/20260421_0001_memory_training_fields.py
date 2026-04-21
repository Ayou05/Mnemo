"""add memory training feedback fields

Revision ID: 20260421_0001
Revises:
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260421_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("memory_cards", sa.Column("last_wrong_reason", sa.String(length=20), nullable=True))
    op.add_column("memory_cards", sa.Column("last_score", sa.Integer(), nullable=True))
    op.add_column("memory_cards", sa.Column("last_mode", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("memory_cards", "last_mode")
    op.drop_column("memory_cards", "last_score")
    op.drop_column("memory_cards", "last_wrong_reason")
