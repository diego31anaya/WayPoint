"""Owner-view numbers. Every output is a plain count or ratio a recommendation can quote."""
import math

from .db import clean, fetch_raw, get_places, haversine_m

CITY_RADIUS_M = 5_000  # matches the sample extract; raise when querying live


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
