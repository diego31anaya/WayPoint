# Snowflake and Cortex Code (CoCo) proof

Fill this in from real sessions only. Leave a field blank rather than guess; judges can ask to see each item.
Never paste account identifiers, passwords, tokens or full query IDs that reveal the account.

## 1. Free Marketplace datasets

| Dataset | Listing (URL or name) | Installed as | Release / snapshot |
|---|---|---|---|
| Overture Maps Places (CARTO) | | `OVERTURE_MAPS_PLACES.CARTO.PLACE` | |
| SafeGraph US Open Census Data & Neighborhood Insights (free) | | | ACS 2019 5-year |

Screenshot: the Marketplace listing and the installed database in Snowsight (redact the account locator).

## 2. CoCo sessions (verbatim, timestamped)

For each session: the prompt you typed, CoCo's answer, the SQL it proposed or fixed, and whether you ran it.

| When (PDT) | Prompt | What CoCo answered or changed | SQL file | Ran? Result |
|---|---|---|---|---|
| | e.g. "Which fields hold the primary category and name in this Overture listing?" | | `data/sql/extract.sql` | |
| | e.g. "Build an LA places table with operating status and ZIP" | | (`WAYPOINT.PUBLIC.LA_PLACES`) | |
| | e.g. "Compare closure rates for chains vs independents" | | | 9.0% vs 2.1% (README) |

## 3. Queries to run now (each has a known expected result)

| File | Expected | Actual | When |
|---|---|---|---|
| `backend/sql/waypoint_places_view.sql` (view + check query) | 59 cafes within 3 mi of 91768 | | |
| `data/sql/heatmap.sql` (H3 in Snowflake) | 4,986 hexagons per category; cafe median score 62 | | |
| Independent vs chain closure query (from the CoCo session) | 9.0% vs 2.1% over 354,589 places | | |

Screenshot each result with its query profile (redact IDs).

## 4. AI component

| Item | Value |
|---|---|
| Provider | Snowflake Cortex `AI_COMPLETE` (backend `CortexAIService`) |
| Model configured | `llama3.3-70b` (Meta Llama 3.3, Llama 3.3 Community License) |
| Verified run? | Not yet. Record a real `/api/analyze` or `/api/chat` response with `recommendation_source` / `source` = `open_weight_model` here. |
| Request + response (redacted) | |

Until that row is filled, describe AI features as "rule-based" and the AI path as "configured, not yet verified".
