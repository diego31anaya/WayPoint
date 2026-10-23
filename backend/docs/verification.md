# Verification record — 2026-10-23

Executed locally in the supplied Windows backend environment, Python 3.13.0:

- Installed `requirements.txt`, including the official Snowflake connector.
- `python -m pytest -q`: **30 passed**.
- `python -m pip check`: **No broken requirements found**.
- Started a real Uvicorn subprocess bound to loopback; HTTP health returned 200/ok.
- Real HTTP mock-mode analysis returned two synthetic competitors and three labeled deterministic recommendations; subprocess stopped afterward.

Tests cover request validation, geographic area density, deterministic scoring and monotonic signals, empty neighborhoods, controlled data failure, identifier rejection, SQL binding, full aggregates despite marker limits, cursor/connection cleanup, Ollama timeout, malformed JSON, fake evidence IDs/values/units, numerical prose, obvious certainty claims, successful mocked model output and caching.

**Not verified:** actual Marketplace columns/release, a deployed canonical view, live Snowflake geospatial execution, Snowflake credentials/grants/warehouse, local Ollama installation and actual Qwen generation, model performance/latency, Streamlit integration, real CoCo use, root repository licensing/publication and event submission. These require team access or artifacts. A passing mocked SQL test does not establish that an unknown listing has the required view.

The included backend MIT license covers original backend code. The repository lead still needs to handle the root project license and public repository requirements. The free-text model checks do not constitute a proof of semantic truth; all advice should be treated as proposed experiments, not observed business outcomes.
