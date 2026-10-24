# BlockBoost backend

BlockBoost turns mapped neighborhood businesses into evidence-grounded experiments for small-business owners. Snowflake supplies spatial analytics; a deterministic heuristic scores opportunity signals; Snowflake Cortex AI explains them and recommends strategies. A saved Cortex Agent with Cortex Analyst supports location comparisons over curated analytical data.

**Status:** the existing frontend has been verified against the live `WAYPOINT.PUBLIC.BUSINESS_ADVISOR` through FastAPI using the same Cortex Agent SDK connection as `test_agent.py`. A live answer and contextual follow-up used the same Snowflake conversation ID. General chat works independently of dashboard DATA_MODE. Radius analytics/H3 still require a verified canonical places view; the available SAMPLE_PLACES table has ID/LAT/LON fields and is not that canonical view. Direct AI_COMPLETE inference remains separately unverified.

## Start and test

Python 3.11+; development tested on Windows/Python 3.13. From `backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# If no .env exists, copy the template. Never overwrite existing credentials.
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Defaults: `DATA_MODE=mock`, `AI_ENABLED=false`, `AI_PROVIDER=snowflake_cortex`. These return explicitly simulated Pomona records and labeled deterministic fallback recommendations. No local model server/download or proprietary external AI API is used. Live data errors never substitute mock records. `.env` and its variants are ignored; `.env.example` contains placeholders only.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pip check
```

Open http://127.0.0.1:8000/docs for executable API documentation and `/openapi.json` for the authoritative schema. The existing React frontend now uses these endpoints through the Vite /api proxy; see ../frontend/README.md. Backend CORS defaults to local Vite origins; server-side Streamlit HTTP calls also work. This trusted-local-demo MVP has no authentication or tenant isolation. Use account row-access controls and deployment authentication before serving multiple owners or exposing it publicly.

## Existing analysis contract

```json
{
  "business_type": "coffee_shop",
  "location": {"latitude": 34.0551, "longitude": -117.7499},
  "radius_m": 1500,
  "business_goal": "Attract more customers",
  "include_location_summary": true,
  "include_score_explanation": false
}
```

`business_type` supports coffee_shop, restaurant, bakery and bookstore; aliases such as Coffee Shop/Café normalize to stable IDs. Category coverage must be verified against the actual listing. Radius is 100–5000 meters. Optional fields: business_name, business_description, products_and_services, target_customers, monthly_marketing_budget, current_challenges, existing_marketing_strategies, business_stage and owner_preferences. List fields contain bounded nonempty strings. Stage is planning/newly_opened/established. Null budget is unknown, zero excludes paid advertising; no currency conversion is inferred. Custom goals remain accepted alongside the six suggested goals from categories. Coordinates are required; no geocoder is integrated.

Existing response keys and types remain: business_type, location, radius_m, metrics, evidence, nearby_businesses, opportunity_signals, recommendations, metadata, business_information and neighborhood_insights. Location explanations are additive and opt-in to avoid doubling default inference cost: `include_location_summary` and `include_score_explanation` return `location_summary` and `score_explanation`. Both are null by default. These flags can result in up to three AI calls per analysis; allow sufficient client timeout.

Metrics use the full radius query; map markers are bounded at 200 by default. Do not recompute metrics from markers. Marker fields are name, category, latitude, longitude, distance_m, business_id and ownership (unknown). POI/nearest-competitor lists use bounded markers and report truncation; scalar nearest-competitor distance uses the full aggregate. Category completeness measures classified records, never real-world coverage. All-unknown or empty neighborhoods yield no opportunity score or recommendations.

Recommendation cards retain title, description, reason, supporting_evidence, action_steps, priority and limitations. Each citation has metric_id, value and unit. Always display `metadata.simulated`, `recommendation_source`, warnings and evidence. `recommendation_source=open_weight_model` is reserved for successful validated inference with a model listed in `CORTEX_OPEN_WEIGHT_MODELS`; another explicitly configured model is labeled `cortex_ai`. Fallback is always `deterministic_fallback`, with ai_model null. Adding an allowlist entry is an operator assertion that the actual model license was verified, not an automatic license check.

| Endpoint | Behavior |
|---|---|
| GET /api/health | Cheap liveness/configuration; opt-in `check_dependencies=true` checks places availability and Cortex model visibility, not inference success. Legacy ollama key is retained as `removed`. |
| GET /api/categories | Stable category IDs, provisional dataset mappings, complements and goal suggestions. |
| POST /api/analyze | Full analytics/scoring/recommendation pipeline. Invalid input 422, live data failure 503, model failure labeled fallback. |
| POST /api/agent/chat | Saved Cortex Agent SDK: general chat or verified selected-location context, durable Snowflake conversation IDs, query references when available; unavailable connection 503, missing context 404, expired context/conversation 409, rate limit 429. |
| POST /api/opportunity-map | Bounded same-resolution H3 disk as GeoJSON FeatureCollection. Live query failure 503. Mock mode intentionally returns no H3 fixtures, explicitly labeled. |

## Snowflake places setup (A)

Acquire the CARTO Overture Places listing via [Overture's official Snowflake instructions](https://docs.overturemaps.org/getting-data/data-mirrors/snowflake/). Database names belong to your subscription. Use `sql/inspect_schema.sql` and genuine CoCo exploration to verify the actual release, fields, taxonomy/basic_category or legacy category structure, geometry type, CRS, duplicates and null rates.

Create an owned canonical **view** following `sql/neighborhood_analysis.sql`. Required fields: BUSINESS_ID VARCHAR (nullable), NAME VARCHAR, CATEGORY normalized lowercase VARCHAR, LATITUDE/LONGITUDE numeric WGS84 degrees, GEOG GEOGRAPHY. Keep one row/primary category per place. Convert real geometry CRS correctly; do not relabel projected coordinates as geography. Keep unavailable ownership unknown. The backend validates required columns/types via DESCRIBE VIEW, caching metadata checks for five minutes; only the data lead can verify semantic correctness and coverage.

Set connector account/user/password, warehouse, optional role and the canonical view's database/schema/table. Set `SNOWFLAKE_MAPPING_VERIFIED=true` and actual `DATASET_RELEASE` only after validation. Set `DATA_MODE=live`. Existing connector management, strict identifiers, bound values, ST_DWITHIN/ST_DISTANCE and cursor/connection cleanup are preserved. Use an X-Small warehouse with auto-suspend/auto-resume and an account resource monitor. Marketplace data can be free while compute and AI calls cost credits. Inspect query profiles; a marker LIMIT does not cap scan cost.

## Cortex AI setup (B/account administrator)

Set `AI_ENABLED=true`, `AI_PROVIDER=snowflake_cortex`, `SNOWFLAKE_CORTEX_MODEL=llama3.3-70b`, `CORTEX_TIMEOUT_S=60`, `CORTEX_TEMPERATURE=0`, `CORTEX_RETRIES=1`. Restart after configuration changes. No automatic provider/model substitution occurs.

First run:

```sql
SHOW CORTEX BASE MODELS IN SCHEMA SNOWFLAKE.MODELS;
SELECT CURRENT_REGION();
SHOW PARAMETERS LIKE 'CORTEX_ENABLED_CROSS_REGION' IN ACCOUNT;
```

The provider checks model visibility for the active role, lifecycle and in-region deployment before generation. EOL is rejected; LEGACY is rejected unless explicitly enabled. Cross-region-only models require both explicit `CORTEX_ALLOW_CROSS_REGION=true` and an appropriate account policy; the backend never changes account settings. Presence in SHOW is not proof that a function can execute: permission/quota/region failures still return labeled fallback. Model metadata checks are cached for five minutes. Select an available open-weight replacement explicitly if the preferred model is unavailable, record its license, and update `CORTEX_OPEN_WEIGHT_MODELS` accordingly.

`app/services/cortex_ai_service.py` calls connector-bound `AI_COMPLETE` with `model_parameters` and structured `response_format` JSON Schema. It reuses Pydantic schemas, original prompts/policies, citation equality checks, numerical-prose checks, deterministic fallback and a bounded one-hour per-process success cache. It never calculates counts or scores. The SQL generation format follows [AI_COMPLETE structured output documentation](https://docs.snowflake.com/en/sql-reference/functions/ai_complete-structured-outputs); model discovery follows [SHOW CORTEX BASE MODELS](https://docs.snowflake.com/en/sql-reference/sql/show-cortex-base-models).

Only explicitly transient connection/rate-limit failures are retried, with a bounded backoff; ordinary SQL errors, invalid JSON, unsupported citations and cancelled inference do not trigger repeated calls. Statement and network timeouts apply per request/attempt, not as a strict total wall-clock bound. Raw connector errors, prompts, tokens and credentials are not returned. Free-text semantics cannot be formally verified; owners must review the experiments.

Summary functions describe competition, category gaps, complements and score factors using the same registry. Residential population and survival probability are null, with explicit explanations that no verified demographics or validated historical survival model is available. Fallback summaries are marked separately from actual Cortex output.

Independent live inference check (uses explicitly synthetic sample metrics; not a live places-data check):

```powershell
.\.venv\Scripts\python.exe -m scripts.check_cortex --component ai
```

Exit 0 means validated live inference, 1 failed/fallback, 2 missing setup. In the current environment it reports BLOCKED, not verified.

## Saved Agent connection

`app/services/cortex_agent_service.py` reuses `CortexAgentClient(account=..., auth=...)` from the working `test_agent.py`, with the pinned `snowflake-cortex-agent-sdk==0.0.3` dependency. Server Settings load the existing `.env`; `SNOWFLAKE_PAT` is supported directly, with the prior `SNOWFLAKE_AGENT_TOKEN` as a fallback. Tokens never enter VITE configuration or API responses.

The verified resources are `WAYPOINT.PUBLIC.BUSINESS_ADVISOR` and the `WAYPOINT.PUBLIC.BUSINESS_ANALYTICS` semantic view. Set `SNOWFLAKE_AGENT_DATABASE`, `SNOWFLAKE_AGENT_SCHEMA`, and `SNOWFLAKE_AGENT_NAME` to the agent's actual location. The backend verifies that a saved Analyst tool references the configured semantic view; additional configured tools, such as code_execution, are allowed. It does not rewrite the saved agent or use an inline agent.

General questions require only a message:

```json
{"message": "Which business categories have the highest reported closure rates?"}
```

The response returns the actual Snowflake conversation ID as a string. Follow-ups send that same `conversation_id`. The SDK uses `conversations.attach(id, agent=saved_agent)` and `conversation.send(message, agent=saved_agent)` explicitly, so an attachment cannot silently switch to an inline agent. Snowflake stores history; server restarts no longer discard conversation mappings. The backend only keeps in-flight locks and a bounded cache of verified location snapshots. `New chat` omits the ID and creates a new conversation; old chats remain available in the existing sidebar.

General advice and clarification questions do not require an Analyst query. Statistical questions are instructed to use the saved semantic view. Query IDs from actual tool/table results are returned and displayed; no placeholder reply is substituted on failure. Source-reported closure rates are distinguished from predicted survival; demographics are used only if the tools can establish relevant data and geography. Prose remains model generated and is not a mathematical proof of every claim.

### Selected location context

Live `/api/analyze` registers its exact already-computed request, metrics and marker subset in a bounded one-hour server cache, returning additive `agent_context` IDs. It requires `DATA_MODE=live`, verified places mapping, and a recorded dataset release. No analytical snapshot is recomputed or published by the API; INSERT/UPDATE grants and the old context table are no longer prerequisites for chat. Failed registration leaves analysis available with a warning. Mock analysis never registers or sends synthetic values as facts.

Chat can attach these business/location IDs, or submit `business_information` in the existing AnalysisRequest shape to calculate a fresh verified live analysis. Client-supplied metrics are rejected. Pre-published warehouse contexts remain supported for compatibility through a bound lookup and StoredLocationContext validation; the standalone publisher is optional.

When a heatmap zone is selected, the frontend also sends its H3 ID and original map request. The backend queries the live map again, verifies membership, category, source and the selected analysis center, then attaches the full-cell counts/density/score separately from the radius metrics. Missing demographics stay null. Selecting a different location preserves the Snowflake conversation while replacing current-location context on the next turn. Expired analysis snapshots require reanalysis rather than accepting stale client metrics.

The currently available account tables include SAMPLE_PLACES, CATEGORY_SURVIVAL, DEMOGRAPHICS and LA_CBG. Their presence is not proof of a verified radius or H3 mapping; no schema creation, grants or dataset assumptions were performed by this integration. General agent questions can use the configured semantic view immediately.

### Verification

```powershell
python -m pytest -q
# Explicitly calls the real agent twice and checks the same Snowflake conversation.
python -m scripts.check_cortex --component agent
```

To test through the existing browser UI, start the backend on port 8000 and Vite on 5173, then from `frontend`:

```powershell
$env:LIVE_AGENT_TESTS='1'
$env:LIVE_BASE_URL='http://127.0.0.1:5173'
npx playwright test tests/live-agent.spec.js
```

The ordinary browser suite skips live calls unless explicitly enabled. See `docs/verification.md` for actual results and remaining analytics setup. The existing local email session is a demo, not a tenant authentication boundary.

## H3 opportunity map

POST `/api/opportunity-map` with business_type, location, resolution (7/8/9) and grid_disk_k (0–4). A bounded grid contains at most 61 full cells. `sql/opportunity_map.sql` seeds cells using Snowflake H3_GRID_DISK, left-joins category aggregates, uses actual ST_AREA in square kilometers for density, and calculates the original deterministic score in SQL. Empty cells remain in the response with null score, not a fabricated demand opportunity. The grid is not a clipped circle; comparisons use full cells at the same resolution. A conservative geographic pruning envelope bounds the places query. No AI call is made per cell; request a location summary only for selected locations through analyze.

GeoJSON properties contain H3 IDs, area, counts, density, distribution, heuristic score and limited/insufficient data confidence. Geographic coverage remains unknown and population null. Mock mode has no H3 fixtures and returns an explicitly labeled empty FeatureCollection, not a claim that the real neighborhood is empty. H3 SQL remains unverified against a live account.

## Scoring and limitations

Existing circular analysis uses area `pi*(radius_m/1000)^2`. Let `p=1/(1+density/5)` and `c=complements/(complements+5)`. Opportunity is `100*(0.4*p+0.6*c)`; potential category gap is `100*p`. Hand-selected saturation scales and weights support a demo hypothesis, not a trained or statistically validated forecast. Python remains the authoritative existing analysis implementation; SQL H3 and semantic-view formulas mirror it for zone analytics. Missing/unknown categories, stale releases, radius differences and overlapping neighborhoods limit comparisons. Actual buying behavior, traffic, brand ownership, revenue and business survival are unavailable.

## Attribution and submission

Original backend code remains MIT licensed. [Meta's Llama 3.3 model card](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct) identifies the custom Llama 3.3 Community License; it is open-weight, not MIT/Apache or an OSI license claim. Snowflake model-service terms, model lifecycle and regional permissions also apply. Recheck the actual selected model and terms before submission. Agent orchestration can use a proprietary model; open-weight recommendation/explanation inference must actually run to demonstrate that requirement.

Review actual CARTO listing terms and [Overture attribution](https://docs.overturemaps.org/attribution/) before publication. Our MIT license does not override model, dataset or dependency terms. Snowflake connector is Apache-2.0; FastAPI/Pydantic/HTTPX/Pytest retain their licenses and Uvicorn BSD-3-Clause. Legacy local-model checks in historical verification records do not verify the new architecture.

Use `docs/coco-workflow.md` to capture genuine CoCo work; none is invented here. D must verify the public repository, root project license, team submission and event-specific rules. See `docs/cortex-migration.md` for audit/reuse details and `docs/verification.md` for exact current checks.
