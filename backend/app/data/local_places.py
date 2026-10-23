"""Real Overture places for the LA area from the repo's data export, so analysis works without Snowflake.

data/la_places.csv.gz is written by the data layer (data/db.py) from WAYPOINT.PUBLIC.LA_PLACES.
"""
import csv
import gzip
import math
from functools import lru_cache
from pathlib import Path
from app.data.demo_data import distance_m
from app.schemas import Business

PLACES = Path(__file__).resolve().parents[3] / 'data' / 'la_places.csv.gz'


@lru_cache(maxsize=1)
def load_places(path=PLACES):
    """(name, category, lat, lon) for every place not marked permanently closed."""
    with gzip.open(path, 'rt', newline='', encoding='utf-8') as f:
        return [(r['NAME'] or 'Unnamed business', r['CATEGORY'] or 'unknown', float(r['LAT']), float(r['LON']))
                for r in csv.DictReader(f)
                if r['OPERATING_STATUS'] != 'permanently_closed' and r['LAT'] and r['LON']]


def nearby_businesses(request, path=PLACES):
    lat, lon, radius = request.location.latitude, request.location.longitude, request.radius_m
    # Cheap bounding-box test before the exact distance.
    dlat = radius / 111_320
    dlon = dlat / max(math.cos(math.radians(lat)), 0.01)
    result = []
    for name, category, plat, plon in load_places(path):
        if abs(plat - lat) <= dlat and abs(plon - lon) <= dlon:
            d = distance_m(lat, lon, plat, plon)
            if d <= radius:
                result.append(Business(name=name, category=category, latitude=plat, longitude=plon, distance_m=d))
    return sorted(result, key=lambda b: b.distance_m)
