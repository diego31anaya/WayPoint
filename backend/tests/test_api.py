import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.dependencies import get_data_service
from app.services.snowflake_service import DataUnavailable

client = TestClient(app)


def test_health():
    assert client.get('/api/health').json()['status'] == 'ok'


def test_mock_end_to_end(request_data):
    response = client.post('/api/analyze', json=request_data)
    assert response.status_code == 200
    body = response.json()
    assert body['metrics']['competitor_count'] == 2
    assert len(body['recommendations']) == 3
    assert body['metadata']['simulated'] is True
    assert body['metadata']['recommendation_source'] == 'deterministic_fallback'
    assert len(client.get('/api/categories').json()['categories']) == 4


@pytest.mark.parametrize('field,value', [('latitude', 91), ('latitude', -91), ('longitude', 181), ('longitude', -181), ('radius_m', 0), ('radius_m', 5001), ('latitude', 'NaN')])
def test_invalid(request_data, field, value):
    if field == 'radius_m':
        request_data[field] = value
    else:
        request_data['location'][field] = value
    assert client.post('/api/analyze', json=request_data).status_code == 422


def test_data_failure(request_data):
    class Broken:
        def analyze(self, request):
            raise DataUnavailable('Controlled failure')
    app.dependency_overrides[get_data_service] = Broken
    response = client.post('/api/analyze', json=request_data)
    assert response.status_code == 503
    assert response.json()['detail']['code'] == 'data_unavailable'


def test_empty_area(request_data):
    request_data['location'] = {'latitude': 0, 'longitude': 0}
    body = client.post('/api/analyze', json=request_data).json()
    assert body['metrics']['nearest_competitor_distance_m'] is None
    assert body['recommendations'] == []
    assert body['opportunity_signals'] == []
