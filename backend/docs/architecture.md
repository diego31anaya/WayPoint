# Snowflake-native backend architecture

```mermaid
flowchart LR
    UI[Existing frontend] --> API[FastAPI]
    API --> Places[Snowflake verified places view]
    Places --> Analytics[Geospatial/category aggregates]
    Analytics --> Score[Existing deterministic Python score]
    Score --> Complete[Snowflake AI_COMPLETE]
    Complete --> Validate[Pydantic and evidence checks]
    Validate --> UI
    API --> Grid[Snowflake H3 aggregates and deterministic SQL score]
    Grid --> UI
    API --> Context[Verified curated analytical context]
    Context --> Agent[Saved Cortex Agent and Snowflake thread]
    Agent --> Analyst[Cortex Analyst semantic view]
    Analyst --> Agent
    Agent --> Guard[Tool-result and numerical checks]
    Guard --> UI
```

`SnowflakeService` retains its bound ST_DWITHIN/ST_DISTANCE query and canonical view checks. `analytics_service` and `scoring_service` remain independent of any LLM. `CortexAIService` reuses these metrics, score objects, schemas, fallback and citation policies; it sends a bound AI_COMPLETE query through the existing connector factory. Model visibility/lifecycle/region checks precede inference. The cache stores only validated successes for an hour, bounded to 128 entries per API process.

Location summaries and score explanations are optional additions to analyze, separately sourced and never model-calculated statistics. All population/survival fields are null until a verified dataset/model is genuinely integrated. Mock data and fallback sources are independent: a real remote model can process explicitly synthetic records without making them real Snowflake observations.

The separate data-lead publisher loads real analysis snapshots into the owned context table; runtime never writes analytical data. The semantic view projects these snapshots into governed facts and metrics. Saved-Agent configuration is verified before each turn. Threads use Snowflake's last assistant-message ID; browser clients receive only an opaque process-local conversation token. The trusted-local MVP has no auth and is not a tenant-security boundary.

H3 cells originate from a fixed-resolution disk, not business presence. Geographic SQL aggregates into full cells, measures their area and mirrors the existing score formula. Empty cells are retained without scores. Heatmaps never trigger cell-by-cell inference.

Request handlers remain synchronous FastAPI worker-thread functions. Every connector cursor and connection is closed. AI statement/network timeouts are configurable; only known transient errors are retried. Agent requests are not retried automatically because turns can be persisted remotely despite timeout. Secrets remain in server settings and safe public errors never include raw connector responses. No local model server or alternative proprietary external API is invoked.
