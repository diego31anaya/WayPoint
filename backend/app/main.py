from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import health, analysis, chat, intelligence

app = FastAPI(title='BlockBoost', version='0.1.0', description='Evidence-grounded neighborhood business experiments')
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins,
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
app.include_router(health.router)
app.include_router(analysis.router)
app.include_router(chat.router)
app.include_router(intelligence.router)
