from app.services.analytics_service import from_businesses
from app.services.scoring_service import score_opportunities
from app.data.demo_data import demo_businesses


def test_scores(analysis_request):
    metrics = from_businesses(analysis_request, demo_businesses(analysis_request))
    baseline = score_opportunities(metrics)
    assert baseline == score_opportunities(metrics)
    metrics.complementary_count += 10
    assert score_opportunities(metrics)[0].score > baseline[0].score
    metrics.competitor_density_per_sq_km += 100
    assert score_opportunities(metrics)[1].score < baseline[1].score


def test_no_records(analysis_request):
    assert score_opportunities(from_businesses(analysis_request, [])) == []
