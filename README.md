# WayPoint

Find independent local businesses ("hidden gems") near you, plus owner-view numbers on competition and category gaps.

## Run the site

Two terminals, from the repo root:

```bash
# 1. Backend API (Python 3.11+). Uses the real LA places in data/la_places.csv.gz; no credentials needed.
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --port 8000

# 2. Frontend (Node 20+). Vite forwards /api to the backend.
cd frontend && npm install && npm run dev      # http://localhost:5173
```

| Page | What it does | Needs the backend? |
|---|---|---|
| Home | Search by business type, ZIP and radius. The example brief for 91768 uses real data | No |
| Neighborhood | Business finder: list, numbered pins, details, directions, saved list. Census ZIP outline and insight cards. LA ZIPs use Overture data and other ZIPs use live OpenStreetMap | No |
| Neighborhood → Recommended | Strategies to test from `/api/analyze`, plus idea cards from the static data | Strategies only |
| Chat (signed in) | Answers grounded in your last search, via `/api/chat` | Yes |

**AI answers.** With the defaults, strategies are rule-based, and the chat replies with the neighborhood facts and says the model isn't running. For AI-written strategies and free-form chat, the backend uses Snowflake Cortex (`AI_COMPLETE`): put your Snowflake credentials in `backend/.env`, set `AI_ENABLED=true`, and restart the backend. See `backend/README.md` for the API, scoring, Cortex setup and Snowflake live mode.

Tests: `cd backend && .venv/bin/python -m pytest -q`, and `cd frontend && npm run lint && npm run build`.

**Demo shortcuts:** `http://localhost:5173/#demo` opens the rehearsed search (coffee shop, 91768, 2 miles). `#about-the-data` opens the data story.

## License and credits

WayPoint's code is released under the [MIT License](LICENSE) (`backend/` also ships its own MIT license).
Place data © [Overture Maps Foundation](https://overturemaps.org), distributed by [CARTO](https://carto.com) on the Snowflake Marketplace; see Overture's [attribution guidance](https://docs.overturemaps.org/attribution/).
Census data: SafeGraph US Open Census Data (ACS 2019 5-year). Small-business figures: SBA Office of Advocacy and BLS, cited on the About the data page (`data/external_facts.json`).
AI: the backend calls Snowflake Cortex `AI_COMPLETE` with `llama3.3-70b` (Meta Llama 3.3 Community License) when `AI_ENABLED=true`. Live inference has not been verified yet; see `docs/snowflake-proof.md`.

## Data

### Dataset
- **Overture Maps - Places**, via the **CARTO** listing on the Snowflake Marketplace (installed as `OVERTURE_MAPS_PLACES.CARTO.PLACE`).
- **SafeGraph US Open Census Data & Neighborhood Insights (free)**, Snowflake Marketplace: ACS 2019 5-year estimates per census block group. `data/demographics.csv` holds the 48 block groups within 5 km of CPP: population (B01003e1), median age (B01002e1), median household income (B19013e1), and the count of businesses in each block group (block group shapes from `2019_CBG_GEOMETRY`).
- `data/ca_chains.csv`: 10,608 business names that appear at 5+ California locations in Overture, built in Snowflake with CoCo (`WAYPOINT.PUBLIC.CA_CHAINS`).
- Place data © [Overture Maps Foundation](https://overturemaps.org), distributed by [CARTO](https://carto.com). Census data via [SafeGraph](https://www.safegraph.com). Thanks to all three.

### Setup
```bash
pip install -r requirements.txt
cp .env.example .env   # fill in Snowflake credentials; .env is gitignored
```
With no credentials, everything runs off `data/la_places.csv.gz`: 342,543 LA-area places (open with confidence > 0.7, plus all permanently closed ones) with their ZIP, built in Snowflake with CoCo (`WAYPOINT.PUBLIC.LA_PLACES`) on 2026-10-23. `data/la_cbg.csv` holds the area's 7,883 census block groups. The older CPP-only `data/sample_places.csv` is the fallback. Live query results are cached in `data/cache/`, so the demo doesn't need Snowflake once an area has been fetched.

### Python API
```python
from data.db import get_places
from data.owner import competitors, category_mix, gap_score

get_places(34.0575, -117.8216, 2000, category="cafe")
```
`get_places(lat, lon, radius_m, category=None)` returns a DataFrame sorted by `hidden_gem_score`:

| Column | Type | Meaning |
|---|---|---|
| name | string | Business name |
| category | string | cafe, restaurant, retail, services |
| lat, lon | float | Location |
| is_independent | bool | True if not a chain |
| hidden_gem_score | float 0–1 | Proxy score, not measured demand |

Owner view: `competitors(category, lat, lon, radius_m)`, `category_mix(lat, lon, radius_m)`, `gap_score(category, lat, lon, radius_m, city_radius_m=10000)`, `survival(category, lat, lon, radius_m)`. All return plain counts and ratios.

### Frontend data
`python3 -m data.export` (about 4 minutes) writes static JSON the React app can `fetch()`, with no server needed:
- `frontend/public/data/index.json`: the 342 covered ZIPs (each with a center and place count), sources, score weights, LA County findings, and California survival rates by category
- `frontend/public/data/zip/<zip>.json`, one per ZIP:
  - `center`: median location of the ZIP's places; all radius numbers are measured from here
  - `places`: the businesses in that ZIP (contract columns), ready for map pins
  - `categories.<cafe|restaurant|retail|services>.<1|2|3>` (miles): competitors, independents, 5 nearest names, density vs. the 10 km area, `gap_score`, open/closed counts, `closure_rate`
  - `category_mix_1mi`, and `demographics` for block groups within 2 miles (population, population-weighted median income and age)

```js
const zip = await fetch(`/data/zip/${zipCode}.json`).then(r => r.ok ? r.json() : null)  // null = ZIP not covered
```
Coverage: ZIPs with 50+ businesses in the box lon −118.95 to −117.65, lat 33.70 to 34.82 (LA County plus parts of Orange, Ventura and San Bernardino). ZIPs at the box's edge have partial radius counts.

### Opportunity heatmap
`python3 -m data.heatmap` (a few seconds) scores every H3 hexagon (resolution 8, ~0.74 km²) in the covered area for each category and writes `frontend/public/data/heat/` (`cells.json` outlines plus one score file per category). `data/sql/heatmap.sql` is the same computation in Snowflake with `H3_LATLNG_TO_CELL_STRING` and `H3_GRID_DISK`; it hasn't been run yet, and it ends with checks that compare against the Python output.

Each hexagon is scored over itself and its 6 neighbors (~1.3 km across), and only if that neighborhood has 25+ active businesses:
- **room** = 1 − (competitors ÷ expected) / 2, clamped to 0–1. *Expected* is what a typical LA area this busy has (the category's LA-wide share × businesses nearby).
- **survival** = 1 − (closure rate ÷ LA closure rate) / 2, clamped. The closure rate is shrunk toward LA's rate (10 pseudo-places), so a single closure doesn't paint a hexagon red.
- **activity** = log(1 + businesses) ÷ log(1 + 90th percentile), clamped. This keeps empty land from looking like opportunity.
- **score** = 100 × (0.45 room + 0.35 survival + 0.20 activity). Red means crowded with more closures; green and blue mean more room. Like the other scores, it's a proxy, not measured demand.

### How the numbers are made
- **Filtered to** places with Overture confidence > 0.7, then mapped from Overture's `TAXONOMY` to four friendly categories (`data/categories.py`):
  - `food_and_drink` → **cafe** (coffee, tea, bakeries, desserts, juice) or **restaurant** (everything else, bars included)
  - `shopping` → **retail**
  - `services_and_business`, `lifestyle_services` → **services**, minus non-walk-in groups (B2B, offices, contractors, real estate, legal, ATMs)
  - Everything else (health care, schools, parks, government, …) is dropped. In the Pomona extract that leaves 883 of 1,651 places.
- **Chain** = has an Overture brand (`BRAND:names:primary`), **or** the same name appears 3+ times in the area, **or** the name starts with one of those chain names (catches "Starbucks Coffee Company"), **or** the name is in `ca_chains.csv` with a brand tag somewhere or 10+ California locations (catches a lone Peet's). `is_independent` is the opposite. Only ~10% of places carry a brand tag, so the name rules do most of the work.
- **hidden_gem_score** = 0.5 × independent + 0.2 × few chains nearby + 0.2 × category rarity + 0.1 × confidence
  - few chains nearby = 1 / (1 + chain locations within 500 m)
  - category rarity = how uncommon the place's Overture category is in the area (1 = rarest, 0 = most common)
- **gap_score** = 1 − (category per km² in the area ÷ category per km² in the wider city radius, 5 km by default), clamped to 0–1. Higher means under-served.

### Success = survival
We have no revenue, foot-traffic or review data (none is free), so "doing well" means **still open**. Overture marks places `open` or `permanently_closed`; closure rate = closed ÷ (open + closed).
- `data/category_survival.csv`: closure rate for 828 Overture categories across California (`WAYPOINT.PUBLIC.CA_CATEGORY_SURVIVAL`).
- `data/pomona_status.csv`: 2,028 places within 5 km of CPP with their status (1,443 open, 105 closed, 480 unknown) and the date a source first listed them.
- `survival()` returns local and statewide closure rates for a category, plus its most and least durable sub-categories.

What CoCo found across LA County (354,589 places with a status; these are comparisons, not causes):
| Finding | Numbers |
|---|---|
| Independents close ~4× as often as chains | 9.0% vs 2.1%; true in every top category (shopping: 7.5% vs 0.9%) |
| More same-category competitors within 500 m, more closures | 6.7% (none) → 8.5% (3–5) → 10.1% (6–15) → 13.6% (16+), partly due to category mix |
| Neighborhood income barely matters | 7.7% / 7.7% / 8.8% by block group income tercile |

### Limitations
- Scores are **proxies, not measured demand**: no foot traffic, reviews, or sales data.
- Overture coverage and brand tags are incomplete; a small regional chain with under 10 untagged California locations still looks independent.
- Closure tags depend on which sources report closures, so rates run low, and categories with 0 closures are excluded from the durable lists.
- Census figures are 2019 ACS estimates; some block groups (e.g. the CPP campus) have no median income.
- The 0.7 confidence cutoff and score weights are hand-picked.
