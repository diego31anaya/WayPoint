import pytest
from app.config import Settings, get_settings
from app.main import app
from app.dependencies import get_data_service, get_ai_service
from app.services.snowflake_service import SnowflakeService
from app.services.ai_service import AIService
from app.schemas import AnalysisRequest


@pytest.fixture
def request_data():
    return {'business_type': 'coffee_shop', 'location': {'latitude': 34.0551, 'longitude': -117.7499}, 'radius_m': 1500}


@pytest.fixture
def analysis_request(request_data):
    return AnalysisRequest(**request_data)


@pytest.fixture(autouse=True)
def isolate_dependencies():
    settings = Settings(_env_file=None, data_mode='mock', ai_enabled=False)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_data_service] = lambda: SnowflakeService(settings)
    app.dependency_overrides[get_ai_service] = lambda: AIService(settings)
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def cortex_factory():
    import json
    from unittest.mock import MagicMock
    def create(result, model='llama3.3-70b', lifecycle='GA', regions=None):
        cursor, connection = MagicMock(), MagicMock()
        connection.cursor.return_value = cursor
        state = {}
        cursor.description = [(c,) for c in ['name', 'lifecycle_status', 'in_region_availability', 'cross_region_availability']]
        def execute(sql, params=None):
            state.update(sql=sql, params=params)
        cursor.execute.side_effect = execute
        cursor.fetchall.side_effect = lambda: [(model, lifecycle, json.dumps(regions if regions is not None else ['AWS_US_WEST_2']), '[]')]
        def fetchone():
            if 'CURRENT_REGION' in state['sql']:
                return ('AWS_US_WEST_2',)
            value = result(state['params']) if callable(result) else result
            return (json.dumps(value) if not isinstance(value, str) else value,)
        cursor.fetchone.side_effect = fetchone
        return MagicMock(return_value=connection), cursor
    return create
