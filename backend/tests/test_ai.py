import json
import httpx
import pytest
from app.config import Settings
from app.schemas import RecommendationBatch
from app.services.ai_service import AIService, fallback, validate_evidence
from app.services.analytics_service import from_businesses, get_neighborhood_insights
from app.data.demo_data import demo_businesses


def insights(request):
    metrics = from_businesses(request, demo_businesses(request))
    return {'metrics': metrics, 'evidence': get_neighborhood_insights(metrics), 'scores': []}


@pytest.mark.parametrize('mode', ['timeout', 'malformed', 'bad_id', 'bad_value', 'bad_unit', 'prose_number', 'certainty'])
def test_unsafe_output_falls_back(analysis_request, mode):
    data = insights(analysis_request)
    batch = RecommendationBatch(recommendations=fallback(data['evidence']))
    if mode == 'bad_id':
        batch.recommendations[0].supporting_evidence[0].metric_id = 'fake_revenue'
    if mode == 'bad_value':
        batch.recommendations[0].supporting_evidence[0].value = 98765
    if mode == 'bad_unit':
        batch.recommendations[0].supporting_evidence[0].unit = 'dollars'
    if mode == 'prose_number':
        batch.recommendations[0].description = 'Earn 500 dollars'
    if mode == 'certainty':
        batch.recommendations[0].description = 'This will increase sales'
    def handler(request):
        if mode == 'timeout':
            raise httpx.ReadTimeout('timeout')
        return httpx.Response(200, json={'response': 'bad json' if mode == 'malformed' else batch.model_dump_json()})
    service = AIService(Settings(_env_file=None, ai_enabled=True), httpx.MockTransport(handler))
    recs, source, warnings = service.generate_recommendations(analysis_request, data)
    assert source == 'deterministic_fallback'
    assert len(recs) == 3
    assert warnings


def test_valid_model_output_and_cache(analysis_request):
    data = insights(analysis_request)
    batch = RecommendationBatch(recommendations=fallback(data['evidence']))
    calls = []
    def handler(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={'response': batch.model_dump_json()})
    service = AIService(Settings(_env_file=None, ai_enabled=True), httpx.MockTransport(handler))
    for _ in range(2):
        recs, source, _ = service.generate_recommendations(analysis_request, data)
        assert source == 'open_weight_model'
        validate_evidence(RecommendationBatch(recommendations=recs), data['evidence'])
    assert len(calls) == 1
    assert calls[0]['format']['type'] == 'object'
