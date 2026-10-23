from unittest.mock import MagicMock
import pytest
from app.config import Settings
from app.services.snowflake_service import SnowflakeService
from app.services.analytics_service import from_businesses
from app.data.demo_data import demo_businesses
from scripts.publish_agent_context import publish_context


def test_publisher_refuses_mock(analysis_request):
    with pytest.raises(ValueError, match='live mode'):
        publish_context(Settings(_env_file=None), analysis_request, 'shop', 'a')


def test_publisher_binds_context_and_commits(analysis_request, monkeypatch):
    metrics = from_businesses(analysis_request, demo_businesses(analysis_request))
    monkeypatch.setattr(SnowflakeService, 'analyze', lambda self, request: ([], metrics))
    cursor, connection = MagicMock(), MagicMock()
    connection.cursor.return_value = cursor
    settings = Settings(_env_file=None, data_mode='live', dataset_release='test-fixture')
    context = publish_context(settings, analysis_request, "shop'", 'a', MagicMock(return_value=connection))
    sql, params = cursor.execute.call_args.args
    assert "shop'" not in sql and params[:2] == ("shop'", 'a')
    assert context.metrics.competitor_count == 3  # coffee A, coffee B, bakery
    connection.commit.assert_called_once()
