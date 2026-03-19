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
    if not settings.kis_app_key or not settings.kis_app_secret:
        raise RuntimeError("KIS API 키가 설정되지 않았습니다")
    now = datetime.now().timestamp()

    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE_URL}/oauth2/token",
            data={
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


async def get_fx_rates() -> list[dict]:
    """주요 환율 조회 (KIS API)"""
    token = await get_access_token()
    today = datetime.now().strftime("%Y%m%d")

    # FX@KRW = 원/달러, 나머지는 크로스 환율
    fx_codes = [
        {"code": "FX@KRW", "pair": "USD/KRW", "unit": 1},
        {"code": "FX@JPY", "pair": "JPY/KRW", "unit": 100},
        {"code": "FX@EUR", "pair": "EUR/KRW", "unit": 1},
        {"code": "FX@CNY", "pair": "CNY/KRW", "unit": 1},
        {"code": "FX@GBP", "pair": "GBP/KRW", "unit": 1},
    ]

    usd_krw = None
    results = []

    for fx in fx_codes:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{BASE_URL}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice",
                    headers={
                        "authorization": f"Bearer {token}",
                        "appkey": settings.kis_app_key,
                        "appsecret": settings.kis_app_secret,
                        "tr_id": "FHKST03030100",
                    },
                    params={
                        "FID_COND_MRKT_DIV_CODE": "X",
                        "FID_INPUT_ISCD": fx["code"],
                        "FID_INPUT_DATE_1": today,
                        "FID_INPUT_DATE_2": today,
                        "FID_PERIOD_DIV_CODE": "D",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            output1 = data.get("output1", {})
            raw_price = float(output1.get("ovrs_nmix_prpr", "0"))
            change_pct = output1.get("prdy_ctrt", "0.00")

            if fx["code"] == "FX@KRW":
                # 원/달러 직접
                usd_krw = raw_price
                results.append({"pair": fx["pair"], "value": round(raw_price, 2), "unit": fx["unit"], "change_pct": change_pct})
            else:
                # 크로스 환율 → 원화 환산 (USD/KRW 필요)
                if usd_krw and raw_price > 0:
                    if fx["code"] in ("FX@EUR", "FX@GBP"):
                        # EUR/USD, GBP/USD → 곱하기
                        krw_value = usd_krw * raw_price * fx["unit"]
                    else:
                        # JPY/USD, CNY/USD → 나누기
                        krw_value = usd_krw / raw_price * fx["unit"]
                    results.append({"pair": fx["pair"], "value": round(krw_value, 2), "unit": fx["unit"], "change_pct": change_pct})
        except Exception as e:
            print(f"[kis] 환율 {fx['pair']} 조회 실패: {e}")

    return results


async def get_us_indices() -> list[dict]:
    """미국 주요 지수 조회 (다우, 나스닥, S&P500)"""
    token = await get_access_token()
    today = datetime.now().strftime("%Y%m%d")

    indices = [
        {"code": ".DJI",  "name": "DOW"},
        {"code": "COMP",  "name": "NASDAQ"},
        {"code": "SPX",   "name": "SP500"},
    ]

    results = []
    for idx in indices:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{BASE_URL}/uapi/overseas-price/v1/quotations/inquire-daily-chartprice",
                    headers={
                        "authorization": f"Bearer {token}",
                        "appkey": settings.kis_app_key,
                        "appsecret": settings.kis_app_secret,
                        "tr_id": "FHKST03030100",
                    },
                    params={
                        "FID_COND_MRKT_DIV_CODE": "N",
                        "FID_INPUT_ISCD": idx["code"],
                        "FID_INPUT_DATE_1": today,
                        "FID_INPUT_DATE_2": today,
                        "FID_PERIOD_DIV_CODE": "D",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            output1 = data.get("output1", {})
            if output1:
                results.append({
                    "name": idx["name"],
                    "value": float(output1.get("ovrs_nmix_prpr", "0")),
                    "change_pct": output1.get("prdy_ctrt", "0.00"),
                })
        except Exception as e:
            print(f"[kis] 지수 {idx['name']} 조회 실패: {e}")

    return results
