from unittest.mock import MagicMock
import pytest
from app.config import Settings
from app.services.snowflake_service import SnowflakeService, DataUnavailable, identifier


def live_settings(**kwargs):
    return Settings(_env_file=None, data_mode='live', snowflake_mapping_verified=True,
                    snowflake_database='db', snowflake_schema='public', snowflake_table='canonical', **kwargs)


def test_parameter_binding_and_aggregation(analysis_request):
    cursor, connection = MagicMock(), MagicMock()
    connection.cursor.return_value = cursor
    cursor.fetchall.return_value = [
        ('aggregate', 'coffee_shop', 300, 20, None, None, None, None, None),
        ('place', 'coffee_shop', None, None, 'a', 'A', 34.055, -117.75, 20)]
    connect = MagicMock(return_value=connection)
    places, metrics = SnowflakeService(live_settings(map_limit=1), connect).analyze(analysis_request)
    sql, params = cursor.execute.call_args.args
    assert 'ST_DWITHIN' in sql and '%s' in sql
    assert str(analysis_request.location.longitude) not in sql
    assert params == (-117.7499, 34.0551, -117.7499, 34.0551, 1500, 1)
    assert metrics.competitor_count == 300 and len(places) == 1
    cursor.close.assert_called_once()
    connection.close.assert_called_once()


def test_connection_error(analysis_request):
    service = SnowflakeService(live_settings(), MagicMock(side_effect=RuntimeError('password=secret')))
    with pytest.raises(DataUnavailable) as error:
        service.analyze(analysis_request)
    assert 'secret' not in str(error.value)


def test_mapping_required(analysis_request):
    with pytest.raises(DataUnavailable):
        SnowflakeService(Settings(_env_file=None, data_mode='live')).analyze(analysis_request)


@pytest.mark.parametrize('value', ['x; DROP TABLE t', 'x.y', '', 'a"b'])
def test_identifier(value):
    with pytest.raises(DataUnavailable):
        identifier(value)
