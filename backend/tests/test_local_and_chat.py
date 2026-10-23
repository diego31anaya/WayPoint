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
        'Far Library,library,,,,0.9,open,35.0,-118.0,90001\n')


def write_places(tmp_path):
    path = tmp_path / 'places.csv.gz'
    with gzip.open(path, 'wt') as f:
        f.write(ROWS)
    return path


def test_local_places_skip_closed_and_far(tmp_path, analysis_request):
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


def test_chat_uses_model_when_enabled():
    import httpx, json

    def model(request):
        sent = json.loads(request.content)
        assert sent['messages'][0]['role'] == 'system' and 'ZIP 91768' in sent['messages'][0]['content']
        return httpx.Response(200, json={'model': 'qwen3:1.7b', 'created_at': '2026-10-23T00:00:00Z', 'done': True,
                                         'message': {'role': 'assistant', 'content': 'Try a student study-hour deal.'}})
    settings = Settings(_env_file=None, ai_enabled=True)
    app.dependency_overrides[get_ai_service] = lambda: AIService(settings, transport=httpx.MockTransport(model))
    body = TestClient(app).post('/api/chat', json={'messages': [{'role': 'user', 'content': 'Idea?'}],
                                                   'context': 'ZIP 91768'}).json()
    assert body == {'reply': 'Try a student study-hour deal.', 'source': 'open_weight_model', 'warnings': []}


def test_chat_rejects_empty_messages():
    assert TestClient(app).post('/api/chat', json={'messages': []}).status_code == 422
