-- LEGACY OPTIONAL context-table template, not required by the SDK chatbot.
-- The existing verified agent/view are WAYPOINT.PUBLIC.BUSINESS_ADVISOR and
-- WAYPOINT.PUBLIC.BUSINESS_ANALYTICS. Do not replace them with this example.
-- Administrator/data lead worksheet. Review every statement before running.
-- No account setup or grants are executed by the API.
SHOW CORTEX BASE MODELS IN SCHEMA SNOWFLAKE.MODELS;
SELECT CURRENT_REGION();
SHOW PARAMETERS LIKE 'CORTEX_ENABLED_CROSS_REGION' IN ACCOUNT;
-- Select a visible, supported open-weight model. Do not assume llama3.3-70b is
-- still GA or available in your region. The backend blocks EOL/legacy by default.
-- Grant the runtime role Cortex AI access and model USAGE according to current
-- account RBAC; use a separate administrator for these changes.

-- Example owned analytics schema; change names to match deployment settings.
CREATE DATABASE IF NOT EXISTS BLOCKBOOST;
CREATE SCHEMA IF NOT EXISTS BLOCKBOOST.PUBLIC;
CREATE TABLE IF NOT EXISTS BLOCKBOOST.PUBLIC.NEIGHBORHOOD_CONTEXT (
    BUSINESS_ID VARCHAR NOT NULL,
    LOCATION_ID VARCHAR NOT NULL,
    CONTEXT VARIANT NOT NULL,
    UPDATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (BUSINESS_ID, LOCATION_ID)
);
-- Standard-table keys are informational: verify uniqueness and use a single
-- publisher. The API rejects ambiguous context, rather than choosing a row.
-- Optional pre-publication uses scripts.publish_agent_context; /api/analyze now keeps verified runtime snapshots.

CREATE OR REPLACE VIEW BLOCKBOOST.PUBLIC.NEIGHBORHOOD_ANALYTICS AS
SELECT BUSINESS_ID, LOCATION_ID,
    CONTEXT:business_information:business_type::VARCHAR AS BUSINESS_TYPE,
    CONTEXT:business_information:location:latitude::FLOAT AS LATITUDE,
    CONTEXT:business_information:location:longitude::FLOAT AS LONGITUDE,
    CONTEXT:business_information:radius_m::NUMBER AS RADIUS_M,
    CONTEXT:metrics:competitor_count::NUMBER AS COMPETITOR_COUNT,
    CONTEXT:metrics:competitor_density_per_sq_km::FLOAT AS COMPETITOR_DENSITY,
    CONTEXT:metrics:nearest_competitor_distance_m::FLOAT AS NEAREST_COMPETITOR_M,
    CONTEXT:metrics:complementary_count::NUMBER AS COMPLEMENTARY_COUNT,
    CONTEXT:metrics:total_businesses::NUMBER AS TOTAL_BUSINESSES,
    CONTEXT:metrics:unknown_category_count::NUMBER AS UNKNOWN_CATEGORY_COUNT,
    CASE WHEN TOTAL_BUSINESSES = 0 OR TOTAL_BUSINESSES = UNKNOWN_CATEGORY_COUNT THEN NULL
         ELSE ROUND(100 * (0.4 / (1 + COMPETITOR_DENSITY / 5)
                + 0.6 * COMPLEMENTARY_COUNT / (COMPLEMENTARY_COUNT + 5)), 2) END AS OPPORTUNITY_SCORE,
    CONTEXT:dataset_release::VARCHAR AS DATASET_RELEASE, UPDATED_AT
FROM BLOCKBOOST.PUBLIC.NEIGHBORHOOD_CONTEXT
WHERE CONTEXT:data_source::VARCHAR = 'snowflake';

CREATE OR REPLACE SEMANTIC VIEW BLOCKBOOST.PUBLIC.NEIGHBORHOOD_SEMANTIC
TABLES (locations AS BLOCKBOOST.PUBLIC.NEIGHBORHOOD_ANALYTICS PRIMARY KEY (BUSINESS_ID, LOCATION_ID))
DIMENSIONS (
    locations.business_id AS BUSINESS_ID,
    locations.location_id AS LOCATION_ID,
    locations.business_type AS BUSINESS_TYPE,
    locations.radius_m AS RADIUS_M,
    locations.dataset_release AS DATASET_RELEASE
)
FACTS (
    locations.competitors AS COMPETITOR_COUNT,
    locations.density AS COMPETITOR_DENSITY,
    locations.complements AS COMPLEMENTARY_COUNT,
    locations.opportunity AS OPPORTUNITY_SCORE
)
METRICS (
    locations.competitor_count AS MAX(locations.competitors),
    locations.competitor_density AS MAX(locations.density),
    locations.complementary_count AS MAX(locations.complements),
    locations.opportunity_score AS MAX(locations.opportunity)
)
COMMENT = 'Mapped-place heuristics, not demand, survival, population or profit predictions.'
AI_SQL_GENERATION 'Always filter by requested BUSINESS_ID and LOCATION_ID. Group comparisons by LOCATION_ID and include RADIUS_M. Do not sum overlapping neighborhoods. Compare densities only for comparable radii and dataset releases. No survival, traffic, population or revenue data is available.';

-- Create a saved agent in Snowsight or with CREATE AGENT ... FROM SPECIFICATION.
-- Review sql/business_advisor_spec.json; set an account-supported orchestration
-- model and actual execution_environment.warehouse before installing.
-- Do not grant account admin to the API. Runtime needs read privileges on
-- verified places, curated analytics/context and semantic views, appropriate
-- Cortex/Analyst access and USAGE on the saved agent, plus token/network policy.
-- Only the optional standalone publisher requires INSERT/UPDATE on NEIGHBORHOOD_CONTEXT.
-- Agent spec must be readable for runtime verification. A secure/redacted
-- specification will fail closed; configure access deliberately with the owner.
