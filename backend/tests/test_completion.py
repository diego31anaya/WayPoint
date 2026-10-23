import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.config import Settings, get_settings
from app.dependencies import get_ai_service, get_data_service
from app.main import app
from app.schemas import AnalysisRequest, RecommendationBatch
from app.services.ai_service import AIService, fallback, validate_evidence
from app.services.analytics_service import from_businesses, get_neighborhood_insights, get_competitor_metrics
from app.services.scoring_service import score_opportunities
from app.data.demo_data import demo_businesses

client = TestClient(app)


def test_optional_profile(request_data):
    request_data.update(business_name='Neighborhood Coffee', business_description='A planned coffee shop',
        products_and_services=['Coffee', 'Student bundles'], target_customers=['Students'],
        monthly_marketing_budget=0, current_challenges=['Limited awareness'],
        existing_marketing_strategies=['Student promotions'], business_stage='planning')
    response = client.post('/api/analyze', json=request_data)
    assert response.status_code == 200
    body = response.json()
    assert body['business_information']['monthly_marketing_budget'] == 0
    assert body['neighborhood_insights']['data_quality']['geographic_coverage'] == 'unknown'
    assert body['neighborhood_insights']['complementary_categories']['school'] == 1
    assert len(body['neighborhood_insights']['nearest_competitors']) == 2
    assert body['metrics']['competitor_share'] == pytest.approx(2/7)
    assert body['opportunity_signals'][0]['contributing_metrics']
    assert 'without paid advertising' in body['recommendations'][0]['action_steps'][0]


@pytest.mark.parametrize('field,value', [('business_name', '  '), ('business_goal', ''),
    ('monthly_marketing_budget', -1), ('monthly_marketing_budget', 'NaN'),
    ('business_stage', 'unknown'), ('target_customers', ['']), ('owner_preferences', ['x'*301])])
def test_invalid_profile(request_data, field, value):
    request_data[field] = value
    assert client.post('/api/analyze', json=request_data).status_code == 422


@pytest.mark.parametrize('label,canonical', [('Coffee Shop', 'coffee_shop'), ('Café', 'coffee_shop'),
    ('book_store', 'bookstore'), ('Bakery', 'bakery')])
def test_category_aliases(request_data, label, canonical):
    del request_data['business_type']
    request_data['business_category'] = label
    assert AnalysisRequest(**request_data).business_type == canonical


def test_legacy_custom_goal(request_data):
    request_data['business_goal'] = 'Build community relationships'
    assert AnalysisRequest(**request_data).business_goal == 'Build community relationships'


def test_unknown_categories_withhold_scores_and_ai(analysis_request):
    metrics = get_competitor_metrics(analysis_request, {'unknown': 4}, None)
    assert score_opportunities(metrics) == []
    recs, source, _ = AIService(Settings(_env_file=None)).generate_recommendations(
        analysis_request, {'metrics': metrics, 'evidence': get_neighborhood_insights(metrics), 'scores': []})
    assert recs == [] and source == 'insufficient_evidence'


def test_probe_explicit_only():
    class Probe:
        calls = 0
        def check_availability(self):
            self.calls += 1
            return 'available'
    data, ai = Probe(), Probe()
    app.dependency_overrides[get_data_service] = lambda: data
    app.dependency_overrides[get_ai_service] = lambda: ai
    assert client.get('/api/health').status_code == 200
    assert data.calls == ai.calls == 0
    body = client.get('/api/health?check_dependencies=true').json()
    assert body['dependencies_checked'] is True
    assert body['snowflake'] == body['cortex'] == 'available'
    assert data.calls == ai.calls == 1


def test_cors():
    response = client.options('/api/analyze', headers={'Origin': 'http://localhost:5173',
                                                     'Access-Control-Request-Method': 'POST'})
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
    response = client.options('/api/analyze', headers={'Origin': 'https://untrusted.example',
                                                     'Access-Control-Request-Method': 'POST'})
    assert 'access-control-allow-origin' not in response.headers


def test_duplicate_recommendations(analysis_request):
    evidence = get_neighborhood_insights(from_businesses(analysis_request, demo_businesses(analysis_request)))
    recs = fallback(evidence)
    recs[1].title = recs[0].title
    with pytest.raises(ValueError, match='distinct'):
        validate_evidence(RecommendationBatch(recommendations=recs), evidence)


@pytest.mark.parametrize('field', ['business_type', 'location'])
def test_required_input(request_data, field):
    del request_data[field]
    assert client.post('/api/analyze', json=request_data).status_code == 422


def test_empty_action_rejected(analysis_request):
    evidence = get_neighborhood_insights(from_businesses(analysis_request, demo_businesses(analysis_request)))
    recs = [r.model_dump() for r in fallback(evidence)]
    recs[0]['action_steps'] = [' ']
    with pytest.raises(ValidationError):
        RecommendationBatch(recommendations=recs)
