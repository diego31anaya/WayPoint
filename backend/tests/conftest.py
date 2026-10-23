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
