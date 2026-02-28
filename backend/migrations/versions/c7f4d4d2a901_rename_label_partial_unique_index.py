"""rename label partial unique index

Revision ID: c7f4d4d2a901
Revises: b78b041d18dd
Create Date: 2026-02-28 14:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7f4d4d2a901'
down_revision: Union[str, Sequence[str], None] = 'b78b041d18dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('time_tracking_labels', schema=None) as batch_op:
        batch_op.drop_index('ix_unique_active_label_user_name', sqlite_where=sa.text('deleted_at IS NULL'))
        batch_op.create_index(
            'uq_active_label_user_name',
            ['user_id', 'name'],
            unique=True,
            sqlite_where=sa.text('deleted_at IS NULL'),
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('time_tracking_labels', schema=None) as batch_op:
        batch_op.drop_index('uq_active_label_user_name', sqlite_where=sa.text('deleted_at IS NULL'))
        batch_op.create_index(
            'ix_unique_active_label_user_name',
            ['user_id', 'name'],
            unique=True,
            sqlite_where=sa.text('deleted_at IS NULL'),
        )
