from math import pi
import pytest
from app.data.demo_data import demo_businesses
from app.services.analytics_service import from_businesses


def test_metrics(analysis_request):
    metrics = from_businesses(analysis_request, demo_businesses(analysis_request))
    assert metrics.competitor_count == 2
    assert metrics.competitor_density_per_sq_km == pytest.approx(2/(pi*1.5**2))
    assert metrics.complementary_count == 3
    assert metrics.total_businesses == 7


def test_missing(analysis_request):
    metrics = from_businesses(analysis_request, [])
    assert metrics.competitor_count == 0
    assert metrics.nearest_competitor_distance_m is None
