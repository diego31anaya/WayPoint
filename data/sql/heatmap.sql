-- Opportunity heatmap in Snowflake: the same computation as data/heatmap.py, with Snowflake's H3 functions.
-- NOT YET RUN: written without warehouse access. Run it with CoCo, then compare with the check at the bottom.
-- Output: WAYPOINT.PUBLIC.OPPORTUNITY_HEX, one row per (hexagon, category) with a 0-100 score.

CREATE OR REPLACE TABLE WAYPOINT.PUBLIC.OPPORTUNITY_HEX AS
WITH places AS (
  SELECT TRIM(NAME) AS NAME, LAT, LON, OPERATING_STATUS, CONFIDENCE,
         H3_LATLNG_TO_CELL_STRING(LAT, LON, 8) AS CELL,          -- resolution 8, ~0.74 km²
         -- data/categories.py friendly_category()
         CASE
           WHEN SUB_CATEGORY IN ('b2b_service', 'technical_service', 'corporate_or_business_office', 'real_estate_service',
                                 'home_service', 'professional_service', 'legal_service', 'family_service')
             OR CATEGORY IN ('atm', 'money_transfer_service') THEN NULL
           WHEN TOP_CATEGORY = 'food_and_drink' THEN
             IFF(SUB_CATEGORY = 'non_alcoholic_beverage_venue'
                 OR ARRAYS_OVERLAP(SPLIT(CATEGORY, '_'),
                                   ARRAY_CONSTRUCT('cafe', 'coffee', 'tea', 'bakery', 'donut', 'dessert', 'ice', 'yogurt', 'juice')),
                 'cafe', 'restaurant')
           WHEN TOP_CATEGORY = 'shopping' THEN 'retail'
           WHEN TOP_CATEGORY IN ('services_and_business', 'lifestyle_services') THEN 'services'
         END AS GRP
  FROM WAYPOINT.PUBLIC.LA_PLACES
  WHERE NULLIF(TRIM(NAME), '') IS NOT NULL AND LAT IS NOT NULL AND LON IS NOT NULL
),
scoped AS (SELECT * FROM places WHERE GRP IS NOT NULL),
active AS (     -- competitors, as in data/db.py: not closed, confidence > 0.7, one per name + location
  SELECT * FROM scoped
  WHERE COALESCE(OPERATING_STATUS, '') <> 'permanently_closed' AND CONFIDENCE > 0.7
  QUALIFY ROW_NUMBER() OVER (PARTITION BY NAME, LAT, LON ORDER BY CONFIDENCE DESC) = 1
),
cell_counts AS (
  SELECT CELL, GRP, COUNT(*) AS ACTIVE, 0 AS OPENED, 0 AS CLOSED FROM active GROUP BY 1, 2
  UNION ALL
  SELECT CELL, GRP, 0, COUNT_IF(OPERATING_STATUS = 'open'), COUNT_IF(OPERATING_STATUS = 'permanently_closed')
  FROM scoped GROUP BY 1, 2
),
neighborhood AS (  -- each hexagon sums itself + its 6 neighbors (H3 ring 1, ~1.3 km across)
  SELECT d.VALUE::STRING AS CELL, c.GRP, SUM(c.ACTIVE) AS ACTIVE, SUM(c.OPENED) AS OPENED, SUM(c.CLOSED) AS CLOSED
  FROM cell_counts c, LATERAL FLATTEN(H3_GRID_DISK(c.CELL, 1)) d
  GROUP BY 1, 2
),
totals AS (SELECT CELL, SUM(ACTIVE) AS BUSINESSES FROM neighborhood GROUP BY 1 HAVING SUM(ACTIVE) >= 25),
la AS (
  SELECT GRP, SUM(ACTIVE) / SUM(SUM(ACTIVE)) OVER () AS SHARE, SUM(CLOSED) / NULLIF(SUM(OPENED) + SUM(CLOSED), 0) AS CLOSURE
  FROM cell_counts GROUP BY GRP
),
grid AS (           -- every scored hexagon x every category, zero-filled
  SELECT t.CELL, t.BUSINESSES, la.GRP, la.SHARE, la.CLOSURE,
         COALESCE(n.ACTIVE, 0) AS COMPETITORS, COALESCE(n.OPENED, 0) AS OPENED, COALESCE(n.CLOSED, 0) AS CLOSED
  FROM totals t CROSS JOIN la LEFT JOIN neighborhood n ON n.CELL = t.CELL AND n.GRP = la.GRP
),
parts AS (
  SELECT *, SHARE * BUSINESSES AS EXPECTED,
         (CLOSED + 10 * CLOSURE) / (OPENED + CLOSED + 10) AS CLOSURE_RATE,
         PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY BUSINESSES) OVER (PARTITION BY GRP) AS P90
  FROM grid
)
SELECT CELL, GRP AS CATEGORY,
       ROUND(100 * (0.45 * LEAST(GREATEST(1 - (COMPETITORS / EXPECTED) / 2, 0), 1)
                  + 0.35 * LEAST(GREATEST(1 - (CLOSURE_RATE / CLOSURE) / 2, 0), 1)
                  + 0.20 * LEAST(LN(1 + BUSINESSES) / LN(1 + P90), 1))) AS SCORE,
       COMPETITORS, ROUND(EXPECTED, 1) AS EXPECTED, ROUND(CLOSURE_RATE, 3) AS CLOSURE_RATE,
       OPENED + CLOSED AS TRACKED, BUSINESSES,
       H3_CELL_TO_BOUNDARY(CELL) AS OUTLINE
FROM parts;

-- Check against the Python output (frontend/public/data/heat/cafe.json): expect 4,986 hexagons per category,
-- cafe median score 62 (p10 41, p90 75), and identical rows for any one hexagon, e.g. the busiest:
SELECT CATEGORY, COUNT(*) AS HEXAGONS, MEDIAN(SCORE) AS MEDIAN_SCORE FROM WAYPOINT.PUBLIC.OPPORTUNITY_HEX GROUP BY 1 ORDER BY 1;
SELECT * FROM WAYPOINT.PUBLIC.OPPORTUNITY_HEX WHERE CATEGORY = 'cafe' ORDER BY BUSINESSES DESC LIMIT 3;
