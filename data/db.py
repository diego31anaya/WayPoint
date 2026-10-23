"""get_places(): the data hand-off for the frontend and AI teammates.

Pulls Overture Places from Snowflake, caches each area to data/cache/, and falls
back to data/sample_places.csv when no Snowflake credentials are set.
"""
import os
from pathlib import Path

import numpy as np
import pandas as pd

from .categories import friendly_category

HERE = Path(__file__).parent
CACHE = HERE / "cache"
SAMPLE = HERE / "sample_places.csv"
TABLE = os.environ.get("PLACES_TABLE", "OVERTURE_MAPS_PLACES.CARTO.PLACE")
MIN_CONFIDENCE = 0.7  # a guess; tune after looking at the pins
CONTRACT = ["name", "category", "lat", "lon", "is_independent", "hidden_gem_score"]

# Score weights (sum to 1). Quote these in the README.
WEIGHTS = {"independent": 0.5, "few_chains": 0.2, "rarity": 0.2, "confidence": 0.1}
CHAIN_RADIUS_M = 500
CHAIN_NAME_REPEATS = 3

QUERY = f"""
SELECT
  ID                            AS id,
  NAMES:primary::string         AS name,
  TAXONOMY:primary::string      AS category,
  TAXONOMY:hierarchy[0]::string AS top_category,
  TAXONOMY:hierarchy[1]::string AS sub_category,
  BRAND:names:primary::string   AS brand,
  CONFIDENCE                    AS confidence,
  ST_Y(GEOMETRY)                AS lat,
  ST_X(GEOMETRY)                AS lon
FROM {TABLE}
WHERE BBOX:xmin BETWEEN %(lon_lo)s AND %(lon_hi)s
  AND BBOX:ymin BETWEEN %(lat_lo)s AND %(lat_hi)s
  AND ST_DWITHIN(GEOMETRY, ST_MAKEPOINT(%(lon)s, %(lat)s), %(radius_m)s)
  AND CONFIDENCE > %(min_conf)s
  AND TAXONOMY:hierarchy[0]::string IN
      ('food_and_drink', 'shopping', 'services_and_business', 'lifestyle_services')
"""


def load_env(path=HERE.parent / ".env"):
    """Minimal .env reader: KEY=value lines, existing env vars win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def haversine_m(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6_371_000 * 2 * np.arcsin(np.sqrt(a))


def query_snowflake(lat, lon, radius_m):
    import snowflake.connector

    dlat = radius_m / 111_000
    dlon = dlat / np.cos(np.radians(lat))
    params = dict(lat=lat, lon=lon, radius_m=radius_m, min_conf=MIN_CONFIDENCE,
                  lat_lo=lat - dlat, lat_hi=lat + dlat, lon_lo=lon - dlon, lon_hi=lon + dlon)
    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE"),
        role=os.environ.get("SNOWFLAKE_ROLE", "ACCOUNTADMIN"),
    )
    try:
        cur = conn.cursor()
        cur.execute(QUERY, params)
        cols = [c[0].lower() for c in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)
    finally:
        conn.close()


def fetch_raw(lat, lon, radius_m):
    """Raw extract rows (columns of data/sql/extract.sql) for an area."""
    path = CACHE / f"{lat:.4f}_{lon:.4f}_{int(radius_m)}.csv"
    if path.exists():
        return pd.read_csv(path)
    load_env()
    if os.environ.get("SNOWFLAKE_ACCOUNT"):
        df = query_snowflake(lat, lon, radius_m)
        CACHE.mkdir(exist_ok=True)
        df.to_csv(path, index=False)
        return df
    if not SAMPLE.exists():
        raise RuntimeError("No Snowflake credentials in env/.env and no data/sample_places.csv")
    df = pd.read_csv(SAMPLE)
    df.columns = df.columns.str.lower()  # Snowflake exports UPPERCASE headers
    return df[haversine_m(lat, lon, df.lat, df.lon) <= radius_m].reset_index(drop=True)


def clean(raw):
    df = raw.dropna(subset=["name", "lat", "lon"]).copy()
    df["name"] = df["name"].str.strip()
    df = df[df["name"] != ""]
    df = df.drop_duplicates(subset="id") if "id" in df else df
    df = df.drop_duplicates(subset=["name", "lat", "lon"])
    df["raw_category"] = df["category"]
    df["category"] = [friendly_category(t, s, p) for t, s, p in
                      zip(df["top_category"], df["sub_category"], df["raw_category"])]
    return df.dropna(subset=["category"]).reset_index(drop=True)


def score(df):
    """Add is_independent and hidden_gem_score. Proxies, not measured demand."""
    if df.empty:
        return df.assign(is_independent=pd.Series(dtype=bool), hidden_gem_score=pd.Series(dtype=float))
    key = lambda col: col.str.lower().str.replace(r"[^a-z0-9]", "", regex=True)
    name_key = key(df["name"])
    repeats = name_key.value_counts()
    # Chain names = tagged brands + names seen 3+ times; then also catch untagged
    # variants like "Starbucks Coffee Company" by prefix.
    chain_keys = set(key(df["brand"].dropna())) | set(repeats[repeats >= CHAIN_NAME_REPEATS].index)
    prefixes = tuple(k for k in chain_keys if len(k) >= 5)
    is_chain = df["brand"].notna() | name_key.isin(chain_keys) | name_key.str.startswith(prefixes)
    df["is_independent"] = ~is_chain

    chains = df[is_chain]
    if len(chains):
        d = haversine_m(df.lat.values[:, None], df.lon.values[:, None], chains.lat.values, chains.lon.values)
        near = (d <= CHAIN_RADIUS_M).sum(axis=1) - is_chain.values  # don't count yourself
    else:
        near = np.zeros(len(df))
    few_chains = 1 / (1 + near)

    counts = df["raw_category"].map(df["raw_category"].value_counts())
    rarity = 1 - (counts - 1) / max(counts.max() - 1, 1)

    conf = df["confidence"].clip(0, 1).fillna(0)
    df["hidden_gem_score"] = (WEIGHTS["independent"] * df["is_independent"]
                              + WEIGHTS["few_chains"] * few_chains
                              + WEIGHTS["rarity"] * rarity
                              + WEIGHTS["confidence"] * conf).round(3)
    return df


def get_places(lat, lon, radius_m, category=None, full=False):
    """Places near (lat, lon) as the agreed contract DataFrame, best gems first.

    Scores are computed over the whole area, then filtered by category, so rarity
    stays relative to the neighborhood. full=True keeps brand/raw_category/etc.
    """
    df = score(clean(fetch_raw(lat, lon, radius_m)))
    if category:
        df = df[df["category"] == category]
    df = df.sort_values("hidden_gem_score", ascending=False).reset_index(drop=True)
    return df if full else df[CONTRACT]
