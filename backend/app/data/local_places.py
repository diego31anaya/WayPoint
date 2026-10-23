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
MIN_CONFIDENCE = 0.7  # same cutoff as data/db.py


@lru_cache(maxsize=1)
def load_places(path=PLACES):
    """(name, category, lat, lon) for places not permanently closed, filtered like the data layer
    (data/db.py: confidence > MIN_CONFIDENCE, one row per name and location)."""
    rows, seen = [], set()
    with gzip.open(path, 'rt', newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            key = (r['NAME'].strip(), r['LAT'], r['LON'])
            if (r['OPERATING_STATUS'] == 'permanently_closed' or not r['LAT'] or not r['LON'] or not key[0]
                    or float(r['CONFIDENCE'] or 0) <= MIN_CONFIDENCE or key in seen):
                continue
            seen.add(key)
            rows.append((key[0], r['CATEGORY'] or 'unknown', float(r['LAT']), float(r['LON'])))
    return rows


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
