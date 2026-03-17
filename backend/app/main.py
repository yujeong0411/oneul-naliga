from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.routers import stocks, lines
from app.services.monitor import check_alerts

app = FastAPI(title="oneul-naliga API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router)
app.include_router(lines.router)

# 24시간 가격 감시 스케줄러 (5분마다)
scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def startup():
    scheduler.add_job(check_alerts, "interval", minutes=5, id="price_monitor")
    scheduler.start()


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()


@app.get("/health")
async def health():
    return {"status": "ok"}
