import gzip
from fastapi.testclient import TestClient
from app.config import Settings
from app.data.local_places import load_places, nearby_businesses
from app.dependencies import get_ai_service, get_data_service
from app.main import app
from app.services.ai_service import AIService
from app.services.snowflake_service import SnowflakeService

ROWS = ('NAME,CATEGORY,TOP_CATEGORY,SUB_CATEGORY,BRAND,CONFIDENCE,OPERATING_STATUS,LAT,LON,ZIP\n'
        'Open Cafe,cafe,,,,0.9,open,34.0552,-117.7500,91768\n'
        'Unknown Status Shop,coffee_shop,,,,0.9,,34.0556,-117.7500,91768\n'
        'Closed Cafe,cafe,,,,0.9,permanently_closed,34.0553,-117.7500,91768\n'
        'Low Confidence Cafe,cafe,,,,0.5,open,34.0554,-117.7500,91768\n'
        'Open Cafe,cafe,,,,0.9,open,34.0552,-117.7500,91768\n'
        'Far Library,library,,,,0.9,open,35.0,-118.0,90001\n')


def write_places(tmp_path):
    path = tmp_path / 'places.csv.gz'
    with gzip.open(path, 'wt') as f:
        f.write(ROWS)
    return path


def test_local_places_filter_like_data_layer(tmp_path, analysis_request):
    path = write_places(tmp_path)
    load_places.cache_clear()
    names = [b.name for b in nearby_businesses(analysis_request, path)]
    load_places.cache_clear()
    assert names == ['Open Cafe', 'Unknown Status Shop']


def test_local_mode_uses_real_export(analysis_request):
    settings = Settings(_env_file=None, data_mode='local')
    places, metrics = SnowflakeService(settings).analyze(analysis_request)
    assert metrics.total_businesses > 0 and all(not p.name.startswith('Demo') for p in places)


def test_chat_fallback_is_honest_and_uses_context():
    client = TestClient(app)
    body = client.post('/api/chat', json={'messages': [{'role': 'user', 'content': 'How busy is it?'}],
                                          'context': 'ZIP 91768: 59 cafes within 3 mi.'}).json()
    assert body['source'] == 'fallback' and 'ZIP 91768' in body['reply'] and body['warnings']


def test_chat_uses_cortex_when_enabled(cortex_factory):
    connect, cursor = cortex_factory('Try a student study-hour deal.')
    settings = Settings(_env_file=None, ai_enabled=True)
    app.dependency_overrides[get_ai_service] = lambda: AIService(settings, connect)
    body = TestClient(app).post('/api/chat', json={'messages': [{'role': 'user', 'content': 'Idea?'}],
                                                   'context': 'ZIP 91768'}).json()
    assert body == {'reply': 'Try a student study-hour deal.', 'source': 'open_weight_model', 'warnings': []}
    sql, params = cursor.execute.call_args.args
    assert 'AI_COMPLETE' in sql and 'ZIP 91768' in params[1] and 'USER: Idea?' in params[1]


def test_chat_cortex_failure_falls_back_without_leaking(cortex_factory):
    from unittest.mock import MagicMock
    settings = Settings(_env_file=None, ai_enabled=True)
    app.dependency_overrides[get_ai_service] = lambda: AIService(settings, MagicMock(side_effect=RuntimeError('password=secret')))
    body = TestClient(app).post('/api/chat', json={'messages': [{'role': 'user', 'content': 'Hi'}], 'context': 'ZIP 91768'}).json()
    assert body['source'] == 'fallback' and 'ZIP 91768' in body['reply'] and 'secret' not in str(body)


def test_chat_rejects_empty_messages():
    assert TestClient(app).post('/api/chat', json={'messages': []}).status_code == 422


def test_live_failure_falls_back_to_local_only_when_enabled(request_data):
    from app.config import get_settings
    for fallback, expected in [(False, 503), (True, 200)]:
        settings = Settings(_env_file=None, data_mode='live', local_fallback=fallback)  # mapping not verified -> DataUnavailable
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[get_data_service] = lambda: SnowflakeService(settings)
        response = TestClient(app).post('/api/analyze', json=request_data)
        assert response.status_code == expected
    body = response.json()
    assert body['metadata']['data_source'] == 'local' and not body['metadata']['simulated']
    assert any('Snowflake unavailable' in w for w in body['metadata']['warnings'])
