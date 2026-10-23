-- Only {{places_view}} is substituted, using strict configured identifiers.
-- All input values below are connector-bound parameters. Full, same-resolution
-- cells are compared; this is a bounded H3 disk, not a clipped radius circle.
WITH params AS (
    SELECT %s::FLOAT AS lat, %s::FLOAT AS lon, %s::INTEGER AS resolution,
           %s::INTEGER AS disk_k, PARSE_JSON(%s) AS competitors, PARSE_JSON(%s) AS complements
), cells AS (
    SELECT f.value::NUMBER AS cell FROM params,
    LATERAL FLATTEN(INPUT => H3_GRID_DISK(H3_LATLNG_TO_CELL(lat, lon, resolution), disk_k)) f
), boundaries AS (
    SELECT cell, H3_CELL_TO_BOUNDARY(cell) AS geog FROM cells
), category_counts AS (
    SELECT cell, COALESCE(NULLIF(p.CATEGORY, ''), 'unknown') AS category, COUNT(*) AS n
    FROM params CROSS JOIN {{places_view}} p
    JOIN cells ON H3_POINT_TO_CELL(p.GEOG, params.resolution) = cells.cell
    -- Conservative pruning envelope for resolution >=7 and disk_k <=4;
    -- the grid membership test remains the exact inclusion criterion.
    WHERE ST_DWITHIN(p.GEOG, ST_MAKEPOINT(params.lon, params.lat), 50000)
    GROUP BY cell, COALESCE(NULLIF(p.CATEGORY, ''), 'unknown')
), tagged AS (
    SELECT c.*, IFF(ARRAY_CONTAINS(TO_VARIANT(category), competitors), n, 0) AS competing,
           IFF(ARRAY_CONTAINS(TO_VARIANT(category), complements), n, 0) AS complementary,
           IFF(category = 'unknown', n, 0) AS unknown_n
    FROM category_counts c CROSS JOIN params
), totals AS (
    SELECT cells.cell, COALESCE(SUM(n), 0) AS total_n,
           COALESCE(SUM(competing), 0) AS competitor_n,
           COALESCE(SUM(complementary), 0) AS complement_n,
           COALESCE(SUM(unknown_n), 0) AS unknown_n,
           OBJECT_AGG(category, TO_VARIANT(n)) AS distribution
    FROM cells LEFT JOIN tagged ON cells.cell = tagged.cell
    GROUP BY cells.cell
), measured AS (
    SELECT t.*, b.geog, ST_AREA(b.geog) / 1000000.0 AS area_sq_km
    FROM totals t JOIN boundaries b ON t.cell = b.cell
)
SELECT H3_INT_TO_STRING(cell), ST_ASGEOJSON(geog), area_sq_km,
       competitor_n, competitor_n / area_sq_km AS density,
       complement_n, total_n, unknown_n, distribution,
       CASE WHEN total_n = 0 OR total_n = unknown_n THEN NULL
       ELSE ROUND(100 * (0.4 / (1 + (competitor_n / area_sq_km) / 5)
             + 0.6 * complement_n / (complement_n + 5)), 2) END AS opportunity_score
FROM measured ORDER BY cell
