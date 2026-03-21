"""
한국투자증권 API 서비스 (해외 주식)
- 토큰 발급
- 미국 주식 일봉 데이터 조회
- 미국 주식 현재가 조회
"""
import asyncio
import httpx
from datetime import datetime
from app.config import settings
from app.models.stock import StockCandle

BASE_URL = "https://openapi.koreainvestment.com:9443"

_token_cache: dict = {}
_token_lock: asyncio.Lock | None = None


def _get_token_lock() -> asyncio.Lock:
    global _token_lock
    if _token_lock is None:
        _token_lock = asyncio.Lock()
    return _token_lock


async def get_access_token() -> str:
    """한투 API 액세스 토큰 발급 (캐시 적용, 동시 중복 발급 방지)"""
    if not settings.kis_app_key or not settings.kis_app_secret:
        raise RuntimeError("KIS API 키가 설정되지 않았습니다")
    now = datetime.now().timestamp()

    # 락 없이 먼저 캐시 확인 (빠른 경로)
    if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
        return _token_cache["token"]

    async with _get_token_lock():
        # 락 획득 후 다시 확인 (다른 코루틴이 이미 발급했을 수 있음)
        now = datetime.now().timestamp()
        if _token_cache.get("token") and _token_cache.get("expires_at", 0) > now + 60:
            return _token_cache["token"]

        # 기존 토큰이 있으면 폐기 후 재발급
        if _token_cache.get("token"):
            await revoke_token()

        async with httpx.AsyncClient(timeout=10.0) as client:
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
        now = datetime.now().timestamp()
        _token_cache["expires_at"] = now + data.get("expires_in", 86400)
        print(f"[kis] 토큰 발급 완료, 만료: {datetime.fromtimestamp(_token_cache['expires_at']).strftime('%Y-%m-%d %H:%M')}")
        return _token_cache["token"]


async def revoke_token() -> None:
    """한투 API 접근토큰 폐기"""
    token = _token_cache.get("token")
    if not token:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{BASE_URL}/oauth2/revokeP",
                json={
                    "appkey": settings.kis_app_key,
                    "appsecret": settings.kis_app_secret,
                    "token": token,
                },
            )
    except Exception as e:
        print(f"[kis] 토큰 폐기 실패: {e}")
    _token_cache.clear()


async def _get_period_candles(symbol: str, exchange: str, gubn: str, count: int) -> list[StockCandle]:
    """HHDFS76240000 공통 헬퍼 (GUBN: 0=일, 1=주, 2=월) — 페이지네이션으로 최대 count개 조회"""
    from datetime import timedelta
    token = await get_access_token()
    today = datetime.now().strftime("%Y%m%d")

    all_candles: list[StockCandle] = []
    seen_dates: set[str] = set()
    bymd = today
    max_pages = 10

    for page in range(max_pages):
        async with httpx.AsyncClient(timeout=10.0) as client:
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
                    "EXCD": exchange,
                    "SYMB": symbol,
                    "GUBN": gubn,
                    "BYMD": bymd,
                    "MODP": "1",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        rows = data.get("output2", [])
        if not rows:
            break

        oldest_date = None
        for item in rows:
            date = item.get("xymd", "")
            if not date or date in seen_dates:
                continue
            seen_dates.add(date)
            oldest_date = date
            all_candles.append(StockCandle(
                date=date,
                open=float(item.get("open") or 0),
                high=float(item.get("high") or 0),
                low=float(item.get("low") or 0),
                close=float(item.get("clos") or 0),
                volume=int(item.get("tvol") or 0),
            ))

        if len(all_candles) >= count:
            break
        if not oldest_date:
            break

        # 다음 페이지: 가장 오래된 날짜 하루 전부터 조회
        bymd = (datetime.strptime(oldest_date, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")

    return all_candles[:count]


async def get_daily_candles(symbol: str, count: int = 500, exchange: str = "NAS") -> list[StockCandle]:
    """미국 주식 일봉 조회"""
    return await _get_period_candles(symbol, exchange, "0", count)


async def get_weekly_candles(symbol: str, count: int = 500, exchange: str = "NAS") -> list[StockCandle]:
    """미국 주식 주봉 조회"""
    return await _get_period_candles(symbol, exchange, "1", count)


async def get_monthly_candles(symbol: str, count: int = 300, exchange: str = "NAS") -> list[StockCandle]:
    """미국 주식 월봉 조회"""
    return await _get_period_candles(symbol, exchange, "2", count)


async def get_yearly_candles(symbol: str, count: int = 30, exchange: str = "NAS") -> list[StockCandle]:
    """미국 주식 연봉 조회 (월봉 데이터에서 연별 마지막 봉 추출)"""
    candles = await _get_period_candles(symbol, exchange, "2", 999)
    # 연도별 마지막 데이터 추출
    by_year: dict = {}
    for c in candles:
        year = c.date[:4]
        by_year[year] = c  # 오름차순이라 마지막이 덮어씌워짐
    return list(by_year.values())[:count]


async def get_minute_candles(symbol: str, interval: int = 60, count: int = 300, exchange: str = "NAS") -> list[StockCandle]:
    """미국 주식 분봉 조회 (HHDFS76950200)"""
    token = await get_access_token()

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{BASE_URL}/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice",
            headers={
                "content-type": "application/json; charset=utf-8",
                "authorization": f"Bearer {token}",
                "appkey": settings.kis_app_key,
                "appsecret": settings.kis_app_secret,
                "tr_id": "HHDFS76950200",
                "custtype": "P",
            },
            params={
                "AUTH": "",
                "EXCD": exchange,
                "SYMB": symbol,
                "NMIN": str(interval),
                "PINC": "1",
                "NEXT": "",
                "NREC": str(min(count, 120)),
                "FILL": "",
                "KEYB": "",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    candles = []
    for item in data.get("output2", [])[:count]:
        date_str = item.get("xymd", "") + item.get("xhms", "")
        if not date_str:
            continue
        candles.append(StockCandle(
            date=date_str,
            open=float(item.get("open") or 0),
            high=float(item.get("high") or 0),
            low=float(item.get("low") or 0),
            close=float(item.get("last") or 0),
            volume=int(float(item.get("evol") or 0)),
        ))
    return candles


async def get_us_orderbook(symbol: str, exchange: str = "NAS") -> dict:
    """해외주식 현재가 호가 조회 (HHDFS76200100) — 미국 10호가, 기타 1호가"""
    token = await get_access_token()

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{BASE_URL}/uapi/overseas-price/v1/quotations/inquire-asking-price",
            headers={
                "content-type": "application/json; charset=utf-8",
                "authorization": f"Bearer {token}",
                "appkey": settings.kis_app_key,
                "appsecret": settings.kis_app_secret,
                "tr_id": "HHDFS76200100",
                "custtype": "P",
            },
            params={
                "AUTH": "",
                "EXCD": exchange,
                "SYMB": symbol,
            },
        )
        if not resp.is_success:
            body = resp.text[:300]
            print(f"[kis] get_us_orderbook 오류: {resp.status_code} {body}")
            resp.raise_for_status()
        data = resp.json()

    rt_cd = str(data.get("rt_cd", ""))
    if rt_cd != "0":
        msg = data.get("msg1", "")
        print(f"[kis] get_us_orderbook KIS 응답: rt_cd={rt_cd}, msg={msg}, 전체={str(data)[:200]}")
        raise ValueError(f"{msg or rt_cd}")

    output1 = data.get("output1") or {}
    output2 = data.get("output2")
    # output2는 API에 따라 dict 또는 list로 올 수 있음
    if isinstance(output2, list):
        ob = output2[0] if output2 else {}
    elif isinstance(output2, dict):
        ob = output2
    else:
        ob = {}

    # 매도호가 (pask1=최우선매도, pask10=원거리): 높→낮 순서로 정렬 (10→1)
    asks = []
    for i in range(10, 0, -1):
        price = float(ob.get(f"pask{i}", "0") or "0")
        qty = int(float(ob.get(f"vask{i}", "0") or "0"))
        if price > 0:
            asks.append({"price": price, "quantity": qty})

    # 매수호가 (pbid1=최우선매수, pbid10=원거리): 높→낮 순서 (1→10)
    bids = []
    for i in range(1, 11):
        price = float(ob.get(f"pbid{i}", "0") or "0")
        qty = int(float(ob.get(f"vbid{i}", "0") or "0"))
        if price > 0:
            bids.append({"price": price, "quantity": qty})

    return {
        "asks": asks,
        "bids": bids,
        "total_ask_qty": int(float(output1.get("avol", "0") or "0")),
        "total_bid_qty": int(float(output1.get("bvol", "0") or "0")),
    }


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


async def get_index_candles(code: str, period: str = "D", count: int = 200) -> list[dict]:
    """
    해외 지수 기간별 캔들 조회 (FHKST03030100)
    code: SPX / COMP / .DJI
    period: D=일, W=주, M=월, Y=년
    """
    token = await get_access_token()
    today = datetime.now().strftime("%Y%m%d")
    from datetime import timedelta
    start = (datetime.now() - timedelta(days=365 * 10)).strftime("%Y%m%d")

    async with httpx.AsyncClient(timeout=10.0) as client:
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
                "FID_INPUT_ISCD": code,
                "FID_INPUT_DATE_1": start,
                "FID_INPUT_DATE_2": today,
                "FID_PERIOD_DIV_CODE": period,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    output1 = data.get("output1", {})
    candles = []
    for item in data.get("output2", [])[:count]:
        date = item.get("stck_bsop_date", "")
        if not date:
            continue
        candles.append({
            "date": date,
            "open": float(item.get("ovrs_nmix_oprc", 0) or 0),
            "high": float(item.get("ovrs_nmix_hgpr", 0) or 0),
            "low":  float(item.get("ovrs_nmix_lwpr", 0) or 0),
            "close": float(item.get("ovrs_nmix_prpr", 0) or 0),
            "volume": int(item.get("acml_vol", 0) or 0),
        })
    return candles, output1


async def get_overseas_ranking(rank_type: str, exchange: str = "NAS") -> list[dict]:
    """
    해외주식 랭킹 조회
    rank_type: rise / fall / volume / amount / marketcap
    exchange: NAS / NYS / AMS / HKS 등
    """
    token = await get_access_token()

    # TR_ID 및 endpoint 매핑
    config = {
        "rise":      ("HHDFS76290000", "/uapi/overseas-stock/v1/ranking/updown-rate",  {"GUBN": "1", "NDAY": "0", "VOL_RANG": "0", "AUTH": "", "KEYB": ""}),
        "fall":      ("HHDFS76290000", "/uapi/overseas-stock/v1/ranking/updown-rate",  {"GUBN": "0", "NDAY": "0", "VOL_RANG": "0", "AUTH": "", "KEYB": ""}),
        "volume":    ("HHDFS76310010", "/uapi/overseas-stock/v1/ranking/trade-vol",    {"NDAY": "0", "PRC1": "", "PRC2": "", "VOL_RANG": "0", "AUTH": "", "KEYB": ""}),
        "amount":    ("HHDFS76320010", "/uapi/overseas-stock/v1/ranking/trade-pbmn",   {"NDAY": "0", "PRC1": "", "PRC2": "", "VOL_RANG": "0", "AUTH": "", "KEYB": ""}),
        "marketcap": ("HHDFS76350100", "/uapi/overseas-stock/v1/ranking/market-cap",   {"VOL_RANG": "0", "AUTH": "", "KEYB": ""}),
    }
    if rank_type not in config:
        raise ValueError(f"지원하지 않는 랭킹 타입: {rank_type}")

    tr_id, endpoint, extra_params = config[rank_type]

    # ALL이면 NAS/NYS/AMS 병렬 조회 후 합산 정렬
    exchanges = ["NAS", "NYS", "AMS"] if exchange == "ALL" else [exchange]

    import asyncio

    async def _fetch_one(excd):
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{BASE_URL}{endpoint}",
                headers={
                    "authorization": f"Bearer {token}",
                    "appkey": settings.kis_app_key,
                    "appsecret": settings.kis_app_secret,
                    "tr_id": tr_id,
                },
                params={"EXCD": excd, **extra_params},
            )
            resp.raise_for_status()
            rows = resp.json().get("output2", [])
            for row in rows:
                row["_excd"] = excd  # 실제 거래소 추적
            return rows

    all_rows = []
    for rows in await asyncio.gather(*[_fetch_one(e) for e in exchanges], return_exceptions=True):
        if isinstance(rows, list):
            all_rows.extend(rows)

    # 등락률 기준 정렬 (rise/fall), 그 외는 수치 기준
    sort_key = {
        "rise":      lambda x: -float(x.get("rate", "0") or "0"),
        "fall":      lambda x:  float(x.get("rate", "0") or "0"),
        "volume":    lambda x: -float(x.get("tvol", "0") or "0"),
        "amount":    lambda x: -float(x.get("tamt", "0") or "0"),
        "marketcap": lambda x: -float(x.get("tomv", "0") or "0"),
    }
    all_rows.sort(key=sort_key.get(rank_type, lambda x: 0))

    results = []
    for i, item in enumerate(all_rows[:100]):
        price_str = item.get("last", "0") or "0"
        rate_str  = item.get("rate", "0.00") or "0.00"

        extra = None
        if rank_type == "volume":
            tvol = item.get("tvol", "")
            extra = f"{int(tvol):,}주" if tvol else None
        elif rank_type == "amount":
            tamt = item.get("tamt", "")
            extra = f"${int(float(tamt)):,}" if tamt else None
        elif rank_type == "marketcap":
            tomv = item.get("tomv", "")
            extra = f"${int(float(tomv)):,}" if tomv else None

        results.append({
            "rank": int(item.get("rank", i + 1)),
            "code": item.get("symb", ""),
            "name": item.get("name", item.get("ename", "")),
            "price": float(price_str) if price_str else None,
            "change_pct": rate_str,
            "extra": extra,
            "exchange": item.get("_excd", exchange),  # 실제 거래소 코드
        })
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
