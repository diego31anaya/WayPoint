# WayPoint

Find independent local businesses ("hidden gems") near you, plus owner-view numbers on competition and category gaps.

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
With no credentials, everything runs off `data/sample_places.csv`: 1,651 places within 5 km of Cal Poly Pomona, pulled with `data/sql/extract.sql` on 2026-10-23. Live query results are cached in `data/cache/`, so the demo doesn't need Snowflake once an area has been fetched.

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

Owner view: `competitors(category, lat, lon, radius_m)`, `category_mix(lat, lon, radius_m)`, `gap_score(category, lat, lon, radius_m, city_radius_m=5000)`, `survival(category, lat, lon, radius_m)`. All return plain counts and ratios.

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
