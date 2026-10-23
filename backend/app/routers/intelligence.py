from fastapi import APIRouter, Depends, HTTPException
from app.config import get_settings
from app.schemas import AgentChatRequest, AgentChatResponse, OpportunityMapRequest, OpportunityMapResponse
from app.dependencies import get_agent_service, get_opportunity_map_service
from app.services.cortex_agent_service import AgentUnavailable
from app.services.snowflake_service import DataUnavailable

router = APIRouter(prefix='/api')


@router.post('/agent/chat', response_model=AgentChatResponse)
def agent_chat(request: AgentChatRequest, agent=Depends(get_agent_service)):
    try:
        return agent.chat(request)
    except AgentUnavailable as exc:
        raise HTTPException(exc.status_code, detail={'code': 'agent_unavailable', 'message': str(exc)}) from exc


@router.post('/opportunity-map', response_model=OpportunityMapResponse)
def opportunity_map(request: OpportunityMapRequest, service=Depends(get_opportunity_map_service)):
    try:
        return service.get_map(request)
    except DataUnavailable as exc:
        raise HTTPException(503, detail={'code': 'map_unavailable', 'message': str(exc)}) from exc
