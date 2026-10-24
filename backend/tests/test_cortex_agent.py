"""Mocked SDK tests. Live credentials are never used by the test suite."""
from types import SimpleNamespace
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from cortex_agent_sdk.errors import CortexAgentAPIError
from app.config import Settings
from app.main import app
from app.dependencies import get_agent_service
from app.schemas import AgentChatRequest, StoredLocationContext
from app.services.analytics_service import from_businesses
from app.services.cortex_agent_service import CortexAgentService, AgentUnavailable
from app.data.demo_data import demo_businesses


def settings(**kwargs):
    return Settings(_env_file=None, snowflake_account='fixture-account', snowflake_pat='fixture-token', **kwargs)


def fake_agent(context=None, response=None):
    client, api_client = MagicMock(), MagicMock()
    client.__enter__.return_value = client
    api_client.__enter__.return_value = api_client
    api_client.agent.describe.return_value = {'agent_spec': {
        'tools': [{'tool_spec': {'name': 'BUSINESS_ANALYTICS', 'type': 'cortex_analyst_text_to_sql'}},
                  {'tool_spec': {'name': 'code_execution', 'type': 'code_execution'}}],
        'tool_resources': {'BUSINESS_ANALYTICS': {'semantic_view': 'WAYPOINT.PUBLIC.BUSINESS_ANALYTICS'}}}}
    conversation = MagicMock()
    conversation.id = 874956572
    client.conversations.create.return_value = conversation
    client.conversations.attach.return_value = conversation
    conversation.send.return_value.result.return_value = response or SimpleNamespace(
        text='There are 2 mapped competitors.', status='completed', raw={},
        content=[{'type': 'tool_result', 'tool_result': {'type': 'system_execute_sql', 'status': 'success',
            'content': [{'json': {'query_id': 'fixture-query', 'result_set': {'data': [[2]]}}}]}}])
    service = CortexAgentService(settings(), client_factory=MagicMock(return_value=client), api_client_factory=MagicMock(return_value=api_client))
    if context:
        service._context = MagicMock(return_value=(context, []))
    return service, client, api_client


@pytest.fixture
def context(analysis_request):
    return StoredLocationContext(business_information=analysis_request,
        metrics=from_businesses(analysis_request, demo_businesses(analysis_request)), data_source='snowflake', dataset_release='test-fixture')


def test_general_questions_work_without_analysis_in_mock_dashboard_mode():
    service, client, _ = fake_agent()
    response = service.chat(AgentChatRequest(message='How should I research a business idea?'))
    assert response.conversation_id == '874956572'
    assert response.supporting_metrics == {} and response.relevant_location_ids == []
    assert response.metadata['location_context'] == 'not_supplied'
    assert response.metadata['simulated'] is False
    assert client.conversations.create.call_args.kwargs['agent']['spec']['database'] == 'WAYPOINT'
    assert service.client_factory.call_args.kwargs['auth'] == 'fixture-token'
    assert service.client_factory.call_args.kwargs['max_retries'] == 0


def test_followups_explicitly_attach_saved_agent(context):
    service, client, _ = fake_agent(context)
    first = service.chat(AgentChatRequest(message='How competitive?', business_id='shop', location_id='a'))
    service.chat(AgentChatRequest(message='What should I do?', conversation_id=first.conversation_id, business_id='shop', location_id='b'))
    expected = {'type': 'data', 'spec': {'database': 'WAYPOINT', 'schema': 'PUBLIC', 'name': 'BUSINESS_ADVISOR'}}
    client.conversations.attach.assert_called_once_with(first.conversation_id, agent=expected)
    assert client.conversations.create.call_count == 1
    assert client.conversations.attach.return_value.send.call_args.kwargs['agent'] == expected
    assert '"b"' in client.conversations.attach.return_value.send.call_args.args[0]
    assert service.conversations == {}


def test_location_context_and_query_evidence(context):
    service, client, _ = fake_agent(context)
    response = service.chat(AgentChatRequest(message='My competition?', business_id='shop', location_id='a'))
    assert response.supporting_metrics['a'][0].value == context.metrics.competitor_count
    assert response.analyst_query_ids == ['fixture-query']
    assert '"demographics": null' in client.conversations.create.return_value.send.call_args.args[0]


def test_saved_view_mismatch_fails_closed():
    service, _, api = fake_agent()
    api.agent.describe.return_value['agent_spec']['tool_resources']['BUSINESS_ANALYTICS']['semantic_view'] = 'OTHER.PUBLIC.DATA'
    with pytest.raises(AgentUnavailable, match='configured Cortex Analyst'):
        service.chat(AgentChatRequest(message='Why?'))


def test_clarifications_and_general_advice_need_no_sql_result():
    response = SimpleNamespace(text='Which neighborhood would you like to explore?', raw={}, content=[], status='completed')
    service, _, _ = fake_agent(response=response)
    assert service.chat(AgentChatRequest(message='Tell me about my location')).response == response.text


@pytest.mark.parametrize('status,text,raw', [('error','Partial answer',{}), ('completed','',{}), ('completed','Answer',{'warnings':['tool failure']})])
def test_failed_or_empty_answers_are_not_substituted(status, text, raw):
    service, _, _ = fake_agent(response=SimpleNamespace(text=text, raw=raw, content=[], status=status))
    with pytest.raises(AgentUnavailable):
        service.chat(AgentChatRequest(message='Hello'))


def test_missing_context_and_request_validation():
    service, _, _ = fake_agent()
    service._context = MagicMock(side_effect=AgentUnavailable('Location context missing',404))
    app.dependency_overrides[get_agent_service] = lambda: service
    client = TestClient(app)
    assert client.post('/api/agent/chat',json={'message':'Hello'}).status_code == 200
    assert client.post('/api/agent/chat',json={'message':'Hi','business_id':'shop'}).status_code == 422
    assert client.post('/api/agent/chat',json={'message':'Hi','business_id':'shop','location_id':'missing'}).status_code == 404
    assert client.post('/api/agent/chat',json={'message':'Hi','conversation_id':'old-local-token'}).status_code == 422


def test_mock_context_is_rejected(analysis_request):
    service, _, _ = fake_agent()
    with pytest.raises(AgentUnavailable,match='Location metrics require live'):
        service.chat(AgentChatRequest(message='My competitors?',business_information=analysis_request))


def test_error_sanitization_and_rate_limit():
    service, client, _ = fake_agent()
    client.conversations.create.side_effect = CortexAgentAPIError(429,None,{'message':'sensitive-token'})
    with pytest.raises(AgentUnavailable) as error:
        service.chat(AgentChatRequest(message='Hi'))
    assert error.value.status_code == 429 and 'sensitive' not in str(error.value)
    client.conversations.create.side_effect = RuntimeError('secret PAT value')
    with pytest.raises(AgentUnavailable) as error:
        service.chat(AgentChatRequest(message='Hi'))
    assert 'secret PAT' not in str(error.value)


def test_context_sql_binding(context):
    cursor, connection = MagicMock(), MagicMock()
    connection.cursor.return_value = cursor
    cursor.fetchall.return_value = [(context.model_dump_json(),)]
    service = CortexAgentService(settings(data_mode='live',snowflake_mapping_verified=True),MagicMock(return_value=connection))
    service._context("shop' OR 1=1",'a')
    sql,params=cursor.execute.call_args.args
    assert "shop'" not in sql and params == ("shop' OR 1=1",'a')
    cursor.close.assert_called_once()
    connection.close.assert_called_once()


def test_snapshot_register_rejects_mock(context):
    service, _, _ = fake_agent()
    with pytest.raises(AgentUnavailable,match='requires live data'):
        service.register_context(context.business_information,context.metrics,[])

def zone_for(context):
    from app.schemas import OpportunityMapResponse, ZoneFeature, ZoneGeometry, ZoneProperties
    location = context.business_information.location
    x,y = location.longitude, location.latitude
    feature = ZoneFeature(geometry=ZoneGeometry(type='Polygon',coordinates=[[[x-.001,y-.001],[x+.001,y-.001],[x+.001,y+.001],[x-.001,y+.001],[x-.001,y-.001]]]),
        properties=ZoneProperties(h3_cell='fixture-cell',area_sq_km=1.75,competitor_count=7,competitor_density_per_sq_km=4,
            complementary_count=3,total_businesses=10,unknown_category_count=0,category_distribution={'coffee_shop':7,'office':3},
            opportunity_score=61.5,confidence='limited'))
    return OpportunityMapResponse(features=[feature],metadata={'simulated':False,'data_source':'snowflake'})


def zone_request(context):
    from app.schemas import SelectedZoneContext, OpportunityMapRequest
    return SelectedZoneContext(h3_cell='fixture-cell',map_request=OpportunityMapRequest(business_type=context.business_information.business_type,
        location=context.business_information.location))


def test_selected_zone_metrics_are_requeried_and_kept_separate(context):
    import json
    service, client, _ = fake_agent(context)
    service.settings.data_mode = 'live'
    service.maps.get_map = MagicMock(return_value=zone_for(context))
    response=service.chat(AgentChatRequest(message='Why this zone?',business_id='shop',location_id='a',selected_zone=zone_request(context)))
    prompt=json.loads(client.conversations.create.return_value.send.call_args.args[0].split('\n',1)[1])
    assert prompt['locations']['a']['metrics']['competitor_count'] == 2
    assert prompt['locations']['a']['selected_zone']['competitor_count'] == 7
    assert prompt['locations']['a']['demographics'] is None
    assert any(item.metric_id == 'zone:opportunity_score' and item.value == 61.5 for item in response.supporting_metrics['a'])
    service.maps.get_map.assert_called_once()


@pytest.mark.parametrize('invalid', ['wrong_cell','wrong_center','mock_source','wrong_category'])
def test_invalid_zone_context_fails_closed(context,invalid):
    service, client, _ = fake_agent(context)
    service.settings.data_mode='live'
    result=zone_for(context)
    selected=zone_request(context)
    if invalid=='wrong_cell': selected.h3_cell='not-in-map'
    if invalid=='wrong_center':
        for point in result.features[0].geometry.coordinates[0]: point[0] += 1
    if invalid=='mock_source': result.metadata['simulated']=True
    if invalid=='wrong_category': selected.map_request.business_type='bakery'
    service.maps.get_map=MagicMock(return_value=result)
    with pytest.raises(AgentUnavailable):
        service.chat(AgentChatRequest(message='Why here?',business_id='shop',location_id='a',selected_zone=selected))
    client.conversations.create.assert_not_called()


def test_context_expiry_and_missing_credentials(context):
    service, _, _=fake_agent()
    service.contexts[('shop','a')]={'context':context,'places':[],'expires':0}
    with pytest.raises(AgentUnavailable,match='expired'):
        service._context('shop','a')
    service.settings.snowflake_pat=''
    with pytest.raises(AgentUnavailable,match='SNOWFLAKE_PAT'):
        service.chat(AgentChatRequest(message='Hello'))

def test_markdown_newlines_survive_initial_and_followup_processing():
    markdown = '## Findings\n\n**Verified** and *limited*.\n\n- First\n- Second\n\n```sql\nSELECT 1;\n```\n\n| Metric | Value |\n| --- | --- |\n| Count | 1 |'
    markdown = '\n' + markdown + '\n'
    response = SimpleNamespace(text=markdown, raw={}, content=[], status='completed')
    service, client, _ = fake_agent(response=response)
    first = service.chat(AgentChatRequest(message='Show formatted results'))
    followup = service.chat(AgentChatRequest(message='Explain those results', conversation_id=first.conversation_id))
    assert first.response == markdown
    assert followup.response == markdown
    assert 'Format answers as clean Markdown' in client.conversations.attach.return_value.send.call_args.args[0]
