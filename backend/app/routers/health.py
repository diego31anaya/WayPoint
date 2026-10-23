from fastapi import APIRouter, Depends
from app.config import get_settings
from app.dependencies import get_data_service, get_ai_service

router = APIRouter(prefix='/api')


@router.get('/health')
def health(check_dependencies: bool = False, settings=Depends(get_settings),
           data=Depends(get_data_service), ai=Depends(get_ai_service)):
    return {'status': 'ok', 'data_mode': settings.data_mode,
            'snowflake': data.check_availability() if check_dependencies else ('not_used' if settings.data_mode == 'mock' else ('configured_not_probed' if settings.snowflake_mapping_verified else 'mapping_required')),
            'ollama': ai.check_availability() if check_dependencies else ('enabled_not_probed' if settings.ai_enabled else 'disabled'),
            'dependencies_checked': check_dependencies,
            'model': settings.ollama_model}
