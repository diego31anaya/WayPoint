"""Numbers for the presentation's data story, from the local LA export.

Run from the repo root: python3 -m data.eda   (needs scipy)  ->  data/eda.json

Closure = Overture operating_status: permanently_closed / (open + permanently_closed);
places with no status are left out. Comparisons, not causes, and closures are under-reported.
"""
import json

import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from . import db
from .categories import FRIENDLY, friendly_category

OUT = db.HERE / "eda.json"
NEAR_M = 500
COMPETITION_BUCKETS = [(0, 0, "0"), (1, 2, "1–2"), (3, 5, "3–5"), (6, 15, "6–15"), (16, 10**9, "16+")]


def rate(closed):
    return round(float(closed.mean()), 4), int(closed.sum()), int(len(closed))


def xy(df):
    """Meters on a local flat projection; fine at LA scale."""
    lat0 = np.radians(34.05)
    return np.c_[df.lon.values * 111_320 * np.cos(lat0), df.lat.values * 110_540]


def main():
    places = db.offline_rows().dropna(subset=["name", "lat", "lon"]).copy()
    places["group"] = [friendly_category(t, s, p) for t, s, p in
                       zip(places.top_category, places.sub_category, places.category)]
    places["key"] = db.name_key(places["name"])
    chains = db.ca_chain_keys()
    # Chain = an Overture brand, or a name with a brand tag / 10+ locations across California (ca_chains.csv).
    places["chain"] = places.brand.notna() | places.key.isin(chains)
    status = places[places.operating_status.isin(["open", "permanently_closed"])].copy()
    status["closed"] = status.operating_status == "permanently_closed"

    out = {"places_in_export": len(places), "places_with_status": len(status),
           "overall_closure": rate(status.closed)}
    out["independent_vs_chain"] = {"independent": rate(status.closed[~status.chain]),
                                   "chain": rate(status.closed[status.chain])}
    out["by_category"] = {g: {"all": rate(status.closed[status.group == g]),
                              "independent": rate(status.closed[(status.group == g) & ~status.chain]),
                              "chain": rate(status.closed[(status.group == g) & status.chain])} for g in FRIENDLY}

    # Same-category competitors within 500 m: active places (not closed, confidence > cutoff) in the same group.
    active = places[(places.operating_status != "permanently_closed") & (places.confidence > db.MIN_CONFIDENCE)
                    & places.group.notna()].drop_duplicates(subset=["name", "lat", "lon"])
    scoped = status[status.group.notna()].copy()
    scoped["competitors"] = 0
    for g in FRIENDLY:
        tree = cKDTree(xy(active[active.group == g]))
        mine = scoped.group == g
        counts = np.array([len(n) for n in tree.query_ball_point(xy(scoped[mine]), NEAR_M)])
        scoped.loc[mine, "competitors"] = counts - (scoped[mine].operating_status == "open").values  # not yourself
    out["closure_by_competition_500m"] = {
        label: rate(scoped.closed[scoped.competitors.between(lo, hi)]) for lo, hi, label in COMPETITION_BUCKETS}

    # Neighborhood income: nearest census block group centroid (ACS 2019), split into terciles.
    cbg = pd.read_csv(db.HERE / "la_cbg.csv").dropna(subset=["MEDIAN_HOUSEHOLD_INCOME"])
    _, nearest = cKDTree(xy(cbg.rename(columns={"LAT": "lat", "LON": "lon"}))).query(xy(scoped))
    scoped["income"] = cbg.MEDIAN_HOUSEHOLD_INCOME.values[nearest]
    cuts = scoped.income.quantile([1 / 3, 2 / 3]).round(-3).tolist()
    tercile = pd.cut(scoped.income, [-1, *cuts, np.inf], labels=["lower", "middle", "upper"])
    out["income_terciles_usd"] = cuts
    out["closure_by_income"] = {str(t): rate(scoped.closed[tercile == t]) for t in ["lower", "middle", "upper"]}

    survival = pd.read_csv(db.HERE / "category_survival.csv")
    # Walk-in categories only (the same scope as the app), 1,000+ places, and at least one closure on record:
    # a 0% rate usually means closures aren't tracked for that category, not that none happened.
    walk_in = np.array([friendly_category(t, s, c) is not None for t, s, c in
               zip(survival.TOP_CATEGORY, survival.SUB_CATEGORY, survival.CATEGORY)])
    big = survival[walk_in & (survival.OPEN_N + survival.CLOSED_N >= 1000) & (survival.CLOSED_N > 0)]
    big = big.sort_values("CLOSURE_RATE")
    pick = lambda rows: [{"category": r.CATEGORY, "closure_rate": float(r.CLOSURE_RATE), "places": int(r.OPEN_N + r.CLOSED_N)}
                         for r in rows.itertuples()]
    out["ca_categories_1000plus"] = {"count": len(big), "most_durable": pick(big.head(6)), "least_durable": pick(big.tail(6)[::-1])}

    OUT.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
