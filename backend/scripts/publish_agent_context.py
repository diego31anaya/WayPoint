"""Explicit data-lead operation: publish a real Snowflake analysis for Agent/Analyst use."""
import argparse
from contextlib import closing
from app.config import Settings
from app.schemas import AnalysisRequest, StoredLocationContext
from app.services.snowflake_service import SnowflakeService, identifier


def publish_context(settings, request, business_id, location_id, connect=None):
    if settings.data_mode != 'live' or settings.dataset_release == 'unverified':
        raise ValueError('Publishing requires live mode and a recorded dataset release.')
    service = SnowflakeService(settings, connect)
    _, metrics = service.analyze(request)
    context = StoredLocationContext(business_information=request, metrics=metrics,
        data_source='snowflake', dataset_release=settings.dataset_release)
    store_context(settings, service, context, business_id, location_id)
    return context


def store_context(settings, service, context, business_id, location_id):
    """Publish already calculated metrics without taking a second data snapshot."""
    table = '.'.join(identifier(v) for v in [settings.snowflake_agent_database, settings.snowflake_agent_schema, settings.snowflake_context_view])
    with closing(service._connection()) as connection, closing(connection.cursor()) as cursor:
        cursor.execute(f'''MERGE INTO {table} target USING
            (SELECT %s AS BUSINESS_ID, %s AS LOCATION_ID, PARSE_JSON(%s) AS CONTEXT) source
            ON target.BUSINESS_ID = source.BUSINESS_ID AND target.LOCATION_ID = source.LOCATION_ID
            WHEN MATCHED THEN UPDATE SET CONTEXT = source.CONTEXT, UPDATED_AT = CURRENT_TIMESTAMP()
            WHEN NOT MATCHED THEN INSERT (BUSINESS_ID, LOCATION_ID, CONTEXT)
            VALUES (source.BUSINESS_ID, source.LOCATION_ID, source.CONTEXT)''',
            (business_id, location_id, context.model_dump_json()))
        connection.commit()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--business-id', required=True)
    parser.add_argument('--location-id', required=True)
    parser.add_argument('--latitude', required=True, type=float)
    parser.add_argument('--longitude', required=True, type=float)
    parser.add_argument('--business-type', default='coffee_shop')
    parser.add_argument('--radius-m', default=1500, type=int)
    args = parser.parse_args()
    request = AnalysisRequest(business_type=args.business_type, location={'latitude': args.latitude, 'longitude': args.longitude}, radius_m=args.radius_m)
    try:
        publish_context(Settings(), request, args.business_id, args.location_id)
        print('Published a real-data context. This operation requires the separate publisher write role.')
        return 0
    except Exception:
        print('Context publication failed. Check live mapping, release, destination table and publisher grants; no synthetic context was substituted.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
