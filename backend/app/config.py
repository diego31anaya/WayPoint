from functools import lru_cache
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    data_mode: Literal['local', 'mock', 'live'] = 'local'
    # Live mode only: on a Snowflake failure, analyze the local export of the same table (labeled) instead of a 503.
    local_fallback: bool = False
    ai_enabled: bool = False
    ai_provider: Literal['snowflake_cortex'] = 'snowflake_cortex'
    snowflake_cortex_model: str = 'llama3.3-70b'
    cortex_timeout_s: int = Field(default=60, ge=5, le=180)
    cortex_temperature: float = Field(default=0, ge=0, le=1)
    cortex_retries: int = Field(default=1, ge=0, le=2)
    cortex_allow_legacy: bool = False
    cortex_allow_cross_region: bool = False
    cortex_open_weight_models: list[str] = ['llama3.3-70b']
    snowflake_agent_database: str = 'BLOCKBOOST'
    snowflake_agent_schema: str = 'PUBLIC'
    snowflake_agent_name: str = 'BUSINESS_ADVISOR'
    snowflake_agent_tool_name: str = 'neighborhood_analyst'
    snowflake_semantic_view: str = 'BLOCKBOOST.PUBLIC.NEIGHBORHOOD_SEMANTIC'
    snowflake_context_view: str = 'NEIGHBORHOOD_CONTEXT'
    snowflake_agent_setup_verified: bool = False
    snowflake_account_base_url: str = ''
    snowflake_agent_token: str = Field(default='', repr=False)
    snowflake_agent_token_type: Literal['PROGRAMMATIC_ACCESS_TOKEN', 'OAUTH', 'KEYPAIR_JWT'] = 'PROGRAMMATIC_ACCESS_TOKEN'
    cors_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173']
    snowflake_account: str = ''
    snowflake_user: str = ''
    snowflake_password: str = Field(default='', repr=False)
    snowflake_warehouse: str = ''
    snowflake_role: str = ''
    snowflake_database: str = ''
    snowflake_schema: str = ''
    snowflake_table: str = ''
    snowflake_mapping_verified: bool = False
    dataset_release: str = 'unverified'
    map_limit: int = Field(default=200, ge=1, le=1000)


@lru_cache
def get_settings():
    return Settings()
