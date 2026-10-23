import json
import re
from unittest.mock import patch
import httpx
import pytest
from pydantic import ValidationError
from app.config import Settings
from app.schemas import RecommendationBatch
from app.services.ai_service import AIService, fallback, generation_schema
from app.services.analytics_service import from_businesses, get_neighborhood_insights
from app.data.demo_data import demo_businesses


def sample(request):
    metrics = from_businesses(request, demo_businesses(request))
    return {'metrics': metrics, 'evidence': get_neighborhood_insights(metrics)}


def test_official_client_configuration_and_schema(analysis_request):
    insights = sample(analysis_request)
    batch = RecommendationBatch(recommendations=fallback(insights['evidence']))
    settings = Settings(_env_file=None, ai_enabled=True, ollama_base_url='http://example.test:11434',
                        ollama_model='configured-model', ollama_temperature=0.25, ollama_timeout_s=12)
    with patch('app.services.ai_service.Client') as factory:
        client = factory.return_value.__enter__.return_value
        client.generate.return_value.response = batch.model_dump_json()
        result = AIService(settings).generate_recommendations(analysis_request, insights, [])
        factory.assert_called_once_with(host='http://example.test:11434', timeout=12, transport=None)
        kwargs = client.generate.call_args.kwargs
        assert kwargs['model'] == 'configured-model'
        assert kwargs['format'] == generation_schema(insights['evidence'])
        assert 'competitor_count' in kwargs['format']['$defs']['Evidence']['properties']['metric_id']['enum']
        assert kwargs['options']['temperature'] == 0.25
        assert kwargs['think'] is False and kwargs['stream'] is False
        assert json.loads(kwargs['prompt'])['context']['business_type'] == 'coffee_shop'
        assert result[1] == 'open_weight_model'
        factory.return_value.__exit__.assert_called_once()


@pytest.mark.parametrize('error', [ConnectionError('offline'), httpx.ConnectError('offline'), httpx.ReadTimeout('slow')])
def test_official_client_connection_failures(analysis_request, error):
    def handler(request):
        raise error
    service = AIService(Settings(_env_file=None, ai_enabled=True, ollama_retries=0), httpx.MockTransport(handler))
    recs, source, warnings = service.generate_recommendations(analysis_request, sample(analysis_request), [])
    assert len(recs) == 3 and source == 'deterministic_fallback' and warnings
    assert service.check_availability() == 'unavailable'


@pytest.mark.parametrize('payload', [{'response': ''}, {}, {'response': None}, {'response': '{}'}])
def test_missing_or_invalid_sdk_response(analysis_request, payload):
    service = AIService(Settings(_env_file=None, ai_enabled=True), httpx.MockTransport(
        lambda req: httpx.Response(200, json=payload)))
    assert service.generate_recommendations(analysis_request, sample(analysis_request), [])[1] == 'deterministic_fallback'


def test_environment_settings(monkeypatch):
    monkeypatch.setenv('OLLAMA_MODEL', 'qwen3:1.7b')
    monkeypatch.setenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    monkeypatch.setenv('OLLAMA_TEMPERATURE', '0.2')
    monkeypatch.setenv('OLLAMA_TIMEOUT_S', '30')
    settings = Settings(_env_file=None)
    assert settings.ollama_model == 'qwen3:1.7b'
    assert settings.ollama_temperature == 0.2 and settings.ollama_timeout_s == 30
    monkeypatch.setenv('OLLAMA_TEMPERATURE', '-1')
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_generation_constraints_do_not_change_api_schema(analysis_request):
    original = RecommendationBatch.model_json_schema()
    schema = generation_schema(sample(analysis_request)['evidence'])
    assert RecommendationBatch.model_json_schema() == original
    properties = schema['$defs']['Evidence']['properties']
    assert 'competitor_count' in properties['metric_id']['enum']
    assert 2 in properties['value']['enum']
    assert 'locations' in properties['unit']['enum']
    pattern = schema['$defs']['Recommendation']['properties']['action_steps']['items']['pattern']
    assert re.fullmatch(pattern, 'Run a brief pilot.')
    assert not re.fullmatch(pattern, 'Run for 7 days.')
    assert not re.fullmatch(pattern, 'Run for \uff17 days.')
