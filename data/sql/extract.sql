-- Step 4 extract: businesses within 5 km of Cal Poly Pomona.
-- Export the result to data/sample_places.csv (keep the header row).
SELECT
  ID                          AS id,
  NAMES:primary::string       AS name,
  CATEGORIES:primary::string  AS category,
  BRAND:names:primary::string AS brand,
  CONFIDENCE                  AS confidence,
  ST_Y(GEOMETRY)              AS lat,
  ST_X(GEOMETRY)              AS lon
FROM OVERTURE_MAPS__PLACES.CARTO.PLACE
WHERE ST_Y(GEOMETRY) BETWEEN 34.0575 - 0.05 AND 34.0575 + 0.05   -- bbox prefilter
  AND ST_X(GEOMETRY) BETWEEN -117.8216 - 0.06 AND -117.8216 + 0.06
  AND ST_DWITHIN(GEOMETRY, ST_MAKEPOINT(-117.8216, 34.0575), 5000)
  AND CONFIDENCE > 0.7;

-- Sanity check: row count and share of rows with a brand.
-- SELECT COUNT(*), AVG(IFF(brand IS NULL, 0, 1)) FROM (<query above>);
