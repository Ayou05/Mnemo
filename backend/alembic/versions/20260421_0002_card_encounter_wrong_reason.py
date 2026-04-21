"""add card encounter wrong reason

Revision ID: 20260421_0002
Revises: 20260421_0001
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260421_0002"
down_revision = "20260421_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("card_encounters", sa.Column("wrong_reason", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("card_encounters", "wrong_reason")
