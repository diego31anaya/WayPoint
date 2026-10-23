from collections import Counter
from math import pi
from app.schemas import CATEGORIES, COMPLEMENTS, DataQuality, Evidence, Metrics, NeighborhoodInsights


def get_competitor_metrics(request, distribution, nearest):
    competitors = sum(distribution.get(c, 0) for c in CATEGORIES[request.business_type])
    return Metrics(competitor_count=competitors,
                   competitor_density_per_sq_km=competitors/(pi*(request.radius_m/1000)**2),
                   nearest_competitor_distance_m=nearest,
                   complementary_count=sum(distribution.get(c, 0) for c in COMPLEMENTS[request.business_type]),
                   total_businesses=sum(distribution.values()), category_distribution=distribution,
                   competitor_share=competitors/sum(distribution.values()) if sum(distribution.values()) else 0,
                   unknown_category_count=distribution.get('unknown', 0))


def from_businesses(request, businesses):
    distances = [b.distance_m for b in businesses if b.category in CATEGORIES[request.business_type]]
    return get_competitor_metrics(request, dict(Counter(b.category for b in businesses)), min(distances, default=None))


def get_neighborhood_insights(metrics):
    evidence = [Evidence(metric_id=k, value=getattr(metrics, k), unit=u) for k, u in [
        ('competitor_count', 'locations'), ('competitor_density_per_sq_km', 'locations/km²'),
        ('complementary_count', 'locations'), ('total_businesses', 'locations')]]
    if metrics.nearest_competitor_distance_m is not None:
        evidence.append(Evidence(metric_id='nearest_competitor_distance_m', value=metrics.nearest_competitor_distance_m, unit='meters'))
    evidence.append(Evidence(metric_id='competitor_share', value=metrics.competitor_share, unit='fraction'))
    evidence.extend(Evidence(metric_id='category_count:'+category, value=count, unit='locations')
                    for category, count in sorted(metrics.category_distribution.items()))
    return evidence


def neighborhood_summary(request, metrics, places):
    classified = metrics.total_businesses - metrics.unknown_category_count
    limitations = ['Category completeness measures mapped records only, not real-world coverage.',
                   'Point-of-interest and nearest-competitor lists use returned map markers; category counts use the full result.']
    return NeighborhoodInsights(
        complementary_categories={c: metrics.category_distribution[c] for c in COMPLEMENTS[request.business_type]
                                  if c in metrics.category_distribution},
        points_of_interest=[b for b in places if b.category in {'school', 'college', 'university', 'library', 'restaurant', 'hotel', 'office'}],
        nearest_competitors=sorted([b for b in places if b.category in CATEGORIES[request.business_type]], key=lambda b: b.distance_m)[:5],
        marker_subset_only=metrics.total_businesses > len(places),
        data_quality=DataQuality(mapped_record_count=metrics.total_businesses, classified_record_count=classified,
            category_completeness=classified/metrics.total_businesses if metrics.total_businesses else None,
            confidence='limited' if classified else 'insufficient', limitations=limitations),
        limitations=limitations)
