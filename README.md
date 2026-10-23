# WayPoint

Find independent local businesses ("hidden gems") near you, plus owner-view numbers on competition and category gaps.

## Data

### Dataset
- **Overture Maps - Places**, via the **CARTO** listing on the Snowflake Marketplace (installed as `OVERTURE_MAPS_PLACES.CARTO.PLACE`).
- Place data © [Overture Maps Foundation](https://overturemaps.org), distributed by [CARTO](https://carto.com). Thanks to both.

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

Owner view: `competitors(category, lat, lon, radius_m)`, `category_mix(lat, lon, radius_m)`, `gap_score(category, lat, lon, radius_m, city_radius_m=5000)`. All return plain counts and ratios.

### How the numbers are made
- **Filtered to** places with Overture confidence > 0.7, then mapped from Overture's `TAXONOMY` to four friendly categories (`data/categories.py`):
  - `food_and_drink` → **cafe** (coffee, tea, bakeries, desserts, juice) or **restaurant** (everything else, bars included)
  - `shopping` → **retail**
  - `services_and_business`, `lifestyle_services` → **services**, minus non-walk-in groups (B2B, offices, contractors, real estate, legal, ATMs)
  - Everything else (health care, schools, parks, government, …) is dropped. In the Pomona extract that leaves 883 of 1,651 places.
- **Chain** = has an Overture brand (`BRAND:names:primary`), **or** the same name appears 3+ times in the area, **or** the name starts with one of those chain names (catches "Starbucks Coffee Company"). `is_independent` is the opposite. Only ~10% of places carry a brand tag, so the name rules do most of the work.
- **hidden_gem_score** = 0.5 × independent + 0.2 × few chains nearby + 0.2 × category rarity + 0.1 × confidence
  - few chains nearby = 1 / (1 + chain locations within 500 m)
  - category rarity = how uncommon the place's Overture category is in the area (1 = rarest, 0 = most common)
- **gap_score** = 1 − (category per km² in the area ÷ category per km² in the wider city radius, 5 km by default), clamped to 0–1. Higher means under-served.

### Limitations
- Scores are **proxies, not measured demand**: no foot traffic, reviews, or sales data.
- Overture coverage and brand tags are incomplete; a chain with one untagged location nearby (e.g. a lone Peet's) looks independent.
- The 0.7 confidence cutoff and score weights are hand-picked.
