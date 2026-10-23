import json
from unittest.mock import MagicMock
import httpx
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import app
from app.dependencies import get_agent_service
from app.schemas import AgentChatRequest, StoredLocationContext
from app.services.analytics_service import from_businesses
from app.services.cortex_agent_service import CortexAgentService, AgentUnavailable
from app.data.demo_data import demo_businesses


def settings(**kwargs):
    return Settings(_env_file=None, data_mode='live', snowflake_agent_setup_verified=True,
        snowflake_agent_token='test-token', snowflake_account_base_url='https://test.snowflakecomputing.com', **kwargs)


@pytest.fixture
def context(analysis_request):
    return StoredLocationContext(business_information=analysis_request,
        metrics=from_businesses(analysis_request, demo_businesses(analysis_request)), data_source='snowflake', dataset_release='test-fixture')


def result(answer='There are 2 mapped competitors.', assistant_id=11):
    return {'content': [{'type': 'text', 'text': answer},
        {'type': 'tool_result', 'tool_result': {'type': 'cortex_analyst_text_to_sql', 'name': 'neighborhood_analyst',
        'status': 'success', 'content': [{'type': 'json', 'json': {'query_id': 'query-fixture', 'result_set': {'data': [[2]]}}}]}}],
        'metadata': {'thread_id': 42, 'assistant_message_id': assistant_id}}


def fake_agent(context, response=None):
    calls = []
    def handler(request):
        calls.append(request)
        if request.method == 'GET':
            return httpx.Response(200, json={'agent_spec': {
                'tools': [{'tool_spec': {'name': 'neighborhood_analyst', 'type': 'cortex_analyst_text_to_sql'}}],
                'tool_resources': {'neighborhood_analyst': {'semantic_view': 'BLOCKBOOST.PUBLIC.NEIGHBORHOOD_SEMANTIC'}}}})
        if request.url.path.endswith('/threads'):
            return httpx.Response(200, json={'thread_id': 42})
        return httpx.Response(200, json=response or result())
    service = CortexAgentService(settings(), transport=httpx.MockTransport(handler))
    service._context = MagicMock(return_value=context)
    return service, calls


def test_multi_turn_and_evidence(context):
    service, calls = fake_agent(context)
    request = AgentChatRequest(message='How competitive is this area?', business_id='shop', location_id='a')
    first = service.chat(request)
    assert first.analyst_query_ids == ['query-fixture']
    assert first.supporting_metrics['a'][0].metric_id == 'competitor_count'
    request.conversation_id = first.conversation_id
    service.chat(request)
    runs = [json.loads(r.content) for r in calls if r.url.path.endswith(':run')]
    assert runs[0]['parent_message_id'] == 0 and runs[1]['parent_message_id'] == 11
    assert runs[1]['thread_id'] == 42 and runs[0]['stream'] is False
    assert 'shop' in runs[0]['messages'][0]['content'][0]['text']
    assert all(r.headers['authorization'] == 'Bearer test-token' for r in calls)


def test_context_binding(context):
    service, _ = fake_agent(context)
    first = service.chat(AgentChatRequest(message='Compare.', business_id='shop', location_id='a'))
    with pytest.raises(AgentUnavailable, match='different'):
        service.chat(AgentChatRequest(message='Compare.', business_id='other', location_id='a', conversation_id=first.conversation_id))


@pytest.mark.parametrize('mode', ['no_analyst', 'warning', 'invented_number', 'missing_thread'])
def test_unsafe_agent_output(context, mode):
    response = result()
    if mode == 'no_analyst':
        response['content'] = response['content'][:1]
    if mode == 'warning':
        response['warnings'] = [{'code': '399569'}]
    if mode == 'invented_number':
        response['content'][0]['text'] = 'There are 999 competitors.'
    if mode == 'missing_thread':
        response['metadata'] = {}
    service, _ = fake_agent(context, response)
    with pytest.raises(AgentUnavailable):
        service.chat(AgentChatRequest(message='Why?', business_id='shop', location_id='a'))


def test_missing_context_and_validation(context):
    service, _ = fake_agent(context)
    service._context.side_effect = AgentUnavailable('Location context missing', 404)
    app.dependency_overrides[get_agent_service] = lambda: service
    client = TestClient(app)
    assert client.post('/api/agent/chat', json={'message': 'Hi', 'business_id': 'shop'}).status_code == 422
    response = client.post('/api/agent/chat', json={'message': 'Hi', 'business_id': 'shop', 'location_id': 'missing'})
    assert response.status_code == 404


def test_agent_endpoint(context):
    service, _ = fake_agent(context)
    app.dependency_overrides[get_agent_service] = lambda: service
    response = TestClient(app).post('/api/agent/chat', json={'message': 'Why?', 'business_id': 'shop', 'location_id': 'a'})
    assert response.status_code == 200
    assert response.json()['metadata']['provider'] == 'snowflake_cortex_agent'


def test_agent_unavailable_and_timeout(context):
    request = AgentChatRequest(message='Hi', business_id='shop', location_id='a')
    with pytest.raises(AgentUnavailable, match='requires live'):
        CortexAgentService(Settings(_env_file=None)).chat(request)
    def timeout(req):
        raise httpx.ReadTimeout('sensitive token should not leak')
    service = CortexAgentService(settings(), transport=httpx.MockTransport(timeout))
    service._context = MagicMock(return_value=context)
    with pytest.raises(AgentUnavailable) as error:
        service.chat(request)
    assert 'sensitive' not in str(error.value)


def test_agent_rate_limit(context):
    service = CortexAgentService(settings(), transport=httpx.MockTransport(lambda req: httpx.Response(429)))
    service._context = MagicMock(return_value=context)
    with pytest.raises(AgentUnavailable) as error:
        service.chat(AgentChatRequest(message='Hi', business_id='shop', location_id='a'))
    assert error.value.status_code == 429


def test_context_sql_binding(context):
    cursor, connection = MagicMock(), MagicMock()
    connection.cursor.return_value = cursor
    cursor.fetchall.return_value = [(context.model_dump_json(),)]
    service = CortexAgentService(settings(), MagicMock(return_value=connection))
    service._context("shop' OR 1=1", 'a')
    sql, params = cursor.execute.call_args.args
    assert "shop'" not in sql and params == ("shop' OR 1=1", 'a')
    cursor.close.assert_called_once()
    connection.close.assert_called_once()


def test_failed_continuation_invalidates_handle(context):
    service, _ = fake_agent(context)
    request = AgentChatRequest(message='Why?', business_id='shop', location_id='a')
    request.conversation_id = service.chat(request).conversation_id
    service._context.side_effect = AgentUnavailable('Context no longer available', 404)
    with pytest.raises(AgentUnavailable):
        service.chat(request)
    assert request.conversation_id not in service.conversations


def test_unrelated_tools_fail_closed(context):
    def handler(request):
        return httpx.Response(200, json={'agent_spec': {'tools': [{'tool_spec': {'name': 'web', 'type': 'web_search'}}], 'tool_resources': {}}})
    service = CortexAgentService(settings(), transport=httpx.MockTransport(handler))
    service._context = MagicMock(return_value=context)
    with pytest.raises(AgentUnavailable, match='configured Cortex Analyst'):
        service.chat(AgentChatRequest(message='Why?', business_id='shop', location_id='a'))
