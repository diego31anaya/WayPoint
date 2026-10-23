# Backend audit and integration handoff

## Baseline inspected before edits

Existing structure: FastAPI routers in `app/routers`, Pydantic v2 contract in `app/schemas.py`, settings in `app/config.py`, independent data/AI providers in `app/dependencies.py`, analytics/scoring/Snowflake/Ollama services, fixed synthetic demo fixtures, SQL templates, tests, and submission documentation. Baseline was clean and all 30 tests passed.

Endpoints preserved: `GET /api/health`, `GET /api/categories`, `POST /api/analyze`. Request fields, response fields, numerical scoring formula, live/mock distinction, full-radius aggregate versus map-marker behavior, and controlled Snowflake failure semantics remain compatible. Custom business goals and the legacy default goal remain accepted.

The inspected frontend contains a React/Vite starter and no API request code. No Streamlit files or established frontend response transformations were present. Frontend files and configurations have not been edited. The frontend developer can use the existing `/api/analyze` contract and `/openapi.json`; backend CORS now supports local Vite origins without a frontend configuration edit.

## Prioritized checklist and outcome

- [x] P0: Preserve working metrics, spatial SQL, deterministic formula, mock provider and evidence checks.
- [x] P0: Add optional validated business identity, description, products/services, audience, budget, challenges, current marketing and business stage. Invalid or unbounded strings and nonfinite/negative budgets are rejected.
- [x] P0: Include the full owner context in model prompts and cache keys; explicitly instruct the model to consider current campaigns and budget constraints.
- [x] P0: Add full-aggregate complementary category counts and per-category evidence IDs, competition share, marker-based POI and nearest-competitor summaries, plus explicit data-quality limitations.
- [x] P0: Attach actual contributing metrics to each score. Withhold scores and AI when all mapped categories are unknown. Keep geographic completeness unknown rather than fabricate confidence.
- [x] P0: Validate the configured Snowflake canonical view via DESCRIBE before analysis, including numeric coordinate and GEOGRAPHY types. Cache metadata checks, not query results.
- [x] P0: Support optional service-level category filtering with parameter binding before marker limits.
- [x] P0: Reject duplicate recommendation titles and preserve structured action plans, citation checks and labeled fallback. Fallback considers planning stage, zero budget and existing campaigns.
- [x] P1: Add bounded transient Ollama retries and explicit optional dependency probes; preserve cheap default health.
- [x] P1: Add configurable backend CORS for local browser integration.
- [x] P0: Extend and run automated coverage, including a mocked model-backed complete endpoint request.
- [ ] External: A supplies actual listing schema/release, verified canonical view, category coverage, credentials/grants and CoCo evidence.
- [ ] External: B runs the configured Qwen model locally and validates actual output and latency.
- [ ] External: C wires the frontend to this API; no such API calls existed in inspected frontend code.

## Contracts and limits

New response fields are additive: `business_information`, `neighborhood_insights`, `metrics.competitor_share`, `metrics.unknown_category_count`, and `opportunity_signals[].contributing_metrics`. Category evidence uses `category_count:<canonical_category>` IDs. Distribution counts remain full-radius observations, while point-of-interest/nearest-place lists use bounded map markers and clearly report truncation. The nearest scalar competitor distance remains based on all observed competitors even if a marker list is capped.

Supported goal suggestions are returned by categories. For backward compatibility goals may also be custom nonblank text. Location requires validated coordinates; no address geocoder or demographic dataset is integrated. A business name is optional for planning users. Currency is not inferred from a budget amount.

Data confidence has two components: category completeness can be calculated within mapped records, while geographic completeness and real-world representativeness remain unknown. The legacy heuristic score is preserved and is never labeled a statistical prediction. Missing-category records cannot prove a category gap.

The model prompt considers context, but free-text semantic correctness, adherence to budget, and nonduplication of existing marketing concepts are not mathematically guaranteed. Numerical observations must appear only in verified evidence. Model prose is screened for obvious numeric and certainty claims, and the server constructs the factual reason. Owners should review every suggested experiment. A configured model being listed by Ollama proves installation, not successful inference.

External access was checked without printing secrets: no Snowflake account/user credentials or verified mapping were configured, and the local Ollama `/api/tags` request failed to connect. No live Snowflake query or actual Qwen inference is claimed. See `verification.md` for executed checks. Real CoCo usage remains a team-supplied proof requirement.
