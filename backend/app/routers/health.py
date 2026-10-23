from fastapi import APIRouter, Depends
from app.config import get_settings

router = APIRouter(prefix='/api')


@router.get('/health')
def health(settings=Depends(get_settings)):
    return {'status': 'ok', 'data_mode': settings.data_mode,
            'snowflake': 'not_used' if settings.data_mode == 'mock' else ('configured_not_probed' if settings.snowflake_mapping_verified else 'mapping_required'),
            'ollama': 'enabled_not_probed' if settings.ai_enabled else 'disabled',
            'model': settings.ollama_model}
