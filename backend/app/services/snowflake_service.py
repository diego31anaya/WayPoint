import re
from contextlib import closing
from app.schemas import Business, CATEGORIES
from app.services.analytics_service import from_businesses, get_competitor_metrics
from app.data.demo_data import demo_businesses


class DataUnavailable(Exception):
    pass


def identifier(value):
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', value):
        raise DataUnavailable('Snowflake identifiers must be configured as simple SQL identifiers.')
    return '"' + value.upper() + '"'


class SnowflakeService:
    def __init__(self, settings, connect=None):
        self.settings = settings
        self.connect = connect

    def get_nearby_businesses(self, request):
        return self.analyze(request)[0]

    def analyze(self, request):
        s = self.settings
        if s.data_mode == 'mock':
            rows = demo_businesses(request)
            return rows[:s.map_limit], from_businesses(request, rows)
        if not s.snowflake_mapping_verified:
            raise DataUnavailable('Live data mapping has not been verified. Ask the data lead to configure the canonical view.')
        try:
            table = '.'.join(identifier(v) for v in [s.snowflake_database, s.snowflake_schema, s.snowflake_table])
            connect = self.connect
            if connect is None:
                import snowflake.connector
                connect = snowflake.connector.connect
            kwargs = dict(account=s.snowflake_account, user=s.snowflake_user, password=s.snowflake_password,
                          warehouse=s.snowflake_warehouse, login_timeout=10, network_timeout=20,
                          session_parameters={'STATEMENT_TIMEOUT_IN_SECONDS': 30, 'QUERY_TAG': 'BlockBoost'})
            if s.snowflake_role:
                kwargs['role'] = s.snowflake_role
            # Canonical view GEOGRAPHY column isolates listing-specific mapping.
            cte = f'''WITH nearby AS (
                SELECT BUSINESS_ID, NAME, CATEGORY, LATITUDE, LONGITUDE,
                ST_DISTANCE(GEOG, ST_MAKEPOINT(%s, %s)) AS DISTANCE_M
                FROM {table}
                WHERE ST_DWITHIN(GEOG, ST_MAKEPOINT(%s, %s), %s)
                AND LATITUDE BETWEEN -90 AND 90 AND LONGITUDE BETWEEN -180 AND 180
            ) '''
            bindings = (request.location.longitude, request.location.latitude,
                        request.location.longitude, request.location.latitude, request.radius_m)
            with closing(connect(**kwargs)) as connection, closing(connection.cursor()) as cursor:
                # One statement/snapshot: full neighborhood aggregates plus a bounded map list.
                cursor.execute(cte + '''SELECT 'aggregate' AS KIND, CATEGORY, COUNT(*) AS N, MIN(DISTANCE_M) AS NEAREST,
                    NULL AS BUSINESS_ID, NULL AS NAME, NULL AS LATITUDE, NULL AS LONGITUDE, NULL AS DISTANCE_M
                    FROM nearby GROUP BY CATEGORY
                    UNION ALL
                    SELECT 'place', CATEGORY, NULL, NULL, BUSINESS_ID, NAME, LATITUDE, LONGITUDE, DISTANCE_M
                    FROM (SELECT * FROM nearby ORDER BY DISTANCE_M, BUSINESS_ID LIMIT %s)''', bindings + (s.map_limit,))
                distribution, distances, places = {}, [], []
                for kind, category, count, nearest, bid, name, lat, lon, distance in cursor.fetchall():
                    category = str(category or 'unknown')
                    if kind == 'aggregate':
                        distribution[category] = int(count)
                        if category in CATEGORIES[request.business_type] and nearest is not None:
                            distances.append(float(nearest))
                    else:
                        places.append(Business(business_id=str(bid) if bid is not None else None,
                            name=str(name or 'Unnamed business'), category=category,
                            latitude=lat, longitude=lon, distance_m=distance))
                return sorted(places, key=lambda b: b.distance_m), get_competitor_metrics(request, distribution, min(distances, default=None))
        except DataUnavailable:
            raise
        except Exception as exc:
            raise DataUnavailable('Snowflake analysis failed. Check credentials, canonical view, grants, and warehouse.') from exc
