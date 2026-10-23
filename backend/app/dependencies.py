from functools import lru_cache
from app.config import get_settings
from app.services.ai_service import AIService
from app.services.snowflake_service import SnowflakeService


@lru_cache
def get_data_service():
    return SnowflakeService(get_settings())


@lru_cache
def get_ai_service():
    return AIService(get_settings())
