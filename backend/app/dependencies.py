from functools import lru_cache
from app.config import get_settings
from app.services.cortex_ai_service import CortexAIService
from app.services.snowflake_service import SnowflakeService
from app.services.cortex_agent_service import CortexAgentService
from app.services.opportunity_map_service import OpportunityMapService


@lru_cache
def get_data_service():
    return SnowflakeService(get_settings())


@lru_cache
def get_ai_service():
    return CortexAIService(get_settings())


@lru_cache
def get_agent_service():
    return CortexAgentService(get_settings())


@lru_cache
def get_opportunity_map_service():
    return OpportunityMapService(get_settings())
