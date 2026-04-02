import sys
import asyncio
import json
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.routers import stocks, lines, alerts, news, positions
from app.routers.stocks import _refresh_all_rankings
from app.services.http_client import close_client
from app.services.monitor import realtime_monitor, daily_monitor, touch_result_judge
from app.services.kiwoom_ws import stream_prices, stream_orderbook
from app.services.kis_ws import stream_us_prices, stream_us_orderbook
from app.services.indicator_ws import get_or_create_session, cleanup_empty_sessions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 백그라운드 태스크
    t1 = asyncio.create_task(realtime_monitor())  # 분봉용 WebSocket
    t2 = asyncio.create_task(daily_monitor())     # 일봉/주봉/월봉용 (장 마감 후 1회)
    t3 = asyncio.create_task(_refresh_all_rankings())  # 랭킹 30초 주기 갱신
    t4 = asyncio.create_task(touch_result_judge())  # 터치 결과 판정 (1분 주기)

    yield

    t1.cancel()
    t2.cancel()
    t3.cancel()
    t4.cancel()
    await asyncio.gather(t1, t2, t3, t4, return_exceptions=True)
    await close_client()


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
app.include_router(news.router, prefix="/api")
app.include_router(positions.router, prefix="/api")


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

    async def on_price(code: str, price: float, change_pct: str, **kwargs):
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
         {"market_closed": true}  — 장외시간
    """
    from app.services.kiwoom_ws import _is_market_open
    await websocket.accept()
    stock_codes = [c.strip() for c in codes.split(",") if c.strip()]
    if not stock_codes:
        await websocket.close()
        return

    # 장외시간이면 즉시 알림 후 연결 유지 (클라이언트가 끊을 때까지)
    if not _is_market_open():
        try:
            await websocket.send_text(json.dumps({"market_closed": True}))
        except Exception:
            pass
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
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


@app.websocket("/ws/indicators/{stock_code}")
async def ws_indicators(websocket: WebSocket, stock_code: str, candle_type: str = "D"):
    """
    실시간 기술적 지표 WebSocket (국내 종목 전용)
    연결: ws://localhost:8000/ws/indicators/005930?candle_type=D
    수신: {code, candle_type, timestamp, signal_summary, categories}
    """
    await websocket.accept()
    session = get_or_create_session(stock_code, candle_type)
    await session.add_client(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        session.remove_client(websocket)
        cleanup_empty_sessions()


def _parse_us_codes(codes: str) -> list[dict]:
    """'NAS:AAPL,NYS:IBM' → [{'symbol': 'AAPL', 'exchange': 'NAS'}, ...]"""
    result = []
    for part in codes.split(","):
        part = part.strip()
        if ":" in part:
            exchange, symbol = part.split(":", 1)
            result.append({"symbol": symbol.strip(), "exchange": exchange.strip()})
    return result


@app.websocket("/ws/us_prices")
async def ws_us_prices(websocket: WebSocket, codes: str = ""):
    """
    미국 주식 실시간 체결가 WebSocket (KIS)
    연결: ws://localhost:8000/ws/us_prices?codes=NAS:AAPL,NYS:IBM
    수신: {"code": "AAPL", "price": 150.0, "change_pct": "+1.23"}
    """
    await websocket.accept()
    subscriptions = _parse_us_codes(codes)
    if not subscriptions:
        await websocket.close()
        return

    async def on_price(symbol: str, price: float, change_pct: str, **kwargs):
        try:
            await websocket.send_text(json.dumps({
                "code": symbol,
                "price": price,
                "change_pct": change_pct,
            }))
        except Exception:
            pass

    stream_task = asyncio.create_task(stream_us_prices(subscriptions, on_price))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        stream_task.cancel()


@app.websocket("/ws/us_orderbook")
async def ws_us_orderbook(websocket: WebSocket, codes: str = ""):
    """
    미국 주식 실시간 호가 WebSocket (KIS)
    연결: ws://localhost:8000/ws/us_orderbook?codes=NAS:AAPL
    수신: {"code": "AAPL", "asks": [...], "bids": [...], "total_ask_qty": N, "total_bid_qty": N}
    """
    await websocket.accept()
    subscriptions = _parse_us_codes(codes)
    if not subscriptions:
        await websocket.close()
        return

    async def on_orderbook(symbol: str, orderbook: dict):
        try:
            await websocket.send_text(json.dumps({
                "code": symbol,
                **orderbook,
            }))
        except Exception:
            pass

    stream_task = asyncio.create_task(stream_us_orderbook(subscriptions, on_orderbook))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        stream_task.cancel()
