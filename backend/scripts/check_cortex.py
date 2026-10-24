"""Explicit live checks; AI_COMPLETE and saved Agent are reported independently."""
import argparse
import json
from app.config import Settings
from app.schemas import AgentChatRequest, AnalysisRequest
from app.data.demo_data import demo_businesses
from app.services.analytics_service import from_businesses, get_neighborhood_insights
from app.services.scoring_service import score_opportunities
from app.services.cortex_ai_service import CortexAIService
from app.services.cortex_agent_service import CortexAgentService, AgentUnavailable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--component', choices=['ai', 'agent'], default='ai')
    parser.add_argument('--business-id')
    parser.add_argument('--location-id')
    args = parser.parse_args()
    settings = Settings(ai_enabled=True)
    if args.component == 'agent':
        if not settings.snowflake_account or not (settings.snowflake_pat or settings.snowflake_agent_token):
            print('Agent check BLOCKED: configure SNOWFLAKE_ACCOUNT and SNOWFLAKE_PAT server-side.')
            return 2
        try:
            request = AgentChatRequest(message='Which business category has the highest reported closure rate? Briefly explain the data limitation.',
                business_id=args.business_id, location_id=args.location_id)
            service = CortexAgentService(settings)
            response = service.chat(request)
            followup = service.chat(AgentChatRequest(message='For that same category, why is the reported rate not a survival forecast?',
                business_id=args.business_id, location_id=args.location_id, conversation_id=response.conversation_id))
            print(json.dumps({'component': 'agent', 'verified': True, 'agent': response.metadata['agent'],
                'conversation_id': response.conversation_id, 'followup_same_conversation': followup.conversation_id == response.conversation_id,
                'analyst_query_ids': response.analyst_query_ids, 'location_context': response.metadata['location_context']}))
            return 0
        except AgentUnavailable as exc:
            print('Agent check FAILED: '+str(exc))
            return 1
    if not settings.snowflake_account or not settings.snowflake_user:
        print('AI_COMPLETE check BLOCKED: Snowflake account/user credentials are not configured. No live inference verified.')
        return 2
    request = AnalysisRequest(business_type='coffee_shop', location={'latitude': 34.0551, 'longitude': -117.7499})
    metrics = from_businesses(request, demo_businesses(request))
    service = CortexAIService(settings)
    recs, source, warnings = service.generate_recommendations(request,
        {'metrics': metrics, 'evidence': get_neighborhood_insights(metrics)}, score_opportunities(metrics))
    print(json.dumps({'component': 'ai_complete', 'model': settings.snowflake_cortex_model, 'data_source': 'synthetic_sample',
                      'recommendation_source': source, 'recommendation_count': len(recs), 'warnings': warnings}))
    return 0 if source in {'open_weight_model', 'cortex_ai'} else 1


if __name__ == '__main__':
    raise SystemExit(main())
