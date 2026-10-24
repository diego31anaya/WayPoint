"""Mocked integration checks: no live warehouse or model calls."""
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from app.config import Settings, get_settings
from app.dependencies import get_data_service, get_agent_service
from app.main import app
from app.schemas import AnalysisRequest, StoredLocationContext
from app.services.analytics_service import from_businesses
from app.data.demo_data import demo_businesses


def configure_live(request_data):
    settings = Settings(_env_file=None, data_mode='live', dataset_release='test-fixture', snowflake_agent_setup_verified=True, snowflake_mapping_verified=True)
    request = AnalysisRequest(**request_data)
    metrics = from_businesses(request, demo_businesses(request))
    data = MagicMock()
    data.analyze.return_value = (demo_businesses(request), metrics)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_data_service] = lambda: data
    from app.services.cortex_agent_service import CortexAgentService
    agent = CortexAgentService(settings)
    app.dependency_overrides[get_agent_service] = lambda: agent
    return data


def test_analysis_registers_exact_snapshot_without_warehouse_writes(request_data):
    data = configure_live(request_data)
    response = TestClient(app).post('/api/analyze', json=request_data)
    assert response.status_code == 200
    result = response.json()
    reference = result['agent_context']
    agent = app.dependency_overrides[get_agent_service]()
    context, places = agent._context(reference['business_id'], reference['location_id'])
    assert isinstance(context, StoredLocationContext)
    assert context.metrics.model_dump() == result['metrics']
    assert context.business_information.model_dump() == result['business_information']
    assert places == result['nearby_businesses']
    data.analyze.assert_called_once()
    data._connection.assert_not_called()


def test_registration_failure_preserves_analysis(request_data, monkeypatch):
    configure_live(request_data)
    agent = app.dependency_overrides[get_agent_service]()
    monkeypatch.setattr(agent, 'register_context', MagicMock(side_effect=RuntimeError('secret connector details')))
    response = TestClient(app).post('/api/analyze', json=request_data)
    assert response.status_code == 200
    assert response.json()['agent_context'] is None
    assert any('context unavailable' in warning for warning in response.json()['metadata']['warnings'])
    assert 'secret connector details' not in response.text


def test_mock_never_registers_agent_context(request_data):
    response = TestClient(app).post('/api/analyze', json={**request_data, 'include_location_summary': True})
    assert response.status_code == 200
    assert response.json()['metadata']['simulated'] is True
    assert response.json()['agent_context'] is None
    assert response.json()['location_summary']['source'] == 'deterministic_fallback'


def test_analysis_to_sdk_followups_use_registered_metrics(request_data):
    from test_cortex_agent import fake_agent
    data = configure_live(request_data)
    service, client, _ = fake_agent()
    service.settings = app.dependency_overrides[get_agent_service]().settings
    service.settings.snowflake_pat = 'fixture-token'
    service.settings.snowflake_account = 'fixture-account'
    app.dependency_overrides[get_agent_service] = lambda: service
    api = TestClient(app)
    analysis = api.post('/api/analyze', json=request_data).json()
    first = api.post('/api/agent/chat', json={**analysis['agent_context'], 'message': 'My competitors?'})
    assert first.status_code == 200
    second = api.post('/api/agent/chat', json={**analysis['agent_context'], 'message': 'What next?', 'conversation_id': first.json()['conversation_id']})
    assert second.status_code == 200
    assert second.json()['supporting_metrics'][analysis['agent_context']['location_id']][0]['value'] == analysis['metrics']['competitor_count']
    assert client.conversations.attach.call_args.kwargs['agent']['spec']['name'] == 'BUSINESS_ADVISOR'
    data.analyze.assert_called_once()

def test_live_failure_registers_local_context_without_claiming_snowflake(request_data, monkeypatch):
    from app.services.snowflake_service import DataUnavailable
    configure_live(request_data)
    settings = app.dependency_overrides[get_settings]()
    settings.local_fallback = True
    agent = app.dependency_overrides[get_agent_service]()
    data = app.dependency_overrides[get_data_service]()
    data.analyze.side_effect = DataUnavailable('Warehouse unavailable')
    request = AnalysisRequest(**request_data)
    places = demo_businesses(request)
    monkeypatch.setattr('app.routers.analysis.offline_analysis', lambda request, limit: (places, from_businesses(request, places)))
    response = TestClient(app).post('/api/analyze', json=request_data)
    assert response.status_code == 200
    result = response.json()
    assert result['metadata']['data_source'] == 'local' and not result['metadata']['simulated']
    context, _ = agent._context(**result['agent_context'])
    assert context.data_source == 'local'
    assert context.metrics.model_dump() == result['metrics']


def test_main_local_demo_analysis_retains_exact_competitor_count():
    from app.services.snowflake_service import SnowflakeService
    from app.services.cortex_agent_service import CortexAgentService
    settings = Settings(_env_file=None, data_mode='local', ai_enabled=False)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_data_service] = lambda: SnowflakeService(settings)
    agent = CortexAgentService(settings)
    app.dependency_overrides[get_agent_service] = lambda: agent
    request = {'business_type': 'coffee_shop', 'location': {'latitude': 34.06047, 'longitude': -117.79182}, 'radius_m': 3219,
        'include_location_summary': True, 'include_score_explanation': True}
    response = TestClient(app).post('/api/analyze', json=request)
    assert response.status_code == 200
    body = response.json()
    assert body['metrics']['competitor_count'] == 20
    assert body['metadata']['data_source'] == 'local'
    assert body['agent_context'] is not None
    for key in ['location_summary', 'score_explanation']:
        assert body[key]['source'] == 'deterministic_fallback'
        assert 1 <= len(body[key]['supporting_evidence']) <= 20
        assert any(e['metric_id'] == 'score:opportunity_signal' for e in body[key]['supporting_evidence'])
    context, _ = agent._context(**body['agent_context'])
    assert context.data_source == 'local' and context.dataset_release == 'repository-export'
