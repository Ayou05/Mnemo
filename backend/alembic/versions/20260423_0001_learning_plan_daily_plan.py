"""learning_plan_templates and daily_plans"""

from alembic import op
import sqlalchemy as sa

revision = '20260423_0001'
down_revision = '20260422_0001'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table(
        'learning_plan_templates',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('weekly_schedule', sa.Text, default='{}'),
        sa.Column('manual_activities', sa.Text, default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_lpt_user_id', 'learning_plan_templates', ['user_id'])

    op.create_table(
        'daily_plans',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('plan_date', sa.String(10), nullable=False),
        sa.Column('tasks', sa.Text, default='[]'),
        sa.Column('ai_note', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index('ix_dp_user_id', 'daily_plans', ['user_id'])
    op.create_index('ix_dp_plan_date', 'daily_plans', ['plan_date'])
    op.create_index('ix_dp_user_date', 'daily_plans', ['user_id', 'plan_date'])

def downgrade() -> None:
    op.drop_table('daily_plans')
    op.drop_table('learning_plan_templates')
