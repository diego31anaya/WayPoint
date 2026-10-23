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
        if not args.business_id or not args.location_id or not settings.snowflake_agent_token:
            print('Agent check BLOCKED: supply real stored context IDs, server token, saved agent and semantic view.')
            return 2
        try:
            response = CortexAgentService(settings).chat(AgentChatRequest(message='Explain mapped competition and the opportunity score.',
                business_id=args.business_id, location_id=args.location_id))
            print(json.dumps({'component': 'agent', 'verified': True, 'analyst_query_ids': response.analyst_query_ids}))
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
