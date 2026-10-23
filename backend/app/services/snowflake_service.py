import re
import time
from contextlib import closing
from app.schemas import Business, CATEGORIES
from app.services.analytics_service import from_businesses, get_competitor_metrics
from app.data.demo_data import demo_businesses
from app.data.local_places import nearby_businesses


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
        self.schema_checked_at = None

    def _connection(self):
        s = self.settings
        connect = self.connect
        if connect is None:
            import snowflake.connector
            connect = snowflake.connector.connect
        kwargs = dict(account=s.snowflake_account, user=s.snowflake_user, password=s.snowflake_password,
                      warehouse=s.snowflake_warehouse, login_timeout=10, network_timeout=20,
                      session_parameters={'STATEMENT_TIMEOUT_IN_SECONDS': 30, 'QUERY_TAG': 'BlockBoost'})
        if s.snowflake_role:
            kwargs['role'] = s.snowflake_role
        return connect(**kwargs)

    def _validate_schema(self, cursor, table):
        if self.schema_checked_at is not None and time.monotonic()-self.schema_checked_at < 300:
            return
        cursor.execute(f'DESCRIBE VIEW {table}')
        columns = {str(row[0]).upper(): str(row[1]).upper() for row in cursor.fetchall()}
        required = {'BUSINESS_ID', 'NAME', 'CATEGORY', 'LATITUDE', 'LONGITUDE', 'GEOG'}
        if not required.issubset(columns) or columns.get('GEOG') != 'GEOGRAPHY':
            raise DataUnavailable('Canonical view must expose the required columns and a GEOGRAPHY GEOG field.')
        for column in ['LATITUDE', 'LONGITUDE']:
            if not columns[column].startswith(('FLOAT', 'DOUBLE', 'REAL', 'NUMBER', 'DECIMAL', 'NUMERIC')):
                raise DataUnavailable('Canonical coordinates must be numeric WGS84 degrees.')
        for column in ['BUSINESS_ID', 'NAME', 'CATEGORY']:
            if not columns[column].startswith(('VARCHAR', 'TEXT', 'STRING')):
                raise DataUnavailable('Canonical ID, name, and category must be strings.')
        self.schema_checked_at = time.monotonic()

    def check_availability(self):
        if self.settings.data_mode in ('mock', 'local'):
            return 'not_used'
        if not self.settings.snowflake_mapping_verified:
            return 'mapping_required'
        try:
            s = self.settings
            table = '.'.join(identifier(v) for v in [s.snowflake_database, s.snowflake_schema, s.snowflake_table])
            with closing(self._connection()) as connection, closing(connection.cursor()) as cursor:
                self._validate_schema(cursor, table)
                cursor.execute(f'SELECT GEOG FROM {table} LIMIT 1')
                cursor.fetchone()
            return 'available'
        except Exception:
            return 'unavailable'

    def get_nearby_businesses(self, request, category=None):
        if category is not None and category not in CATEGORIES:
            raise ValueError('Unsupported category')
        return self.analyze(request, map_categories=CATEGORIES[category] if category else None)[0]

    def analyze(self, request, map_categories=None):
        s = self.settings
        if s.data_mode in ('mock', 'local'):
            rows = demo_businesses(request) if s.data_mode == 'mock' else nearby_businesses(request)
            markers = [b for b in rows if map_categories is None or b.category in map_categories]
            return markers[:s.map_limit], from_businesses(request, rows)
        if not s.snowflake_mapping_verified:
            raise DataUnavailable('Live data mapping has not been verified. Ask the data lead to configure the canonical view.')
        try:
            table = '.'.join(identifier(v) for v in [s.snowflake_database, s.snowflake_schema, s.snowflake_table])
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
            marker_filter = ' WHERE CATEGORY IN (' + ','.join(['%s']*len(map_categories)) + ')' if map_categories else ''
            with closing(self._connection()) as connection, closing(connection.cursor()) as cursor:
                self._validate_schema(cursor, table)
                # One statement/snapshot: full neighborhood aggregates plus a bounded map list.
                cursor.execute(cte + '''SELECT 'aggregate' AS KIND, CATEGORY, COUNT(*) AS N, MIN(DISTANCE_M) AS NEAREST,
                    NULL AS BUSINESS_ID, NULL AS NAME, NULL AS LATITUDE, NULL AS LONGITUDE, NULL AS DISTANCE_M
                    FROM nearby GROUP BY CATEGORY
                    UNION ALL
                    SELECT 'place', CATEGORY, NULL, NULL, BUSINESS_ID, NAME, LATITUDE, LONGITUDE, DISTANCE_M
                    FROM (SELECT * FROM nearby''' + marker_filter + ''' ORDER BY DISTANCE_M, BUSINESS_ID LIMIT %s)''',
                    bindings + tuple(map_categories or []) + (s.map_limit,))
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
