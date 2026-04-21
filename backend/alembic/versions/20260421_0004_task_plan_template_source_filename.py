"""ensure task plan template filename column

Revision ID: 20260421_0004
Revises: 20260421_0003
Create Date: 2026-04-21
"""

from alembic import op
import sqlalchemy as sa


revision = "20260421_0004"
down_revision = "20260421_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op migration placeholder to keep linear revision chain stable.
    pass


def downgrade() -> None:
    pass
