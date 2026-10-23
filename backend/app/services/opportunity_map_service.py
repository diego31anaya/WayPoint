import json
from pathlib import Path
from contextlib import closing
from app.schemas import CATEGORIES, COMPLEMENTS, OpportunityMapResponse, ZoneFeature, ZoneProperties, ZoneGeometry
from app.services.snowflake_service import SnowflakeService, DataUnavailable, identifier
from app.services.cortex_ai_service import decode_json


class OpportunityMapService:
    def __init__(self, settings, connect=None):
        self.settings = settings
        self.data = SnowflakeService(settings, connect)

    def get_map(self, request):
        s = self.settings
        metadata = {'data_source': 'mock' if s.data_mode == 'mock' else 'snowflake',
            'simulated': s.data_mode == 'mock', 'resolution': request.resolution,
            'grid_disk_k': request.grid_disk_k, 'dataset_release': s.dataset_release,
            'score_formula': '100*(0.4/(1+density/5)+0.6*complements/(complements+5))',
            'limitations': ['Mapped business counts do not establish demand or real-world coverage.',
                'Full H3 cells at the same resolution are compared; empty/unclassified cells have no score.',
                'Demographics and survival probabilities are unavailable. No model calls are made per cell.']}
        if s.data_mode == 'mock':
            metadata['limitations'].append('Mock mode has no H3 geometry fixtures; an empty feature collection is intentional, not a real empty neighborhood.')
            return OpportunityMapResponse(features=[], metadata=metadata)
        if not s.snowflake_mapping_verified:
            raise DataUnavailable('Verify the canonical Snowflake places view before requesting an opportunity map.')
        try:
            view = '.'.join(identifier(v) for v in [s.snowflake_database, s.snowflake_schema, s.snowflake_table])
            sql = (Path(__file__).resolve().parents[2] / 'sql' / 'opportunity_map.sql').read_text(encoding='utf-8').replace('{{places_view}}', view)
            parameters = (request.location.latitude, request.location.longitude, request.resolution, request.grid_disk_k,
                json.dumps(CATEGORIES[request.business_type]), json.dumps(COMPLEMENTS[request.business_type]))
            with closing(self.data._connection()) as connection, closing(connection.cursor()) as cursor:
                self.data._validate_schema(cursor, view)
                cursor.execute(sql, parameters)
                rows = cursor.fetchall()
            features = []
            for cell, geometry, area, competitors, density, complements, total, unknown, distribution, score in rows:
                features.append(ZoneFeature(geometry=ZoneGeometry.model_validate(decode_json(geometry)),
                    properties=ZoneProperties(h3_cell=str(cell), area_sq_km=area, competitor_count=competitors,
                        competitor_density_per_sq_km=density, complementary_count=complements,
                        total_businesses=total, unknown_category_count=unknown,
                        category_distribution=decode_json(distribution) or {}, opportunity_score=score,
                        confidence='limited' if total > unknown else 'insufficient')))
            if len(features) > 1+3*request.grid_disk_k*(request.grid_disk_k+1):
                raise DataUnavailable('Snowflake returned an unexpected grid size.')
            return OpportunityMapResponse(features=features, metadata=metadata)
        except DataUnavailable:
            raise
        except Exception as exc:
            raise DataUnavailable('Opportunity map query failed; verify H3 functions, view mapping, warehouse, and permissions.') from exc
