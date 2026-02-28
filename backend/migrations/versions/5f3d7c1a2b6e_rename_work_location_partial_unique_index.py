"""rename work location partial unique index

Revision ID: 5f3d7c1a2b6e
Revises: c7f4d4d2a901
Create Date: 2026-02-28 15:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f3d7c1a2b6e'
down_revision: Union[str, Sequence[str], None] = 'c7f4d4d2a901'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('work_locations', schema=None) as batch_op:
        batch_op.drop_index('ix_unique_active_work_location_user_date', sqlite_where=sa.text('deleted_at IS NULL'))
        batch_op.create_index(
            'uq_active_work_location_user_date',
            ['user_id', 'date'],
            unique=True,
            sqlite_where=sa.text('deleted_at IS NULL'),
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('work_locations', schema=None) as batch_op:
        batch_op.drop_index('uq_active_work_location_user_date', sqlite_where=sa.text('deleted_at IS NULL'))
        batch_op.create_index(
            'ix_unique_active_work_location_user_date',
            ['user_id', 'date'],
            unique=True,
            sqlite_where=sa.text('deleted_at IS NULL'),
        )
