"""
한국투자증권 API 서비스 (해외 주식)
- 토큰 발급
- 미국 주식 일봉 데이터 조회
- 미국 주식 현재가 조회
"""
import httpx
from datetime import datetime
from app.config import settings
from app.models.stock import StockCandle

BASE_URL = "https://openapi.koreainvestment.com:9443"

_token_cache: dict = {}


async def get_access_token() -> str:
    """한투 API 액세스 토큰 발급"""
    now = datetime.now().timestamp()

    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/oauth2/token",
            json={
                "grant_type": "client_credentials",
                "appkey": settings.kis_app_key,
                "appsecret": settings.kis_app_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    _token_cache["token"] = data["access_token"]
    _token_cache["expires_at"] = now + data.get("expires_in", 86400)
    return _token_cache["token"]


async def get_daily_candles(symbol: str, count: int = 200) -> list[StockCandle]:
    """
    미국 주식 일봉 조회 (HHDFS76240000)

    Args:
        symbol: 티커 (예: "AAPL", "TSLA")
        count: 조회 봉 수
    """
    token = await get_access_token()
    today = datetime.now().strftime("%Y%m%d")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/uapi/overseas-price/v1/quotations/dailyprice",
            headers={
                "authorization": f"Bearer {token}",
                "appkey": settings.kis_app_key,
                "appsecret": settings.kis_app_secret,
                "tr_id": "HHDFS76240000",
            },
            params={
                "AUTH": "",
                "EXCD": "NAS",        # NAS: 나스닥, NYS: NYSE, AMS: 아멕스
                "SYMB": symbol,
                "GUBN": "0",          # 0: 일, 1: 주, 2: 월
                "BYMD": today,
                "MODP": "1",          # 1: 수정주가 반영
            },
        )
        resp.raise_for_status()
        data = resp.json()

    candles = []
    for item in data.get("output2", [])[:count]:
        if not item.get("xymd"):
            continue
        candles.append(
            StockCandle(
                date=item["xymd"],
                open=float(item["open"]),
                high=float(item["high"]),
                low=float(item["low"]),
                close=float(item["clos"]),
                volume=int(item["tvol"]),
            )
        )
    return candles


async def get_current_price(symbol: str, exchange: str = "NAS") -> float:
    """미국 주식 현재가 조회"""
    token = await get_access_token()

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/uapi/overseas-price/v1/quotations/price",
            headers={
                "authorization": f"Bearer {token}",
                "appkey": settings.kis_app_key,
                "appsecret": settings.kis_app_secret,
                "tr_id": "HHDFS00000300",
            },
            params={
                "AUTH": "",
                "EXCD": exchange,
                "SYMB": symbol,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return float(data["output"]["last"])
