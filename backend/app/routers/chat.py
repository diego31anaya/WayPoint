from fastapi import APIRouter, Depends
from app.dependencies import get_ai_service
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix='/api')


@router.post('/chat', response_model=ChatResponse)
def chat(request: ChatRequest, ai=Depends(get_ai_service)):
    reply, source, warnings = ai.chat(request.messages, request.context)
    return ChatResponse(reply=reply, source=source, warnings=warnings)
