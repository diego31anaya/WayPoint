# BlockBoost backend

BlockBoost helps small-business owners turn mapped neighborhood businesses into experiments they can measure. It returns competitor density, complementary-category presence, transparent opportunity signals, and three evidence-cited strategies. It does not predict demand or profitability.

## Run locally

Python 3.11+ (development verified on Python 3.13). From this backend folder in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Defaults work without credentials: `DATA_MODE=mock`, `AI_ENABLED=false`. Mock mode uses explicitly synthetic fixed Pomona records. Try latitude `34.0551`, longitude `-117.7499`, radius `1500`. Other cities may correctly return no demo records. API docs: http://127.0.0.1:8000/docs. Avoid exposing this unauthenticated MVP to the public Internet.

```powershell
$body = @{business_type='coffee_shop'; location=@{latitude=34.0551; longitude=-117.7499}; radius_m=1500; business_goal='Attract more customers'} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8000/api/analyze -Method Post -ContentType application/json -Body $body
.\.venv\Scripts\python.exe -m pytest -q
```

## API contract for C (Streamlit)

`GET /api/health` is a cheap configuration/liveness check. Opt in with `?check_dependencies=true` to check the configured Snowflake view and Ollama's installed model list. An available Ollama model does not prove successful generation. `configured_not_probed` never means a connection succeeded. `GET /api/categories` returns provisional dataset mappings and supported goal suggestions; A must validate category coverage. `POST /api/analyze` accepts the request above plus optional business information described below. Radius is 100–5000 meters. Invalid input returns 422; live data failures return 503 with `detail.code=data_unavailable`. Ollama failures return a successful analysis with labeled fallback recommendations and a warning.

Optional owner fields are `business_name` (nullable), `business_description` (text), `products_and_services`, `target_customers`, `current_challenges`, `existing_marketing_strategies`, and `owner_preferences` (lists of bounded nonempty strings), `monthly_marketing_budget` (nonnegative numeric, nullable), and `business_stage` (`planning`, `newly_opened`, or `established`, nullable). Budget currency is owner-defined; the backend does not convert currency. Omitted budget means unknown; zero means no paid advertising. The default goal remains Attract more customers for backward compatibility; categories exposes six goal suggestions, and custom nonempty goals remain accepted. Category identifiers stay stable, with additive aliases such as Coffee Shop and Café. Coordinates remain required; no address geocoder is integrated.

The response echoes validated input in `business_information`. Additive `neighborhood_insights` includes complementary category counts, relevant points of interest, up to five nearest competitors from returned markers, subset flags and data quality. `metrics.competitor_share` is matching-category count divided by mapped business count; it is not a revenue share. Category completeness describes known categories within returned full aggregates, while real-world geographic completeness remains unknown. All-unknown categories yield no scores or recommendations. Individual score objects include `contributing_metrics` as well as the original evidence IDs.

Response has `business_type`, `location`, `radius_m`, `metrics`, `evidence`, `nearby_businesses`, `opportunity_signals`, `recommendations`, `metadata`. Authoritative OpenAPI schema is `/openapi.json`; Pydantic definitions are in `app/schemas.py`. Markers use `latitude`, `longitude`, `name`, `category`, `distance_m`, `business_id`, and `ownership='unknown'`. All radius metrics use full neighborhood aggregates; map markers are capped at 200. `metadata.map_truncated` signals truncation. Do not recompute counts from markers.

Evidence consists of `metric_id`, numeric `value`, and `unit`. Recommendation cards include `title`, `description`, `reason`, `supporting_evidence`, `action_steps`, `priority`, and `limitations`. Show the structured evidence as the source of numbers. Always display `metadata.simulated`, `recommendation_source`, and warnings. Empty neighborhoods return no scores or recommendations; render an insufficient-evidence state. Map/category counts describe mapped records, not an exhaustive business census.

Streamlit example (server-side HTTP; no browser CORS needed):

```python
import requests
r = requests.post('http://127.0.0.1:8000/api/analyze', json={
    'business_type': 'coffee_shop',
    'location': {'latitude': 34.0551, 'longitude': -117.7499},
    'radius_m': 1500, 'business_goal': 'Attract more customers'
}, timeout=150)
r.raise_for_status()
analysis = r.json()
```

## Snowflake setup and A's integration boundary

Use [Overture's official Snowflake instructions](https://docs.overturemaps.org/getting-data/data-mirrors/snowflake/) to acquire the CARTO Places Marketplace listing. Database names are chosen by the subscriber. Inspect the actual schema with `sql/inspect_schema.sql` and CoCo. Current listings may use `taxonomy`/`basic_category`; older releases differ. Do not copy outdated `categories` expressions.

A creates a canonical SQL view following `sql/neighborhood_analysis.sql` in a writable database. This isolates actual listing fields and geometry conversions from Python. The backend checks the view's column names and string/numeric/GEOGRAPHY types before its first query, caching that metadata validation for five minutes. These checks do not prove coordinate CRS, category coverage, uniqueness or listing provenance; A must verify those. Required view columns:

| Column | Contract |
|---|---|
| BUSINESS_ID | VARCHAR or NULL if unavailable |
| NAME | VARCHAR, nullable rendered as Unnamed business |
| CATEGORY | normalized lowercase VARCHAR, unknown when missing |
| LATITUDE / LONGITUDE | numeric WGS84 degrees |
| GEOG | Snowflake GEOGRAPHY in WGS84 |

Ensure one row per place and primary category. Verify counts and distances independently, sample known locations, inspect null/drop rates, verify category mappings in `app/schemas.py`, and record listing release. A view is required; this adapter does not pretend to discover an unknown schema automatically. Missing business names are preserved as unnamed; unlocated rows cannot support proximity analysis.

Set `DATA_MODE=live`, connector account/user/password, warehouse, optional role, and database/schema/table to the **canonical view**. Set `SNOWFLAKE_MAPPING_VERIFIED=true` only after the checks. Set `DATASET_RELEASE` to the recorded release. Restart the API after environment changes. Live Snowflake errors never switch to synthetic data. Password authentication is supported for the MVP; use an account-approved service identity. Never commit credentials. `SnowflakeService.get_nearby_businesses(request, category='coffee_shop')` optionally filters markers before the map limit using bound category aliases; the primary analysis intentionally retains all neighborhood categories for complementary metrics.

Use a dedicated X-Small warehouse with auto-suspend (e.g. 60 seconds), auto-resume and an account resource monitor. Marketplace data may be free while compute incurs charges. Radius and marker caps, a 30-second SQL timeout, query tags, bound values, strict configured identifiers, and aggregate-in-Snowflake logic limit risk. A map LIMIT does not cap geospatial scan cost: inspect query profile and clustering/pruning with A. Connections and cursors close after each request. No global dataset is downloaded. Query-result caching is left to Snowflake; no stale application data cache is used.

## Ollama and model setup

Install [Ollama](https://ollama.com/download) using its platform installer, then:

```powershell
ollama serve
# In another terminal:
ollama pull qwen3:1.7b
ollama run qwen3:1.7b "Suggest a cautious local business experiment."
```

If the desktop app already serves Ollama, use that service. Set `AI_ENABLED=true`, `OLLAMA_BASE_URL=http://localhost:11434`, `OLLAMA_MODEL=qwen3:1.7b`, `OLLAMA_TIMEOUT_S=45`, `OLLAMA_RETRIES=1`. Restart FastAPI. Transient transport errors and HTTP 429/502/503/504 are retried once by default with a short backoff; malformed output and nontransient errors are not retried. Timeouts apply per HTTP operation per attempt, so overall latency can exceed a single configured timeout. Both mock and live data modes can use the real model; mock data remains labeled simulated. `recommendation_source=open_weight_model` means validated model output, never a fallback. The model selects and writes business experiments based on the complete business profile, existing marketing, goal, preferences, observed metrics, neighborhood data quality and scores. The prompt instructs it to avoid repeating existing campaigns unchanged, respect zero budgets, and treat omitted budgets as unknown. The backend sends a custom system prompt and JSON schema with thinking disabled, validates three distinct titles and every evidence triple, constructs observation reasons itself, and caches successful outputs for an hour (bounded 128 entries per process).

Numbers are allowed only in structured evidence, not model-authored prose; unsupported citation IDs/values/units and obvious numerical or certainty claims are rejected. Free-text semantic grounding is not formally provable: owner review remains necessary. On error the backend returns three labeled deterministic experiments; no evidence means none. AI fallback warnings are visible even in live mode. Successful response cache is in memory and lost on restart; prewarm exact demo requests on the demo process.

## Explainable scores

Area is `pi * (radius_m / 1000)^2`; competitor density is matching-category count divided by area. Nearest competitor is nullable. Complements are explicit category relationships in `app/schemas.py`, not verified partnerships. Let `p=1/(1+density/5)` and `c=complements/(complements+5)`. Opportunity signal is `100*(0.4*p+0.6*c)`; potential category gap is `100*p`. The scales and weights are hand-selected demo heuristics, favoring actionable partnership experiments while preventing unbounded counts from dominating. These are reproducible descriptive signals, not trained or validated predictions. Zero mapped records yields no score. Completeness is unknown, so no invented confidence percentage is returned. Scores do not support cross-city scientific comparisons.

## Architecture and responsibilities

Python/FastAPI/Pydantic v2/Uvicorn serve the contract. Snowflake Connector supplies real geospatial aggregates; HTTPX calls configurable Ollama/Qwen. No ORM, auth, user database, routing optimization, or demographics. Dependency providers in `app/dependencies.py` independently override data and AI for tests. A owns view mappings/category verification; B owns backend and AI; C owns the frontend; D owns repo publication, root license, submission and demo. The inspected frontend is currently a React/Vite starter with no API calls; Streamlit remains a supported server-side integration example. Backend CORS permits local Vite origins by default, configurable with a JSON-array `CORS_ORIGINS` environment value. No frontend files were changed. This folder is self-contained to avoid editing teammates' files. See `docs/architecture.md`, `docs/coco-workflow.md`, `docs/demo-guide.md`, and `docs/backend-audit.md`.

## Attribution, licenses and verification

Original backend code is MIT licensed in `LICENSE`; D should add the agreed root license for the whole public project. [Ollama's selected Qwen3 tag](https://ollama.com/library/qwen3:1.7b) lists Apache License 2.0; [upstream Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B) provides model terms. Recheck the specific model artifact if changing tags. Our MIT license does not relicense model weights or third-party assets.

Dataset: CARTO's Snowflake Marketplace mirror of Overture Maps Places. Review the actual listing terms, release, and [Overture attribution guidance](https://docs.overturemaps.org/attribution/) before publication; do not assume a universal dataset license. Synthetic demo records are original fixtures, not Overture results. Libraries retain their own terms (FastAPI/Pydantic/HTTPX/Pytest MIT; Uvicorn BSD-3-Clause; Snowflake connector Apache-2.0); preserve notices when redistributing. Verify the complete installed dependency set before bundling it.

Automated tests mock Snowflake and Ollama; they establish local behavior, not live connectivity or submission eligibility. Real CoCo exploration, listing schema, live SQL, model generation on the demo laptop, public repository visibility and submission remain explicit team verification steps. No CoCo usage evidence is fabricated.
