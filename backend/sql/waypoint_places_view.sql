-- Canonical view for DATA_MODE=live, over the LA places table the data layer built with CoCo.
-- Same filters as local mode (app/data/local_places.py) and data/db.py, so live and local
-- give identical counts: not permanently closed, confidence > 0.7, one row per name + location.
-- Run once in Snowsight (or ask CoCo to run it), then set the backend/.env values at the bottom.

CREATE OR REPLACE VIEW WAYPOINT.PUBLIC.WAYPOINT_PLACES AS
SELECT
  NULL::VARCHAR                   AS BUSINESS_ID,   -- LA_PLACES has no Overture ID column
  TRIM(NAME)::VARCHAR             AS NAME,
  COALESCE(CATEGORY, 'unknown')::VARCHAR AS CATEGORY,
  LAT::FLOAT                      AS LATITUDE,
  LON::FLOAT                      AS LONGITUDE,
  ST_MAKEPOINT(LON, LAT)          AS GEOG          -- Overture coordinates are WGS84 lon/lat
FROM WAYPOINT.PUBLIC.LA_PLACES
WHERE COALESCE(OPERATING_STATUS, '') <> 'permanently_closed'
  AND CONFIDENCE > 0.7
  AND NULLIF(TRIM(NAME), '') IS NOT NULL
  AND LAT IS NOT NULL AND LON IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY TRIM(NAME), LAT, LON ORDER BY CONFIDENCE DESC) = 1;

-- Check: cafes (the data layer's cafe group) within 3 mi of the 91768 center.
-- Expect 59, the same number the site shows for 91768 at 3 mi.
SELECT COUNT(*) AS cafes_3mi
FROM WAYPOINT.PUBLIC.WAYPOINT_PLACES
WHERE ST_DWITHIN(GEOG, ST_MAKEPOINT(-117.79182, 34.06047), 4828)
  AND CATEGORY IN ('bakery', 'bubble_tea_shop', 'cafe', 'cat_cafe', 'coffee_roastery', 'coffee_shop',
                   'dessert_shop', 'donut_shop', 'frozen_yogurt_shop', 'hong_kong_style_cafe', 'ice_cream_shop',
                   'internet_cafe', 'milk_bar', 'non_alcoholic_beverage_venue', 'shaved_ice_shop',
                   'smoothie_juice_bar', 'tea_room');

-- backend/.env:
--   DATA_MODE=live
--   SNOWFLAKE_ACCOUNT=...  SNOWFLAKE_USER=...  SNOWFLAKE_PASSWORD=...  SNOWFLAKE_WAREHOUSE=...
--   SNOWFLAKE_DATABASE=WAYPOINT  SNOWFLAKE_SCHEMA=PUBLIC  SNOWFLAKE_TABLE=WAYPOINT_PLACES
--   SNOWFLAKE_MAPPING_VERIFIED=true   (only after the check above returns 59)
--   DATASET_RELEASE=<Overture release of the CARTO listing, e.g. from SHOW SHARES or the listing page>
-- Then restart the backend and open /api/health?check_dependencies=true: "snowflake" should say "available".
