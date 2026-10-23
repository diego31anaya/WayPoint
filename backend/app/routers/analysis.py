from fastapi import APIRouter, Depends, HTTPException
from app.config import get_settings
from app.dependencies import get_data_service, get_ai_service
from app.schemas import AnalysisRequest, AnalysisResponse, Metadata, CATEGORIES, COMPLEMENTS, BUSINESS_GOALS
from app.services.analytics_service import get_neighborhood_insights, neighborhood_summary
from app.services.scoring_service import score_opportunities
from app.services.snowflake_service import DataUnavailable, offline_analysis

router = APIRouter(prefix='/api')


@router.get('/categories')
def categories():
    return {'mapping_status': 'candidate mappings; data lead must verify actual coverage',
            'business_goals': BUSINESS_GOALS,
            'categories': [{'business_type': k, 'dataset_categories': v,
                            'complementary_categories': COMPLEMENTS[k]} for k, v in CATEGORIES.items()]}


@router.post('/analyze', response_model=AnalysisResponse)
def analyze(request: AnalysisRequest, data=Depends(get_data_service), ai=Depends(get_ai_service), settings=Depends(get_settings)):
    data_source = {'live': 'snowflake'}.get(settings.data_mode, settings.data_mode)
    data_warnings = []
    try:
        places, metrics = data.analyze(request)
    except DataUnavailable as exc:
        if settings.data_mode != 'live' or not settings.local_fallback:
            raise HTTPException(503, detail={'code': 'data_unavailable', 'message': str(exc)}) from exc
        places, metrics = offline_analysis(request, settings.map_limit)
        data_source = 'local'
        data_warnings = [f'Snowflake unavailable ({exc}); analyzed the local export of the same places instead.']
    evidence = get_neighborhood_insights(metrics)
    scores = score_opportunities(metrics)
    summary = neighborhood_summary(request, metrics, places)
    registry = {e.metric_id: e for e in evidence}
    for score in scores:
        score.contributing_metrics = [registry[key] for key in score.evidence_ids]
    recommendations, source, warnings = ai.generate_recommendations(request, {'metrics': metrics, 'evidence': evidence,
                                                                            'neighborhood': summary}, scores)
    warnings += data_warnings + ['Place coverage and category completeness are unknown. Ownership is unknown. Scores are unvalidated heuristics.']
    if settings.data_mode == 'mock':
        warnings.append('SIMULATED: fixed synthetic Pomona records; not actual Overture observations.')
    return AnalysisResponse(business_type=request.business_type, location=request.location, radius_m=request.radius_m,
        business_information=request, neighborhood_insights=summary,
        metrics=metrics, evidence=evidence, nearby_businesses=places, opportunity_signals=scores,
        recommendations=recommendations, metadata=Metadata(data_source=data_source,
            simulated=settings.data_mode == 'mock', dataset_release=settings.dataset_release,
            ai_model=settings.ollama_model if source == 'open_weight_model' else None,
            recommendation_source=source, warnings=warnings, map_truncated=metrics.total_businesses>len(places)))
