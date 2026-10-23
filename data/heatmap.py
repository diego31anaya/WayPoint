"""Opportunity heatmap: for each H3 hexagon and category, how much room a new business has.

Run from the repo root: python3 -m data.heatmap   (needs `pip install h3`)
  frontend/public/data/heat/cells.json        hexagon outlines, shared by all categories
  frontend/public/data/heat/<category>.json   one score per hexagon (cafe, restaurant, retail, services)

Each hexagon is scored over itself and its ring of neighbors (~1.3 km across), from the same
places, filters and categories as the rest of the data layer. data/sql/heatmap.sql is the
same computation in Snowflake. Scores are proxies, not measured demand.
"""
import json
import math

import h3
import numpy as np
import pandas as pd

from . import db
from .categories import FRIENDLY, friendly_category

RES = 8            # H3 resolution 8: ~0.74 km² per hexagon
RING = 1           # neighborhood = hexagon + its 6 neighbors
MIN_ACTIVE = 25    # fewer active businesses in the neighborhood: too little activity to score
PRIOR = 10         # closure rates shrink toward the LA rate, as if 10 more places closed at LA's rate
WEIGHTS = {"room": 0.45, "survival": 0.35, "activity": 0.20}
OUT = db.HERE.parent / "frontend" / "public" / "data" / "heat"


def counts_per_cell():
    """Per hexagon: active businesses overall and per category, plus open/closed per category."""
    df = db.offline_rows().dropna(subset=["name", "lat", "lon"]).copy()
    df["name"] = df["name"].str.strip()
    df = df[df["name"] != ""]
    df["group"] = [friendly_category(t, s, p) for t, s, p in zip(df.top_category, df.sub_category, df.category)]
    df = df.dropna(subset=["group"])
    df["cell"] = [h3.latlng_to_cell(lat, lon, RES) for lat, lon in zip(df.lat, df.lon)]

    # Competitors as in db.fetch_raw/clean: not closed, confidence > cutoff, one per name + location.
    active = df[(df.operating_status != "permanently_closed") & (df.confidence > db.MIN_CONFIDENCE)]
    active = active.drop_duplicates(subset=["name", "lat", "lon"])
    table = pd.DataFrame({"total": active.groupby("cell").size()})
    for status, col in [("open", "open"), ("permanently_closed", "closed")]:
        part = df[df.operating_status == status].groupby(["cell", "group"]).size().unstack(fill_value=0)
        table = table.join(part.add_prefix(col + "_"), how="outer")
    table = table.join(active.groupby(["cell", "group"]).size().unstack(fill_value=0).add_prefix("active_"), how="outer")
    return table.fillna(0)


def neighborhood_sums(table):
    """Sum each hexagon's counts over its neighborhood; scores cover every hexagon near a business."""
    pairs = [(nb, cell) for cell in table.index for nb in h3.grid_disk(cell, RING)]
    links = pd.DataFrame(pairs, columns=["cell", "source"])
    return table.reindex(links.source).set_axis(links.cell).groupby(level=0).sum()


def score(sums, la, group):
    """0-100: room in the market, survival vs LA, and enough activity to matter."""
    total = sums["total"]
    comp = sums.get(f"active_{group}", 0)
    expected = la["share"][group] * total                      # competitors a typical LA area this busy has
    room = (1 - (comp / expected) / 2).clip(0, 1)              # none: 1, LA-typical: 0.5, double: 0
    opened, closed = sums.get(f"open_{group}", 0), sums.get(f"closed_{group}", 0)
    rate = (closed + PRIOR * la["closure"][group]) / (opened + closed + PRIOR)
    survival = (1 - (rate / la["closure"][group]) / 2).clip(0, 1)  # LA-typical closure rate: 0.5
    activity = (np.log1p(total) / math.log1p(total.quantile(0.9))).clip(0, 1)
    points = 100 * (WEIGHTS["room"] * room + WEIGHTS["survival"] * survival + WEIGHTS["activity"] * activity)
    return pd.DataFrame({"score": points.round().astype(int), "competitors": comp.astype(int),
                         "expected": expected.round(1), "closure_rate": rate.round(3),
                         "tracked": (opened + closed).astype(int), "businesses": total.astype(int)})


def main():
    table = counts_per_cell()
    la = {"share": {g: table[f"active_{g}"].sum() / table.total.sum() for g in FRIENDLY},
          "closure": {g: table[f"closed_{g}"].sum() / (table[f"open_{g}"].sum() + table[f"closed_{g}"].sum())
                      for g in FRIENDLY}}
    sums = neighborhood_sums(table)
    sums = sums[sums.total >= MIN_ACTIVE]

    OUT.mkdir(parents=True, exist_ok=True)
    outlines = {cell: [round(x, 4) for point in h3.cell_to_boundary(cell) for x in point] for cell in sums.index}
    (OUT / "cells.json").write_text(json.dumps(outlines, separators=(",", ":")))
    for group in FRIENDLY:
        scored = score(sums, la, group)
        meta = {"category": group, "resolution": RES, "ring": RING, "min_active": MIN_ACTIVE, "weights": WEIGHTS,
                "la_share": round(la["share"][group], 4), "la_closure_rate": round(la["closure"][group], 4),
                "columns": ["cell", *scored.columns]}
        rows = [[cell, *row] for cell, row in zip(scored.index, scored.itertuples(index=False))]
        (OUT / f"{group}.json").write_text(json.dumps({**meta, "cells": rows}, separators=(",", ":"), default=float))
        print(f"{group}: {len(rows)} hexagons, LA share {la['share'][group]:.1%}, LA closure {la['closure'][group]:.1%}, "
              f"score median {scored.score.median():.0f} (p10 {scored.score.quantile(.1):.0f}, p90 {scored.score.quantile(.9):.0f})")


if __name__ == "__main__":
    main()
