from functools import lru_cache
from typing import Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    data_mode: Literal['mock', 'live'] = 'mock'
    ai_enabled: bool = False
    ollama_base_url: str = 'http://localhost:11434'
    ollama_model: str = 'qwen3:1.7b'
    ollama_timeout_s: float = Field(default=45, gt=0, le=180)
    ollama_retries: int = Field(default=1, ge=0, le=2)
    cors_origins: list[str] = ['http://localhost:5173', 'http://127.0.0.1:5173']
    snowflake_account: str = ''
    snowflake_user: str = ''
    snowflake_password: str = ''
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
