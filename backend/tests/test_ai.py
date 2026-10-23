import json
import pytest
from app.config import Settings
from app.schemas import RecommendationBatch
from app.services.ai_service import AIService, fallback, validate_evidence
from app.services.analytics_service import from_businesses, get_neighborhood_insights
from app.data.demo_data import demo_businesses


def insights(request):
    metrics = from_businesses(request, demo_businesses(request))
    return {'metrics': metrics, 'evidence': get_neighborhood_insights(metrics), 'scores': []}


@pytest.mark.parametrize('mode', ['malformed', 'bad_id', 'bad_value', 'bad_unit', 'prose_number', 'certainty'])
def test_unsafe_cortex_output_falls_back(analysis_request, cortex_factory, mode):
    data = insights(analysis_request)
    batch = RecommendationBatch(recommendations=fallback(data['evidence']))
    rec = batch.recommendations[0]
    if mode == 'bad_id':
        rec.supporting_evidence[0].metric_id = 'fake_revenue'
    if mode == 'bad_value':
        rec.supporting_evidence[0].value = 98765
    if mode == 'bad_unit':
        rec.supporting_evidence[0].unit = 'dollars'
    if mode == 'prose_number':
        rec.description = 'Earn 500 dollars'
    if mode == 'certainty':
        rec.description = 'This will increase sales'
    connect, _ = cortex_factory('bad json' if mode == 'malformed' else batch.model_dump())
    recs, source, warnings = AIService(Settings(_env_file=None, ai_enabled=True), connect).generate_recommendations(analysis_request, data)
    assert source == 'deterministic_fallback' and len(recs) == 3 and warnings


def test_valid_cortex_output_and_cache(analysis_request, cortex_factory):
    data = insights(analysis_request)
    connect, cursor = cortex_factory(RecommendationBatch(recommendations=fallback(data['evidence'])).model_dump())
    service = AIService(Settings(_env_file=None, ai_enabled=True), connect)
    for _ in range(2):
        recs, source, _ = service.generate_recommendations(analysis_request, data)
        assert source == 'open_weight_model'
        validate_evidence(RecommendationBatch(recommendations=recs), data['evidence'])
    calls = [c for c in cursor.execute.call_args_list if 'AI_COMPLETE' in c.args[0]]
    assert len(calls) == 1
    sql, params = calls[0].args
    assert params[0] == 'llama3.3-70b' and '%s' in sql
    assert 'Demo' not in sql
    assert json.loads(params[3])['schema']['type'] == 'object'
