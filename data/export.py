"""Write the data the frontend reads: frontend/public/data/{places,insights}.json.

Run from the repo root: python3 -m data.export
"""
import json
from datetime import date

from . import db, owner
from .categories import FRIENDLY, friendly_category

CENTER = {"name": "Cal Poly Pomona", "lat": 34.0575, "lon": -117.8216}
COVERAGE_M = 5000  # the sample extract's radius; outside it there's no data
MILE_M = 1609.34
OUT = db.HERE.parent / "frontend" / "public" / "data"
SOURCES = ["Overture Maps Foundation (via CARTO, Snowflake Marketplace)",
           "SafeGraph US Open Census Data (ACS 2019 5-year)"]


def write(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(json.dumps(obj, separators=(",", ":"), default=str))
    print(f"wrote {path.relative_to(db.HERE.parent)} ({path.stat().st_size // 1024} KB)")


def main():
    lat, lon = CENTER["lat"], CENTER["lon"]
    places = db.get_places(lat, lon, COVERAGE_M).round({"lat": 6, "lon": 6})

    status = owner._read("pomona_status.csv")
    closed = status[status.operating_status == "permanently_closed"].copy()
    closed["category"] = [friendly_category(t, s, p) for t, s, p in
                          zip(closed.top_category, closed.sub_category, closed.category)]
    closed = closed.dropna(subset=["category"])[["name", "category", "lat", "lon"]]

    meta = {"generated": date.today().isoformat(), "center": CENTER, "coverage_m": COVERAGE_M,
            "sources": SOURCES, "score_weights": db.WEIGHTS,
            "note": "hidden_gem_score and closure rates are proxies, not measured demand or sales"}
    write("places.json", {**meta, "places": places.to_dict("records"),
                          "closed_places": closed.to_dict("records")})

    # Owner numbers around CPP, ready to quote: one entry per category and radius in miles.
    by_category = {}
    for cat in FRIENDLY:
        s = owner.survival(cat, lat, lon, COVERAGE_M)
        s.pop("la_county")
        radii = {}
        for miles in (1, 2, 3):
            r = miles * MILE_M
            c = owner.competitors(cat, lat, lon, r)
            radii[str(miles)] = {"competitors": c["count"], "independent": c["independent"],
                                 "nearest": [p["name"] for p in c["places"][:5]],
                                 "gap": owner.gap_score(cat, lat, lon, r),
                                 "survival": owner.survival(cat, lat, lon, r)}
            radii[str(miles)]["survival"].pop("la_county")
        by_category[cat] = {"area_5km": s, "radius_miles": radii}
    write("insights.json", {**meta, "la_county": owner.LA_FINDINGS,
                            "category_mix_2mi": owner.category_mix(lat, lon, 2 * MILE_M),
                            "categories": by_category})


if __name__ == "__main__":
    main()
