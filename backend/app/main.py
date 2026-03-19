import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.routers import stocks, lines, alerts
from app.services.monitor import realtime_monitor, daily_monitor
from app.services.kiwoom_ws import stream_prices, stream_orderbook


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 두 감시 태스크 동시 실행
    t1 = asyncio.create_task(realtime_monitor())  # 분봉용 WebSocket
    t2 = asyncio.create_task(daily_monitor())     # 일봉/주봉/월봉용 (장 마감 후 1회)

    yield

    t1.cancel()
    t2.cancel()
    await asyncio.gather(t1, t2, return_exceptions=True)


app = FastAPI(title="oneul-naliga API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://oneul-naliga.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stocks.router, prefix="/api")
app.include_router(lines.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}




@app.websocket("/ws/prices")
async def ws_prices(websocket: WebSocket, codes: str = ""):
    """
    프론트엔드 실시간 가격 WebSocket
    연결: ws://localhost:8000/ws/prices?codes=005930,000660
    수신: {"code": "005930", "price": 74800, "change_pct": "+0.13"}
    """
    await websocket.accept()
    stock_codes = [c.strip() for c in codes.split(",") if c.strip()]
    if not stock_codes:
        await websocket.close()
        return

    async def on_price(code: str, price: float, change_pct: str):
        try:
            await websocket.send_text(json.dumps({
                "code": code,
                "price": price,
                "change_pct": change_pct,
            }))
        except Exception:
            pass

    stream_task = asyncio.create_task(stream_prices(stock_codes, on_price))
    try:
        while True:
            await websocket.receive_text()  # 연결 유지 (클라이언트 disconnect 감지)
    except WebSocketDisconnect:
        pass
    finally:
        stream_task.cancel()


@app.websocket("/ws/orderbook")
async def ws_orderbook(websocket: WebSocket, codes: str = ""):
    """
    프론트엔드 실시간 호가 WebSocket
    연결: ws://localhost:8000/ws/orderbook?codes=005930
    수신: {"code": "005930", "asks": [...], "bids": [...], "total_ask_qty": N, "total_bid_qty": N}
    """
    await websocket.accept()
    stock_codes = [c.strip() for c in codes.split(",") if c.strip()]
    if not stock_codes:
        await websocket.close()
        return

    async def on_orderbook(code: str, orderbook: dict):
        try:
            await websocket.send_text(json.dumps({
                "code": code,
                **orderbook,
            }))
        except Exception:
            pass

    stream_task = asyncio.create_task(stream_orderbook(stock_codes, on_orderbook))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        stream_task.cancel()
