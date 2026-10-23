from app.schemas import Signal


def score_opportunities(metrics):
    if not metrics.total_businesses:
        return []  # Absence of mapped records is not evidence of opportunity.
    low_pressure = 1/(1 + metrics.competitor_density_per_sq_km/5)
    complement = metrics.complementary_count/(metrics.complementary_count+5)
    return [Signal(signal_id='opportunity_signal', score=round(100*(0.4*low_pressure+0.6*complement), 2),
                   explanation='Heuristic: 40% inverse competition density (scale 5/km²), 60% complementary presence (scale 5 locations). Not a demand or profit forecast.',
                   evidence_ids=['competitor_density_per_sq_km', 'complementary_count']),
            Signal(signal_id='potential_category_gap', score=round(100*low_pressure, 2),
                   explanation='Lower mapped category density suggests an experiment to investigate; it does not establish unmet demand.',
                   evidence_ids=['competitor_density_per_sq_km'])]
