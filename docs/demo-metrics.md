# Demo metrics (measured, not estimated)

Measured Fri Oct 23 2026, 4:50 PM PDT, on a MacBook (Chrome), local dev servers, base commit `51f19df` plus the demo-readiness commit.
Data export: Overture Maps places via CARTO on Snowflake, exported Oct 23 2026 (`data/la_places.csv.gz`). Backend `DATA_MODE=local`, `AI_ENABLED=false`.

## Rehearsed search: coffee shop · 91768 · 2 miles (`/#demo`)

From `frontend/public/data/zip/91768.json`, `categories.cafe["2"]` (radius measured from the ZIP's median place location, 34.06047, -117.79182):

| Metric | Value | Field |
|---|---|---|
| Walk-in businesses within 2 mi (cafe + restaurant + retail + services) | 456 | sum of `categories.*["2"].competitors` |
| Cafes (competitors) within 2 mi | 20 | `competitors` |
| Independent | 13 of 20 (65.0%) | `independent` |
| Cafe density here vs the surrounding 10 km | 0.61 vs 1.40 per km² (ratio 0.44, "56% fewer") | `per_km2`, `city_per_km2`, `density_ratio` |
| Recorded closures nearby | 1 closed of 20 tracked (5.0%) | `open`, `closed`, `closure_rate` |
| Nearest cafes to the center | Panaderia Jalisco, Spike's Cake Shop, Beijing Yogurt | `nearest` |
| Residents within 2 mi (ACS 2019) | 53,561 · median income $62,750 · median age 32 | `demographics` |

Backend `/api/analyze` for the same center and 2 mi (3,219 m):

| Metric | Value |
|---|---|
| `competitor_count` | 20 (matches the tile) |
| `total_businesses` | 715. Counts every mapped category, including schools and offices, so it's higher than the 456 walk-in businesses on the tile |
| `nearest_competitor_distance_m` | 445 m |
| `complementary_count` | 1 |
| Opportunity signal / potential category gap (backend heuristic) | 45.62 / 89.06 |
| `data_source` / `recommendation_source` | `local` / `deterministic_fallback` (rule-based; Cortex not enabled) |

The Competitors tab lists 18 cafes because it shows places inside ZIP 91768 only. The tiles count the whole 2-mile radius.

## Heatmap

| Metric | Value |
|---|---|
| Hexagons per category (H3 res 8, ring 1, 25+ active businesses) | 4,986 (Python, `data/heatmap.py`; the Snowflake SQL version has not been run) |
| Best spots shown for the demo search | 3 highest-scoring hexagons within 2 mi |

## Timings (local, one laptop)

| Request | Time |
|---|---|
| `/api/analyze`, first call (loads the 342k-row export) | 0.24 s |
| `/api/analyze`, warm (2 calls) | 0.066 s each |
| `zip/91768.json` (56 KB) | 2 ms |
| `heat/cells.json` (631 KB) + `heat/cafe.json` (212 KB) | 11 ms + 3 ms |

## Tests (fresh runs)

| Suite | Result |
|---|---|
| Backend `pytest -q` | 97 passed (Snowflake and Cortex are mocked in tests; this doesn't prove live connectivity) |
| Frontend `eslint src` | clean |
| Frontend `vite build` | succeeds |

## Not measured or not established

Real users, conversions, demand, revenue, recommendation accuracy, success probability, live Cortex inference or latency, the live Cortex Agent, and Snowflake H3 SQL execution. See `docs/snowflake-proof.md` for what still needs evidence.
