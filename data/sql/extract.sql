-- Step 4 extract: local businesses within 5 km of Cal Poly Pomona.
-- Export the result to data/sample_places.csv (keep the header row).
-- Note: this listing has TAXONOMY (not CATEGORIES), and BRAND is an object even
-- for non-chains, so check BRAND:names:primary rather than BRAND IS NULL.
SELECT
  ID                                AS id,
  NAMES:primary::string             AS name,
  TAXONOMY:primary::string          AS category,
  TAXONOMY:hierarchy[0]::string     AS top_category,
  TAXONOMY:hierarchy[1]::string     AS sub_category,
  BRAND:names:primary::string       AS brand,
  CONFIDENCE                        AS confidence,
  ST_Y(GEOMETRY)                    AS lat,
  ST_X(GEOMETRY)                    AS lon
FROM OVERTURE_MAPS_PLACES.CARTO.PLACE
WHERE BBOX:xmin BETWEEN -117.8216 - 0.06 AND -117.8216 + 0.06   -- cheap prefilter
  AND BBOX:ymin BETWEEN 34.0575 - 0.05 AND 34.0575 + 0.05
  AND ST_DWITHIN(GEOMETRY, ST_MAKEPOINT(-117.8216, 34.0575), 5000)
  AND CONFIDENCE > 0.7
  AND TAXONOMY:hierarchy[0]::string IN
      ('food_and_drink', 'shopping', 'services_and_business', 'lifestyle_services');

-- Sanity check (2026-10-23): 2,279 places within 5 km at conf > 0.7 before the
-- category filter; only 210 (9%) have a brand, so the name-repeat chain rule matters.
