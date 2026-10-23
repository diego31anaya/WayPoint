"""Explicit live inference smoke test using synthetic Pomona records, never Snowflake claims."""
import argparse
import json
import time
from app.config import Settings
from app.data.demo_data import demo_businesses
from app.schemas import AnalysisRequest
from app.services.ai_service import AIService, validate_evidence
from app.schemas import RecommendationBatch
from app.services.analytics_service import from_businesses, get_neighborhood_insights, neighborhood_summary
from app.services.scoring_service import score_opportunities


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, default=120)
    args = parser.parse_args()
    settings = Settings(ai_enabled=True, data_mode='mock', ollama_retries=0, ollama_timeout_s=args.timeout)
    service = AIService(settings)
    availability = service.check_availability()
    print(json.dumps({'model': settings.ollama_model, 'availability': availability, 'data_source': 'synthetic_sample'}), flush=True)
    if availability != 'available':
        return 2
    request = AnalysisRequest(business_name='Demo Coffee', business_type='coffee_shop',
        location={'latitude': 34.0551, 'longitude': -117.7499}, products_and_services=['Coffee', 'Pastries'],
        business_goal='Attract more customers', target_customers=['Students'], monthly_marketing_budget=100,
        existing_marketing_strategies=['Student discounts'], current_challenges=['Limited local awareness'])
    places = demo_businesses(request)
    metrics = from_businesses(request, places)
    evidence = get_neighborhood_insights(metrics)
    start = time.monotonic()
    recs, source, warnings = service.generate_recommendations(request,
        {'metrics': metrics, 'evidence': evidence, 'neighborhood': neighborhood_summary(request, metrics, places)},
        score_opportunities(metrics))
    print(json.dumps({'source': source, 'elapsed_s': round(time.monotonic()-start, 2), 'warnings': warnings,
                      'recommendations': [r.model_dump() for r in recs]}, indent=2), flush=True)
    if source != 'open_weight_model':
        return 1
    validate_evidence(RecommendationBatch(recommendations=recs), evidence)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
