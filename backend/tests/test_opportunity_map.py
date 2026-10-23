import json
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.dependencies import get_opportunity_map_service
from app.main import app
from app.schemas import OpportunityMapRequest
from app.services.opportunity_map_service import OpportunityMapService
from app.services.snowflake_service import DataUnavailable

SCHEMA = [('BUSINESS_ID', 'VARCHAR'), ('NAME', 'VARCHAR'), ('CATEGORY', 'VARCHAR'),
          ('LATITUDE', 'FLOAT'), ('LONGITUDE', 'FLOAT'), ('GEOG', 'GEOGRAPHY')]
POLYGON = {'type': 'Polygon', 'coordinates': [[[-117.75, 34.05], [-117.74, 34.05], [-117.74, 34.06], [-117.75, 34.05]]]}


def map_request():
    return OpportunityMapRequest(business_type='coffee_shop', location={'latitude': 34.0551, 'longitude': -117.7499})


def test_empty_cells_and_sql_formula():
    cursor, connection = MagicMock(), MagicMock()
    connection.cursor.return_value = cursor
    expected = round(100*(.4/(1+1/5)+.6*3/(3+5)), 2)
    cursor.fetchall.side_effect = [SCHEMA, [
        ('8829a0000000001', json.dumps(POLYGON), 2, 2, 1, 3, 5, 0, {'coffee_shop': 2, 'school': 3}, expected),
        ('8829a0000000002', POLYGON, 2, 0, 0, 0, 0, 0, {}, None)]]
    settings = Settings(_env_file=None, data_mode='live', snowflake_mapping_verified=True,
        snowflake_database='db', snowflake_schema='public', snowflake_table='places')
    service = OpportunityMapService(settings, MagicMock(return_value=connection))
    body = service.get_map(map_request())
    assert len(body.features) == 2 and body.features[0].properties.opportunity_score == expected
    assert body.features[1].properties.opportunity_score is None
    assert body.features[1].properties.confidence == 'insufficient'
    sql, params = cursor.execute.call_args.args
    assert 'LEFT JOIN tagged' in sql and 'H3_GRID_DISK' in sql and 'ST_AREA' in sql
    assert 'AI_COMPLETE' not in sql and '0.4 / (1 +' in sql
    assert params[:4] == (34.0551, -117.7499, 8, 2)
    assert json.loads(params[4]) == ['coffee_shop', 'cafe']


def test_mock_map_explicit():
    body = OpportunityMapService(Settings(_env_file=None)).get_map(map_request())
    assert body.features == [] and body.metadata['simulated'] is True
    assert 'no H3 geometry fixtures' in body.metadata['limitations'][-1]


def test_map_error():
    service = OpportunityMapService(Settings(_env_file=None, data_mode='live'))
    with pytest.raises(DataUnavailable):
        service.get_map(map_request())


@pytest.mark.parametrize('value', [-1, 5, 100])
def test_grid_limit(value):
    body = map_request().model_dump()
    body['grid_disk_k'] = value
    assert TestClient(app).post('/api/opportunity-map', json=body).status_code == 422


def test_map_endpoint():
    app.dependency_overrides[get_opportunity_map_service] = lambda: OpportunityMapService(Settings(_env_file=None))
    response = TestClient(app).post('/api/opportunity-map', json=map_request().model_dump())
    assert response.status_code == 200 and response.json()['type'] == 'FeatureCollection'
