from collections import Counter
from math import pi
from app.schemas import CATEGORIES, COMPLEMENTS, Evidence, Metrics


def get_competitor_metrics(request, distribution, nearest):
    competitors = sum(distribution.get(c, 0) for c in CATEGORIES[request.business_type])
    return Metrics(competitor_count=competitors,
                   competitor_density_per_sq_km=competitors/(pi*(request.radius_m/1000)**2),
                   nearest_competitor_distance_m=nearest,
                   complementary_count=sum(distribution.get(c, 0) for c in COMPLEMENTS[request.business_type]),
                   total_businesses=sum(distribution.values()), category_distribution=distribution)


def from_businesses(request, businesses):
    distances = [b.distance_m for b in businesses if b.category in CATEGORIES[request.business_type]]
    return get_competitor_metrics(request, dict(Counter(b.category for b in businesses)), min(distances, default=None))


def get_neighborhood_insights(metrics):
    evidence = [Evidence(metric_id=k, value=getattr(metrics, k), unit=u) for k, u in [
        ('competitor_count', 'locations'), ('competitor_density_per_sq_km', 'locations/km²'),
        ('complementary_count', 'locations'), ('total_businesses', 'locations')]]
    if metrics.nearest_competitor_distance_m is not None:
        evidence.append(Evidence(metric_id='nearest_competitor_distance_m', value=metrics.nearest_competitor_distance_m, unit='meters'))
    return evidence
