from fastapi import APIRouter, Depends, HTTPException
from app.config import get_settings
from app.dependencies import get_data_service, get_ai_service
from app.schemas import AnalysisRequest, AnalysisResponse, Metadata, CATEGORIES, COMPLEMENTS
from app.services.analytics_service import get_neighborhood_insights
from app.services.scoring_service import score_opportunities
from app.services.snowflake_service import DataUnavailable

router = APIRouter(prefix='/api')


@router.get('/categories')
def categories():
    return {'mapping_status': 'candidate mappings; data lead must verify actual coverage',
            'categories': [{'business_type': k, 'dataset_categories': v,
                            'complementary_categories': COMPLEMENTS[k]} for k, v in CATEGORIES.items()]}


@router.post('/analyze', response_model=AnalysisResponse)
def analyze(request: AnalysisRequest, data=Depends(get_data_service), ai=Depends(get_ai_service), settings=Depends(get_settings)):
    try:
        places, metrics = data.analyze(request)
    except DataUnavailable as exc:
        raise HTTPException(503, detail={'code': 'data_unavailable', 'message': str(exc)}) from exc
    evidence = get_neighborhood_insights(metrics)
    scores = score_opportunities(metrics)
    recommendations, source, warnings = ai.generate_recommendations(request, {'metrics': metrics, 'evidence': evidence, 'scores': scores})
    warnings += ['Place coverage and category completeness are unknown. Ownership is unknown. Scores are unvalidated heuristics.']
    if settings.data_mode == 'mock':
        warnings.append('SIMULATED: fixed synthetic Pomona records; not actual Overture observations.')
    return AnalysisResponse(business_type=request.business_type, location=request.location, radius_m=request.radius_m,
        metrics=metrics, evidence=evidence, nearby_businesses=places, opportunity_signals=scores,
        recommendations=recommendations, metadata=Metadata(data_source='mock' if settings.data_mode == 'mock' else 'snowflake',
            simulated=settings.data_mode == 'mock', dataset_release=settings.dataset_release,
            ai_model=settings.ollama_model if source == 'open_weight_model' else None,
            recommendation_source=source, warnings=warnings, map_truncated=metrics.total_businesses>len(places)))
