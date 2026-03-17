"""
키움 REST API 서비스
- 토큰 발급 (POST /oauth2/token)
- 국내 주식 일봉 데이터 조회 (ka10081)
"""
import httpx
from datetime import datetime
from app.config import settings
from app.models.stock import StockCandle

BASE_URL = "https://openapi.koreainvestment.com:9443"  # 실전
# BASE_URL = "https://openapi.koreainvestment.com:29443"  # 모의

_token_cache: dict = {}


async def get_access_token() -> str:
    """키움 REST API 액세스 토큰 발급 (캐시 적용)"""
    now = datetime.now().timestamp()

    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/oauth2/token",
            json={
                "grant_type": "client_credentials",
                "appkey": settings.kiwoom_app_key,
                "appsecret": settings.kiwoom_app_secret,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    _token_cache["token"] = data["access_token"]
    # 만료 시간: 응답의 expires_in (초) 사용, 없으면 86400 (24h)
    _token_cache["expires_at"] = now + data.get("expires_in", 86400)
    return _token_cache["token"]


async def get_daily_candles(symbol: str, count: int = 200) -> list[StockCandle]:
    """
    국내 주식 일봉 조회 (ka10081)

    Args:
        symbol: 종목코드 (예: "005930" 삼성전자)
        count: 조회 봉 수 (최대 200)

    Returns:
        최신순 정렬된 StockCandle 리스트
    """
    token = await get_access_token()
    today = datetime.now().strftime("%Y%m%d")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
            headers={
                "authorization": f"Bearer {token}",
                "appkey": settings.kiwoom_app_key,
                "appsecret": settings.kiwoom_app_secret,
                "tr_id": "FHKST03010100",
                "custtype": "P",
            },
            params={
                "FID_COND_MRKT_DIV_CODE": "J",   # J: 코스피/코스닥
                "FID_INPUT_ISCD": symbol,
                "FID_INPUT_DATE_1": "19000101",
                "FID_INPUT_DATE_2": today,
                "FID_PERIOD_DIV_CODE": "D",       # D: 일봉
                "FID_ORG_ADJ_PRC": "0",           # 0: 수정주가
            },
        )
        resp.raise_for_status()
        data = resp.json()

    candles = []
    for item in data.get("output2", [])[:count]:
        candles.append(
            StockCandle(
                date=item["stck_bsop_date"],
                open=float(item["stck_oprc"]),
                high=float(item["stck_hgpr"]),
                low=float(item["stck_lwpr"]),
                close=float(item["stck_clpr"]),
                volume=int(item["acml_vol"]),
            )
        )
    return candles


async def get_current_price(symbol: str) -> float:
    """국내 주식 현재가 조회"""
    token = await get_access_token()

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price",
            headers={
                "authorization": f"Bearer {token}",
                "appkey": settings.kiwoom_app_key,
                "appsecret": settings.kiwoom_app_secret,
                "tr_id": "FHKST01010100",
                "custtype": "P",
            },
            params={
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": symbol,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return float(data["output"]["stck_prpr"])
