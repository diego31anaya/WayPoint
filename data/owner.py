"""Owner-view numbers. Every output is a plain count or ratio a recommendation can quote."""
import math

import pandas as pd

from .categories import friendly_category
from . import db
from .db import HERE, clean, fetch_raw, get_places, haversine_m

CITY_RADIUS_M = 10_000


def competitors(category, lat, lon, radius_m=1000):
    df = get_places(lat, lon, radius_m, category)
    df = df.assign(distance_m=haversine_m(lat, lon, df.lat, df.lon).round()).sort_values("distance_m")
    return {"category": category, "radius_m": radius_m, "count": len(df),
            "independent": int(df.is_independent.sum()), "places": df.to_dict("records")}


def category_mix(lat, lon, radius_m=1000):
    return get_places(lat, lon, radius_m)["category"].value_counts().to_dict()


def gap_score(category, lat, lon, radius_m=1000, city_radius_m=CITY_RADIUS_M):
    """Compare category density in the area to the wider city around it.

    density_ratio < 1 means the area has fewer of this category per km² than the
    city does; gap_score = 1 - ratio, clamped to 0..1 (1 = none here at all).
    """
    # Counts only, so skip scoring (the chain-distance matrix gets big at city scale).
    area_n = (clean(fetch_raw(lat, lon, radius_m))["category"] == category).sum()
    city_n = (clean(fetch_raw(lat, lon, city_radius_m))["category"] == category).sum()
    area_km2 = math.pi * (radius_m / 1000) ** 2
    city_km2 = math.pi * (city_radius_m / 1000) ** 2
    area_d, city_d = area_n / area_km2, city_n / city_km2
    ratio = area_d / city_d if city_d else None
    return {"category": category, "area_count": int(area_n), "area_km2": round(area_km2, 2),
            "area_per_km2": round(area_d, 2), "city_count": int(city_n), "city_km2": round(city_km2, 2),
            "city_per_km2": round(city_d, 2),
            "density_ratio": None if ratio is None else round(ratio, 2),
            "gap_score": None if ratio is None else round(min(max(1 - ratio, 0), 1), 2)}


# LA County comparisons run in Snowflake with CoCo on 2026-10-23 (354,589 places with
# an open/closed status). Rates are closed / (open + closed); comparisons, not causes.
LA_FINDINGS = {
    "independent_closure_rate": 0.090,
    "chain_closure_rate": 0.021,
    "closure_rate_by_competitors_500m": {"0": 0.067, "3-5": 0.085, "6-15": 0.101, "16+": 0.136},
    "income_effect": "flat: 7.7% (low), 7.7% (middle), 8.8% (high income tercile)",
}
MIN_CATEGORY_PLACES = 200  # for "what survives" lists; smaller groups are noisy


def _read(name):
    df = pd.read_csv(HERE / name)
    df.columns = df.columns.str.lower()
    return df


def is_category(df, category):
    # A Series, not a list: an empty list would select zero columns instead of zero rows.
    return pd.Series([friendly_category(t, s, p) == category for t, s, p in
                      zip(df.top_category, df.sub_category, df.category)], index=df.index, dtype=bool)


def survival(category, lat, lon, radius_m=2000):
    """Open vs. permanently closed counts for a friendly category, locally and across CA.

    Success proxy = survival. Overture only marks some closures, so rates run low.
    """
    local = db.offline_rows() if db.REGION.exists() else _read("pomona_status.csv")
    local = local[haversine_m(lat, lon, local.lat, local.lon) <= radius_m]
    local = local[is_category(local, category)]
    open_n = int((local.operating_status == "open").sum())
    closed = local[local.operating_status == "permanently_closed"]

    ca = _read("category_survival.csv")
    ca = ca[is_category(ca, category)]
    rated = ca[(ca.open_n + ca.closed_n >= MIN_CATEGORY_PLACES) & (ca.closed_n > 0)  # 0 = source never marks closures
               & (ca.category != ca.top_category) & (ca.category != ca.sub_category)  # skip generic labels
               & (ca.category != category)]
    rate = lambda o, c: round(c / (o + c), 3) if o + c else None
    pick = lambda df: df[["category", "closure_rate"]].to_dict("records")
    return {
        "category": category, "radius_m": radius_m,
        "local_open": open_n, "local_closed": len(closed),
        "local_closure_rate": rate(open_n, len(closed)),
        "local_closed_examples": closed["name"].head(5).tolist(),
        "ca_open": int(ca.open_n.sum()), "ca_closed": int(ca.closed_n.sum()),
        "ca_closure_rate": rate(ca.open_n.sum(), ca.closed_n.sum()),
        "ca_most_durable": pick(rated.nsmallest(3, "closure_rate")),
        "ca_least_durable": pick(rated.nlargest(3, "closure_rate")),
        "la_county": LA_FINDINGS,
    }
