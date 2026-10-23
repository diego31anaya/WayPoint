"""Write the data the frontend reads, one file per ZIP code.

  frontend/public/data/index.json      ZIP list, sources, LA County findings, CA survival by category
  frontend/public/data/zip/<zip>.json  places in that ZIP + owner numbers around its center

Run from the repo root: python3 -m data.export
"""
import json
import shutil
from datetime import date

import pandas as pd

from . import db, owner
from .categories import FRIENDLY

MILE_M = 1609.34
RADII_MILES = (1, 2, 3)
MIN_ZIP_PLACES = 50
OUT = db.HERE.parent / "frontend" / "public" / "data"
SOURCES = ["Overture Maps Foundation (via CARTO, Snowflake Marketplace)",
           "SafeGraph US Open Census Data (ACS 2019 5-year)"]


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), default=str))


def demographics(cbg, lat, lon, radius_m):
    """Census block groups whose centroid is within radius: totals and population-weighted medians."""
    near = cbg[db.haversine_m(lat, lon, cbg.lat, cbg.lon) <= radius_m]
    pop = near.total_population.fillna(0)
    wavg = lambda col: (round(float((near[col] * pop).sum() / pop[near[col].notna()].sum()))
                        if pop[near[col].notna()].sum() else None)
    return {"radius_m": radius_m, "block_groups": len(near), "population": int(pop.sum()),
            "median_household_income": wavg("median_household_income"), "median_age": wavg("median_age")}


def zip_report(zipcode, rows, cbg):
    lat, lon = round(rows.lat.median(), 5), round(rows.lon.median(), 5)
    far = max(RADII_MILES) * MILE_M
    area = db.get_places(lat, lon, far, full=True)  # scored once, filtered by radius below
    area["distance_m"] = db.haversine_m(lat, lon, area.lat, area.lon).round()
    status = db.offline_rows()
    status = status[db.haversine_m(lat, lon, status.lat, status.lon) <= far]
    status = status.assign(category=[db.friendly_category(t, s, p) for t, s, p in
                                     zip(status.top_category, status.sub_category, status.category)],
                           distance_m=db.haversine_m(lat, lon, status.lat, status.lon))
    city = db.clean(db.fetch_raw(lat, lon, owner.CITY_RADIUS_M))
    city_km2 = 3.14159 * (owner.CITY_RADIUS_M / 1000) ** 2

    categories = {}
    for cat in FRIENDLY:
        city_density = (city.category == cat).sum() / city_km2
        by_radius = {}
        for miles in RADII_MILES:
            r = miles * MILE_M
            near = area[(area.category == cat) & (area.distance_m <= r)].sort_values("distance_m")
            st = status[(status.category == cat) & (status.distance_m <= r)]
            open_n = int((st.operating_status == "open").sum())
            closed_n = int((st.operating_status == "permanently_closed").sum())
            density = len(near) / (3.14159 * (r / 1000) ** 2)
            ratio = round(density / city_density, 2) if city_density else None
            by_radius[str(miles)] = {
                "competitors": len(near), "independent": int(near.is_independent.sum()),
                "nearest": near.name.head(5).tolist(),
                "per_km2": round(density, 2), "city_per_km2": round(city_density, 2),
                "density_ratio": ratio,
                "gap_score": None if ratio is None else round(min(max(1 - ratio, 0), 1), 2),
                "open": open_n, "closed": closed_n,
                "closure_rate": round(closed_n / (open_n + closed_n), 3) if open_n + closed_n else None,
            }
        categories[cat] = by_radius

    in_zip = area[area.zip == zipcode] if "zip" in area else area
    places = in_zip[db.CONTRACT].round({"lat": 5, "lon": 5, "hidden_gem_score": 2})
    return {"zip": zipcode, "center": {"lat": lat, "lon": lon},
            "category_mix_1mi": area[area.distance_m <= MILE_M].category.value_counts().to_dict(),
            "demographics": demographics(cbg, lat, lon, 2 * MILE_M),
            "categories": categories,
            "places": places.to_dict("records")}


def main():
    rows = db.offline_rows()
    rows = rows[(rows.operating_status != "permanently_closed") & (rows.confidence > db.MIN_CONFIDENCE)]
    counts = rows.zip.value_counts()
    zips = sorted(counts[counts >= MIN_ZIP_PLACES].index)
    cbg = owner._read("la_cbg.csv")

    shutil.rmtree(OUT, ignore_errors=True)
    index = []
    for i, z in enumerate(zips, 1):
        report = zip_report(z, rows[rows.zip == z], cbg)
        write(OUT / "zip" / f"{z}.json", report)
        index.append({"zip": z, **report["center"], "places": len(report["places"])})
        if i % 25 == 0:
            print(f"{i}/{len(zips)} zips")

    ca = {}
    for cat in FRIENDLY:
        s = owner.survival(cat, 0, 0, 0)  # radius 0: only the statewide part is used
        ca[cat] = {k: s[k] for k in ("ca_open", "ca_closed", "ca_closure_rate",
                                     "ca_most_durable", "ca_least_durable")}
    write(OUT / "index.json", {
        "generated": date.today().isoformat(), "sources": SOURCES, "score_weights": db.WEIGHTS,
        "radii_miles": RADII_MILES, "city_radius_m": owner.CITY_RADIUS_M,
        "note": "hidden_gem_score, gap_score and closure rates are proxies, not measured demand or sales",
        "la_county": owner.LA_FINDINGS, "ca_survival": ca, "zips": index})
    size = sum(p.stat().st_size for p in OUT.rglob("*.json")) // 1024
    print(f"wrote {len(zips)} zip files + index.json to {OUT.relative_to(db.HERE.parent)} ({size} KB)")


if __name__ == "__main__":
    main()
