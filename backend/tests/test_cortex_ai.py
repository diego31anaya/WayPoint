import json
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.config import Settings
from app.main import app
from app.dependencies import get_ai_service
from app.schemas import Evidence, ExplanationContent, RecommendationBatch
from app.services.ai_common import fallback
from app.services.cortex_ai_service import CortexAIService, SURVIVAL_LIMITATION
from app.services.analytics_service import from_businesses, get_neighborhood_insights
from app.data.demo_data import demo_businesses


def sample(request):
    metrics = from_businesses(request, demo_businesses(request))
    return {'metrics': metrics, 'evidence': get_neighborhood_insights(metrics)}


def test_configuration(monkeypatch):
    monkeypatch.setenv('AI_PROVIDER', 'snowflake_cortex')
    monkeypatch.setenv('SNOWFLAKE_CORTEX_MODEL', 'llama3.3-70b')
    assert Settings(_env_file=None).snowflake_cortex_model == 'llama3.3-70b'
    monkeypatch.setenv('AI_PROVIDER', 'ollama')
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize('lifecycle,model,regions', [('EOL', 'llama3.3-70b', None),
    ('LEGACY', 'llama3.3-70b', None), ('GA', 'other-model', None), ('GA', 'llama3.3-70b', ['AWS_EU_CENTRAL_1'])])
def test_model_unavailable(analysis_request, cortex_factory, lifecycle, model, regions):
    connect, cursor = cortex_factory({}, model=model, lifecycle=lifecycle, regions=regions)
    service = CortexAIService(Settings(_env_file=None, ai_enabled=True), connect)
    assert service.check_availability() == 'unavailable'
    assert service.generate_recommendations(analysis_request, sample(analysis_request), [])[1] == 'deterministic_fallback'
    assert not any('AI_COMPLETE' in c.args[0] for c in cursor.execute.call_args_list)


@pytest.mark.parametrize('error', [TimeoutError('secret'), RuntimeError('password=secret')])
def test_connector_failure(analysis_request, error):
    service = CortexAIService(Settings(_env_file=None, ai_enabled=True), MagicMock(side_effect=error))
    result = service.generate_recommendations(analysis_request, sample(analysis_request), [])
    assert result[1] == 'deterministic_fallback' and 'secret' not in str(result[2])


def test_location_summary(analysis_request, cortex_factory):
    data = sample(analysis_request)
    content = ExplanationContent(summary='Compare mapped competitors before testing a partnership.',
        factors=['Competition density and complementary presence influence the heuristic.'], supporting_evidence=[data['evidence'][0]])
    connect, cursor = cortex_factory(content.model_dump())
    service = CortexAIService(Settings(_env_file=None, ai_enabled=True), connect)
    summary = service.generate_location_summary(analysis_request, data['metrics'])
    assert summary.source == 'open_weight_model' and summary.population is None
    assert summary.survival_probability is None and SURVIVAL_LIMITATION in summary.limitations
    assert service.explain_opportunity_score(data['metrics']).source == 'open_weight_model'
    assert 'score:opportunity_signal' in cursor.execute.call_args.args[1][1]


def test_invalid_summary(analysis_request, cortex_factory):
    connect, _ = cortex_factory({'summary': 'There are 999 schools.', 'factors': ['Fact'],
        'supporting_evidence': [{'metric_id': 'fake', 'value': 999, 'unit': 'locations'}]})
    result = CortexAIService(Settings(_env_file=None, ai_enabled=True), connect).generate_location_summary(
        analysis_request, sample(analysis_request)['metrics'])
    assert result.source == 'deterministic_fallback'


def test_complete_analysis_profile_and_explanations(request_data, cortex_factory):
    request_data.update(products_and_services=['Coffee'], existing_marketing_strategies=['Student discounts'],
        monthly_marketing_budget=0, include_location_summary=True, include_score_explanation=True)
    prompts = []
    def respond(params):
        prompt = params[1]
        prompts.append(prompt)
        data = json.loads(prompt.split('Input:\n', 1)[1])
        evidence = [Evidence(**e) for e in data['evidence']]
        if 'Task: recommendations' in prompt:
            return RecommendationBatch(recommendations=fallback(evidence)).model_dump()
        return ExplanationContent(summary='Test a limited experiment before committing resources.',
            factors=['Observe mapped competition and complementary categories.'], supporting_evidence=[evidence[0]]).model_dump()
    connect, _ = cortex_factory(respond)
    service = CortexAIService(Settings(_env_file=None, ai_enabled=True), connect)
    app.dependency_overrides[get_ai_service] = lambda: service
    body = TestClient(app).post('/api/analyze', json=request_data).json()
    assert body['metadata']['recommendation_source'] == 'open_weight_model'
    assert body['metadata']['simulated'] is True
    assert body['location_summary']['source'] == body['score_explanation']['source'] == 'open_weight_model'
    assert 'Student discounts' in prompts[0] and 'monthly_marketing_budget' in prompts[0]
    assert body['metrics']['competitor_count'] == 3 and len(body['recommendations']) == 3


def test_retry_transient_only(analysis_request, cortex_factory):
    data = sample(analysis_request)
    connect, _ = cortex_factory(RecommendationBatch(recommendations=fallback(data['evidence'])).model_dump())
    class Transient(Exception):
        sqlstate = '08006'
    connection = connect.return_value
    connect.side_effect = [Transient('transient'), connection]
    service = CortexAIService(Settings(_env_file=None, ai_enabled=True), connect)
    assert service.generate_recommendations(analysis_request, data)[1] == 'open_weight_model'
    assert connect.call_count == 2


def test_no_hidden_proprietary_source(analysis_request, cortex_factory):
    data = sample(analysis_request)
    connect, _ = cortex_factory(RecommendationBatch(recommendations=fallback(data['evidence'])).model_dump(), model='other')
    service = CortexAIService(Settings(_env_file=None, ai_enabled=True, snowflake_cortex_model='other'), connect)
    assert service.generate_recommendations(analysis_request, data)[1] == 'cortex_ai'


def test_invalid_responses_not_cached(analysis_request, cortex_factory):
    connect, cursor = cortex_factory('not json')
    service = CortexAIService(Settings(_env_file=None, ai_enabled=True), connect)
    for _ in range(2):
        assert service.generate_recommendations(analysis_request, sample(analysis_request))[1] == 'deterministic_fallback'
    assert len(service.cache) == 0
    assert sum('AI_COMPLETE' in c.args[0] for c in cursor.execute.call_args_list) == 2


def test_full_mocked_live_pipeline(request_data, cortex_factory):
    from app.config import get_settings
    from app.dependencies import get_data_service
    from app.services.snowflake_service import SnowflakeService
    settings = Settings(_env_file=None, data_mode='live', ai_enabled=True,
        snowflake_mapping_verified=True, snowflake_database='db', snowflake_schema='public', snowflake_table='places')
    cursor, connection = MagicMock(), MagicMock()
    connection.cursor.return_value = cursor
    cursor.fetchall.side_effect = [
        [('BUSINESS_ID', 'VARCHAR'), ('NAME', 'VARCHAR'), ('CATEGORY', 'VARCHAR'),
         ('LATITUDE', 'FLOAT'), ('LONGITUDE', 'FLOAT'), ('GEOG', 'GEOGRAPHY')],
        [('aggregate', 'coffee_shop', 2, 20, None, None, None, None, None),
         ('aggregate', 'school', 1, 50, None, None, None, None, None),
         ('place', 'coffee_shop', None, None, 'fixture-a', 'Fixture place', 34.055, -117.75, 20)]]
    def respond(params):
        data = json.loads(params[1].split('Input:\n', 1)[1])
        return RecommendationBatch(recommendations=fallback([Evidence(**e) for e in data['evidence']])).model_dump()
    connect, _ = cortex_factory(respond)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_data_service] = lambda: SnowflakeService(settings, MagicMock(return_value=connection))
    app.dependency_overrides[get_ai_service] = lambda: CortexAIService(settings, connect)
    response = TestClient(app).post('/api/analyze', json=request_data)
    assert response.status_code == 200
    body = response.json()
    assert body['metadata']['data_source'] == 'snowflake' and not body['metadata']['simulated']
    assert body['metadata']['ai_model'] == 'llama3.3-70b'
    assert body['metadata']['recommendation_source'] == 'open_weight_model'
    assert body['metrics']['complementary_count'] == 1 and body['metadata']['map_truncated']
