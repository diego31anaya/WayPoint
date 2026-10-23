# BlockBoost backend

BlockBoost turns mapped neighborhood businesses into evidence-grounded experiments for small-business owners. Snowflake supplies spatial analytics; a deterministic heuristic scores opportunity signals; Snowflake Cortex AI explains them and recommends strategies. A saved Cortex Agent with Cortex Analyst supports location comparisons over curated analytical data.

**Status:** mock analysis works without credentials. Automated Snowflake/Cortex/Agent/H3 tests are mocked. Live `AI_COMPLETE`, live saved Agent calls, H3 SQL execution, installed dataset schema and genuine CoCo evidence remain unverified until the team supplies account access and artifacts. The configured model is `llama3.3-70b`; no Snowflake model has actually run in this environment.

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

Open http://127.0.0.1:8000/docs for executable API documentation and `/openapi.json` for the authoritative schema. The existing frontend was not changed. Backend CORS defaults to local Vite origins; server-side Streamlit HTTP calls also work. This trusted-local-demo MVP has no authentication or tenant isolation. Use account row-access controls and deployment authentication before serving multiple owners or exposing it publicly.

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
| POST /api/agent/chat | Saved Cortex Agent with verified warehouse context and real Analyst query references; unavailable setup 503, missing context 404, expired/mismatched conversation 409, rate limit 429. |
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

## Saved Agent and semantic view setup (A/B/admin)

1. Review `sql/cortex_setup.sql`: create the owned context table, analytical projection and semantic view. These statements are templates that require live account validation. The API never runs DDL or grants.
2. Publish actual live analytics using the separate publisher role (INSERT/UPDATE required only for this explicit script):

```powershell
.\.venv\Scripts\python.exe -m scripts.publish_agent_context --business-id demo-owner --location-id pomona-a --latitude 34.0551 --longitude -117.7499 --business-type coffee_shop --radius-m 1500
```

The script refuses mock mode and an unrecorded release, queries real places through the existing service, validates a StoredLocationContext, then uses a bound MERGE. Do not publish synthetic fixture metrics as real data. Use a single writer: standard-table primary keys are informational. Runtime rejects missing or duplicate contexts. Business IDs identify supplied owner context, not independently verified ownership.

3. Install a saved `BLOCKBOOST.PUBLIC.BUSINESS_ADVISOR` using Snowsight or the documented CREATE AGENT/REST interface with `sql/business_advisor_spec.json`. Replace its warehouse placeholder. Its Analyst tool must be named neighborhood_analyst and reference the configured semantic view. Orchestration `auto` is Snowflake-selected and may be proprietary; it does not itself establish open-weight track eligibility.
4. Give runtime read/usage access to context, analytical/semantic views, warehouse, Cortex/Analyst and saved agent. Verify current model RBAC and network/token policy with the account administrator. Do not use ACCOUNTADMIN as the API role. Spec verification requires the saved specification to be readable; secure/redacted specs fail closed.
5. Set SNOWFLAKE_AGENT_DATABASE/SCHEMA/NAME, SNOWFLAKE_AGENT_TOOL_NAME, SNOWFLAKE_SEMANTIC_VIEW, SNOWFLAKE_CONTEXT_VIEW, HTTPS SNOWFLAKE_ACCOUNT_BASE_URL, SNOWFLAKE_AGENT_TOKEN and its token type server-side. Set SNOWFLAKE_AGENT_SETUP_VERIFIED=true only after setup. No tokens are returned to clients.

```json
{
  "message": "Why is this location recommended?",
  "business_id": "demo-owner",
  "location_id": "pomona-a",
  "comparison_location_ids": [],
  "conversation_id": null
}
```

The server looks up actual analytical context, verifies the saved tool/semantic view configuration, creates a Snowflake thread and invokes the saved agent with Analyst required. It accepts only responses with a successful Analyst result/query reference. It returns supporting_metrics (provided-context evidence, not a claim that every metric was cited), analyst_query_ids, relevant_location_ids and source metadata. Tool warnings or unsupported numerical claims cause a controlled error, not an ungrounded answer.

Send the opaque returned conversation_id and the same business/location set for follow-ups. Snowflake receives the persisted thread ID and last assistant message ID. Server state is bounded, locked and expires after 30 minutes; restart/worker change loses local tokens, requiring a new conversation. This demo should use one API worker. Runs are not automatically retried because a timeout can still persist a turn. Do not automatically retry a failed chat turn. For durable/multi-user hosting, add authorized session persistence and row-access policies; prompt filters do not enforce tenant security.

Agent live check is separate:

```powershell
.\.venv\Scripts\python.exe -m scripts.check_cortex --component agent --business-id demo-owner --location-id pomona-a
```

Implementation uses the documented [saved Agent Run REST API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run) with stream=false and [Snowflake threads](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-threads-rest-api), via existing HTTPX. No extra SDK dependency or invented Agent object is used.

## H3 opportunity map

POST `/api/opportunity-map` with business_type, location, resolution (7/8/9) and grid_disk_k (0–4). A bounded grid contains at most 61 full cells. `sql/opportunity_map.sql` seeds cells using Snowflake H3_GRID_DISK, left-joins category aggregates, uses actual ST_AREA in square kilometers for density, and calculates the original deterministic score in SQL. Empty cells remain in the response with null score, not a fabricated demand opportunity. The grid is not a clipped circle; comparisons use full cells at the same resolution. A conservative geographic pruning envelope bounds the places query. No AI call is made per cell; request a location summary only for selected locations through analyze.

GeoJSON properties contain H3 IDs, area, counts, density, distribution, heuristic score and limited/insufficient data confidence. Geographic coverage remains unknown and population null. Mock mode has no H3 fixtures and returns an explicitly labeled empty FeatureCollection, not a claim that the real neighborhood is empty. H3 SQL remains unverified against a live account.

## Scoring and limitations

Existing circular analysis uses area `pi*(radius_m/1000)^2`. Let `p=1/(1+density/5)` and `c=complements/(complements+5)`. Opportunity is `100*(0.4*p+0.6*c)`; potential category gap is `100*p`. Hand-selected saturation scales and weights support a demo hypothesis, not a trained or statistically validated forecast. Python remains the authoritative existing analysis implementation; SQL H3 and semantic-view formulas mirror it for zone analytics. Missing/unknown categories, stale releases, radius differences and overlapping neighborhoods limit comparisons. Actual buying behavior, traffic, brand ownership, revenue and business survival are unavailable.

## Attribution and submission

Original backend code remains MIT licensed. [Meta's Llama 3.3 model card](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct) identifies the custom Llama 3.3 Community License; it is open-weight, not MIT/Apache or an OSI license claim. Snowflake model-service terms, model lifecycle and regional permissions also apply. Recheck the actual selected model and terms before submission. Agent orchestration can use a proprietary model; open-weight recommendation/explanation inference must actually run to demonstrate that requirement.

Review actual CARTO listing terms and [Overture attribution](https://docs.overturemaps.org/attribution/) before publication. Our MIT license does not override model, dataset or dependency terms. Snowflake connector is Apache-2.0; FastAPI/Pydantic/HTTPX/Pytest retain their licenses and Uvicorn BSD-3-Clause. Legacy local-model checks in historical verification records do not verify the new architecture.

Use `docs/coco-workflow.md` to capture genuine CoCo work; none is invented here. D must verify the public repository, root project license, team submission and event-specific rules. See `docs/cortex-migration.md` for audit/reuse details and `docs/verification.md` for exact current checks.
