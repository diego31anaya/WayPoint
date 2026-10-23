# Cortex migration audit and handoff

## Reused and preserved

The baseline had a working Ollama Python-client adapter and 70 passing tests, including a historical local Qwen inference. That live check does not verify Snowflake AI. Existing request profiles, aliases, recommendation schema, evidence registry/equality checks, numerical-prose checks, deterministic fallback strategies, scoring formula, data quality, map markers, CORS and independent dependency providers were reused. Original ST_DWITHIN/ST_DISTANCE SQL and canonical places-view mapping remain intact. Connector construction now accepts a per-operation timeout while retaining the original analytics default.

All generate_recommendations call sites were inspected. `/api/analyze` still passes validated business information, deterministic neighborhood metrics and computed scores. New metadata is additive: ai_provider, Cortex source labels and optional location/score explanations. The original AIService import remains a compatibility alias to CortexAIService; it cannot invoke the retired provider.

## Replaced/removed

- Retired Ollama Client calls, local-model probes, transport-specific retry code, localhost model configuration and the Ollama requirements entry.
- Replaced the local-model smoke script with independent Cortex AI and saved-Agent checks.
- Replaced local-model mocks with connector-bound AI_COMPLETE mocks; retained coverage for malformed output, unknown evidence IDs, changed values/units, numerical prose, guarantees, timeouts, fallback, cache and complete endpoint integration.
- Updated environment template, model attribution, architecture and demo documentation. Historical verification/audit sections are labeled; their old model results are not new live evidence.
- Kept the legacy health `ollama` key as the inert value `removed`, preserving a frontend key without retaining a runtime dependency. No active backend function imports the old package or contacts a local model server.

## Current provider

`cortex_ai_service.py` exposes generate_recommendations, generate_location_summary and explain_opportunity_score. Every generation uses connector-bound AI_COMPLETE with a JSON Schema response_format. Model discovery runs SHOW CORTEX BASE MODELS IN SCHEMA SNOWFLAKE.MODELS and examines visibility, lifecycle and region information. No unavailable model silently switches to a different model/provider. The preference is llama3.3-70b, subject to actual account support. None has run here because credentials are absent.

Only validated successes enter the bounded one-hour cache. Failures return labeled deterministic recommendations/summaries, with no claimed model. Summary limitations always explain that population and survival probability are unavailable. Python remains authoritative for current circular analysis scoring; H3 and the curated semantic projection mirror its formula in deterministic Snowflake SQL.

## Agent integration

The implementation uses the documented saved-Agent REST endpoint and Snowflake thread creation/assistant-parent continuity. It needs actual configured objects: context table/view, analytical projection, semantic view and saved agent. `sql/cortex_setup.sql` and `sql/business_advisor_spec.json` are reviewable setup templates, not evidence that any object exists. The separate publisher script refuses simulated input and uses real data-service metrics with a parameterized MERGE. Runtime analytics/chat remain read-only.

For every turn the server fetches context by bound business/location IDs, verifies the saved Analyst tool references the expected semantic view, requires tool use, and accepts only successful Analyst results with query references. Provided-context metrics and successful query IDs are distinguished in the response. Agent text is checked against observed numerical values and screened for unsupported guarantees; semantic correctness is still not formally provable. Missing context, tool warnings, rate limits and invalid output return controlled errors.

Threads are managed by Snowflake; opaque local handles store the last assistant ID, context identity, expiration and a concurrency lock. A failed continuation invalidates its local handle because the remote turn may already have persisted. New turns are not automatically replayed. This is a single-worker, trusted-local-demo session layer, not durable multi-tenant authentication. Public/multi-owner deployments require row-access policies and authorized session storage. Saved secure/redacted specs fail verification until readable access is arranged.

## H3 integration

`opportunity_map.sql` independently seeds the entire bounded disk using native H3 functions. A left join preserves empty cells; geospatial filtering bounds candidate places and H3 membership establishes exact cell inclusion. Full-cell area normalizes density, and same-resolution scores use the original heuristic. No model is called for each cell. Mock mode contains no fake H3 identifiers: it returns an explicitly labeled empty feature collection. Live H3 execution still needs account verification.

## External checklist

- [ ] A supplies actual listing/release/schema, canonical view, category coverage and genuine CoCo artifacts.
- [ ] Administrator validates available open-weight model lifecycle, role privileges, regional deployment/cross-region policy and spend limits.
- [ ] B runs `scripts.check_cortex --component ai` and records successful validated remote inference separately from places validation.
- [ ] A/B reviews/installs curated analytics and semantic view, publishes real contexts and installs a saved Agent with the actual warehouse.
- [ ] Administrator provides a restricted server-side PAT/OAuth/JWT and token/network policy; runtime spec/tool/view grants are verified.
- [ ] B runs the separate Agent live check with real IDs, records Analyst query IDs, and verifies a follow-up thread turn.
- [ ] A verifies H3 SQL execution, geometry, full-cell counts, area normalization, empty cells and query profile.
- [ ] C separately integrates new chat/map endpoints if desired. No frontend code was modified by this migration.
- [ ] D validates public repo, root license, dataset/model terms and actual submission rules. CoCo usage and track eligibility are not inferred from code.

See README for exact environment variables, commands and API examples. No credentials, .env contents, commits or pushes are part of this task.

## File handoff

- New services: `app/services/cortex_ai_service.py`, `cortex_agent_service.py`, `opportunity_map_service.py`, and provider-independent `ai_common.py`.
- Updated runtime wiring/contracts: `app/config.py`, `dependencies.py`, `main.py`, `schemas.py`, `routers/analysis.py`, `routers/health.py`; added `routers/intelligence.py`. `services/ai_service.py` is now a compatibility import, and `snowflake_service.py` accepts operation-specific timeouts.
- Configuration: `.env.example`, `.gitignore`, `requirements.txt`. No actual `.env` content changed.
- New SQL/setup: `sql/cortex_setup.sql`, `business_advisor_spec.json`, `opportunity_map.sql`. Existing places schema/query templates were preserved.
- New operational scripts: `scripts/check_cortex.py`, `publish_agent_context.py`; retired `check_ollama.py`.
- Tests: updated `conftest.py`, `test_ai.py`, `test_completion.py`; replaced `test_ollama_client.py` with `test_cortex_ai.py`; added `test_cortex_agent.py`, `test_opportunity_map.py`, `test_context_publisher.py`. Existing API, analytics, scoring and places-connector suites remain.
- Documentation: `README.md`, `architecture.md`, `backend-audit.md`, `demo-guide.md`, `verification.md`, and this migration handoff. Genuine CoCo checklist and original MIT license remain.
