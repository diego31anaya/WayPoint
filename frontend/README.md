# Merged main/chatbot behavior

Main's neighborhood finder remains the default, including query relevance, ZIP demographics, static H3 recommendations, saved places, the demo and About the data. The optional **Backend analysis** button exposes the incoming API analysis/map view. Finder searches retain their original radius range; the separate backend request is explicitly limited to 100-5000 meters. Selecting a recommended place or reopening a saved place updates backend analysis at that coordinate and the chat context. Both the original VITE_API_URL proxy setting and VITE_API_BASE_URL are supported.

Authentic backend local-export analyses can be attached to Cortex Agent chat with `data_source=local`, including an explicitly enabled local fallback. These observations are never labeled as live Snowflake queries. Synthetic mock data is never registered as real location evidence. The legacy `/api/chat` endpoint and helpers remain available for existing consumers; the existing chatbot UI uses the saved Cortex Agent SDK endpoint and safe Markdown renderer.

The sections below describe the imported chatbot implementation. For merge validation, baseline preservation, and exact current results, see `../docs/chatbot-merge-verification.md`.

---

# BlockBoost / WayPoint frontend

The existing React UI uses FastAPI for analysis, opportunity zones, location explanations, and the Cortex Agent. Static ZIP files supply only the initial ZIP centroid in API mode. The home page example is labeled as a static snapshot.

## Run

From `backend`, install `requirements.txt`, configure the server-only `.env`, and run:

```powershell
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

From `frontend`:

```powershell
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to port 8000. For a separately hosted production API, set `VITE_API_BASE_URL` to its public origin (without `/api`) and configure backend `CORS_ORIGINS` to allow the frontend origin. Copy `.env.example` only if no frontend environment file already exists. Never put Snowflake credentials or tokens in VITE variables.

## Workflow and modes

The form accepts coffee shops, restaurants, bakeries, and bookstores, ZIPs with bundled centroids, and radii 0.1-3.1 miles (the backend accepts 100-5000 meters). Unsupported categories and ZIPs produce explicit errors. Analysis and selected-location state live in App, so dashboard/map/chat share the same results. Selecting an H3 zone analyzes its center at the requested radius. Full-cell scores and circular neighborhood metrics have distinct labels and must not be interpreted as the same geometry.

Backend `DATA_MODE=mock` returns labeled synthetic analysis; it has no zone geometry and never supplies those synthetic metrics to the agent. General chat can still use the real saved agent when server-side SDK credentials are configured. `VITE_STATIC_DEMO=true` explicitly enables the original exported ZIP snapshot explorer for testing; it is not a live dashboard. API failures never substitute static metrics. Demographics, ownership, and measured demand remain unavailable in API mode because there is no verified backend source for them.

For live mode follow `../backend/README.md`: configure the canonical places view, dataset release, Cortex model, saved agent, semantic/context views, and server-side token. No context table or write grants are required for general chat. Verified live analyses register their exact metrics in a bounded server cache; failed registration leaves general chat available and reports missing local context. Cortex inference fallbacks retain their source labels.

Use the existing local demo account to access chat. General questions work before any analysis, using server-side SNOWFLAKE_ACCOUNT/SNOWFLAKE_PAT and the configured saved agent. Chat history is stored per email in this browser. The mounted chat component remains active across view changes, including pending turns. Follow-ups reuse actual Snowflake conversation IDs; the backend explicitly supplies the saved agent on both attach and send. Changing location preserves the conversation and replaces current verified context. The browser sends context references and a selected-zone identifier, never authoritative metrics. Simulated dashboard values are not sent as facts.

Failed turns show an explicit error and retry. New chat starts a new Snowflake conversation while older chats remain in the sidebar. Snowflake owns remote history across API restarts; location snapshot references expire after one hour and require reanalysis. Legacy process-local conversation IDs are discarded when loading browser history.

## Verify

```powershell
npm run build
npm run lint
npx playwright install chromium
npm run test:e2e
```

Playwright starts a mock FastAPI server and Vite if they are not already running. Reused servers must also be configured for mock mode. Tests explicitly distinguish real local HTTP requests to the mock backend from intercepted synthetic heatmap/agent fixtures. The separate opt-in live test does verify real agent access and contextual follow-ups through FastAPI and the existing UI; it does not intercept chat requests. Run it with LIVE_AGENT_TESTS=1 and LIVE_BASE_URL=http://127.0.0.1:5173 against a credential-configured backend. H3 SQL and direct AI_COMPLETE remain separate checks. Backend tests run with `python -m pytest -q` from `backend`.

The existing local email account is a demo session, not production authentication. No credentials are sent to the frontend, and no account setup/grants run automatically.
