from fastapi import FastAPI
from app.routers import health, analysis

app = FastAPI(title='BlockBoost', version='0.1.0', description='Evidence-grounded neighborhood business experiments')
app.include_router(health.router)
app.include_router(analysis.router)
