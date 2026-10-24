from fastapi import APIRouter, Depends
from app.config import get_settings
from app.dependencies import get_data_service, get_ai_service

router = APIRouter(prefix='/api')


@router.get('/health')
def health(check_dependencies: bool = False, settings=Depends(get_settings),
           data=Depends(get_data_service), ai=Depends(get_ai_service)):
    return {'status': 'ok', 'data_mode': settings.data_mode,
            'snowflake': data.check_availability() if check_dependencies else ('not_used' if settings.data_mode in ('mock', 'local') else ('configured_not_probed' if settings.snowflake_mapping_verified else 'mapping_required')),
            'ollama': 'removed',
            'cortex': ai.check_availability() if check_dependencies else ('enabled_not_probed' if settings.ai_enabled else 'disabled'),
            'ai_provider': settings.ai_provider,
            'agent': 'configured_not_probed' if settings.snowflake_account and (settings.snowflake_pat or settings.snowflake_agent_token) else 'setup_required',
            'dependencies_checked': check_dependencies,
            'model': settings.snowflake_cortex_model}
