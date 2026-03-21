from fastapi import APIRouter, HTTPException, Query
from typing import Literal, Optional
from pydantic import BaseModel
import httpx

from app.services import kiwoom, kis
from app.services.kiwoom import KiwoomMaintenanceError
from app.services.peak_detector import find_peaks, find_valleys
from app.database import get_supabase
from app.config import settings
from app.data.stock_list import search_stocks, get_exchanges

router = APIRouter(prefix="/stocks", tags=["stocks"])

# 마지막 성공 데이터 캐시 (장외시간 폴백용)
_cache: dict = {}


# ─────────────────────────────────────────
# 종목 검색
# ─────────────────────────────────────────

@router.get("/search")
async def search(q: str = Query(default="", min_length=1)):
    """종목 이름 또는 코드로 검색"""
    has_kis = bool(settings.kis_app_key and settings.kis_app_secret)
    return search_stocks(q, limit=10, include_us=has_kis)


@router.get("/exchange/{code}")
async def get_exchange(code: str):
    """해외 종목 거래소 코드 조회 (NAS|NYS|AMS)"""
    exchanges = get_exchanges([code])
    return {"exchange": exchanges.get(code, "NAS")}


# ─────────────────────────────────────────
# 인기종목 랭킹
# ─────────────────────────────────────────

@router.get("/ranking/overseas")
async def get_overseas_ranking(type: str = Query(default="rise"), exchange: str = Query(default="NAS")):
    """해외주식 랭킹 조회 (type: rise|fall|volume|amount|marketcap, exchange: NAS|NYS|AMS|HKS)"""
    try:
        return await kis.get_overseas_ranking(type, exchange)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/indices/candles")
async def get_index_candles(code: str = Query(...), period: str = Query(default="D"), count: int = Query(default=600)):
    """해외 지수 캔들 조회 (code: SPX|COMP|.DJI, period: D|W|M|Y)"""
    try:
        candles, info = await kis.get_index_candles(code, period, count)
        return {"candles": candles, "info": info}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/etf/{code}/info")
async def get_etf_info(code: str):
    """ETF 종목정보 (ka40002). 일반 주식이면 null 반환."""
    try:
        info = await kiwoom.get_etf_info(code)
        return info  # None이면 null 반환
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/etf/{code}/daily")
async def get_etf_daily(code: str):
    """ETF 일별 NAV 추이 (ka40003)"""
    try:
        rows = await kiwoom.get_etf_daily(code)
        return {"rows": rows}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/indices/domestic/candles")
async def get_domestic_index_candles(inds_cd: str = Query(...), period: str = Query(default="D"), count: int = Query(default=600)):
    """국내 지수 캔들 조회 (inds_cd: 001=KOSPI, 101=KOSDAQ, period: D|W|M|Y)"""
    try:
        candles = await kiwoom.get_domestic_index_candles(inds_cd, period, count)
        return {"candles": [c.__dict__ for c in candles]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/indices/domestic/info")
async def get_domestic_index_info(inds_cd: str = Query(...), mrkt_tp: str = Query(default="0")):
    """국내 지수 현재가 상세 (inds_cd: 001=KOSPI, 101=KOSDAQ)"""
    try:
        info = await kiwoom.get_domestic_index_info(inds_cd, mrkt_tp)
        return info
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ranking")
async def get_ranking(type: str = Query(default="view")):
    """인기종목 랭킹 조회 (type: view|volume|amount|surge|rise|fall|foreign|institution|etf)"""
    cache_key = f"ranking_{type}"
    try:
        data = await kiwoom.get_ranking(type)
        _cache[cache_key] = data
        return data
    except KiwoomMaintenanceError as e:
        if cache_key in _cache:
            print(f"[ranking] 🔧 점검 중 → 캐시 반환")
            return _cache[cache_key]
        raise HTTPException(status_code=503, detail="키움 API 점검 중입니다.")
    except Exception as e:
        if cache_key in _cache:
            print(f"[ranking] API 실패 → 캐시 반환: {e}")
            return _cache[cache_key]
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/indices")
async def get_indices():
    """KOSPI / KOSDAQ + 미국 지수 조회"""
    results = []
    errors = []  # 실패한 서비스 목록
    kr_ok = False

    # 국내 지수 (키움)
    try:
        kr = await kiwoom.get_indices()
        results.extend(kr)
        kr_ok = True
    except KiwoomMaintenanceError:
        print(f"[indices] 🔧 키움 점검 중 → 캐시 반환")
        errors.append("kiwoom")
        if "indices_kr" in _cache:
            results.extend(_cache["indices_kr"])
    except Exception as e:
        print(f"[indices] 키움 국내 지수 조회 실패: {e}")
        errors.append("kiwoom")
        if "indices_kr" in _cache:
            results.extend(_cache["indices_kr"])

    # 미국 지수 (KIS)
    us_ok = False
    if settings.kis_app_key and settings.kis_app_secret:
        try:
            us = await kis.get_us_indices()
            results.extend(us)
            us_ok = True
        except Exception as e:
            print(f"[indices] KIS 미국 지수 조회 실패: {e}")
            errors.append("kis")
            if "indices_us" in _cache:
                results.extend(_cache["indices_us"])

    # 성공한 데이터만 캐시 갱신
    if kr_ok:
        _cache["indices_kr"] = [r for r in results if r.get("name") in ("KOSPI", "KOSDAQ")]
    if us_ok:
        _cache["indices_us"] = [r for r in results if r.get("name") not in ("KOSPI", "KOSDAQ")]

    return {"data": results, "errors": errors}


_fx_cache: dict = {"data": None, "expires_at": 0.0}

@router.get("/fx")
async def get_fx():
    """주요 환율 조회 — KIS API 우선, 실패 시 open.er-api.com fallback (1시간 캐시)"""
    import time
    now = time.time()
    if _fx_cache["data"] and now < _fx_cache["expires_at"]:
        return _fx_cache["data"]

    # KIS API 우선
    if settings.kis_app_key and settings.kis_app_secret:
        try:
            result = await kis.get_fx_rates()
            if result:
                _fx_cache["data"] = result
                _fx_cache["expires_at"] = now + 600  # 10분 캐시 (실시간에 가깝게)
                return result
        except Exception as e:
            print(f"[fx] KIS 환율 조회 실패: {e}")

    # Fallback: open.er-api.com
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://open.er-api.com/v6/latest/USD")
            r.raise_for_status()
            data = r.json()

        rates = data.get("rates", {})
        krw = rates.get("KRW", 1)

        pairs = [
            ("USD/KRW", "USD",  1),
            ("EUR/KRW", "EUR",  1),
            ("JPY/KRW", "JPY", 100),
            ("CNY/KRW", "CNY",  1),
            ("GBP/KRW", "GBP",  1),
        ]

        result = []
        for pair_name, currency, unit in pairs:
            rate = rates.get(currency, 1)
            value = krw if currency == "USD" else krw / rate * unit
            result.append({"pair": pair_name, "value": round(value, 2), "unit": unit})

        _fx_cache["data"] = result
        _fx_cache["expires_at"] = now + 3600
        return result
    except Exception as e:
        if _fx_cache["data"]:
            return _fx_cache["data"]
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────
# 관심 종목 CRUD
# ─────────────────────────────────────────

class StockAdd(BaseModel):
    code: str
    name: str
    market: Literal["국내", "해외"]
    user_id: Optional[str] = None
    exchange: Optional[str] = None


@router.get("/")
async def get_watchlist(user_id: Optional[str] = Query(default=None)):
    """관심 종목 목록 조회"""
    db = get_supabase()
    query = db.table("stocks").select("*").order("created_at", desc=False)
    if user_id:
        query = query.eq("user_id", user_id)
    items = query.execute().data

    # 해외 종목에 거래소 코드 추가 (DB에 저장된 값 우선, 없으면 KIS lookup)
    us_codes = [s["code"] for s in items if not s["code"].isdigit() and not s.get("exchange")]
    if us_codes:
        exchanges = get_exchanges(us_codes)
        for s in items:
            if not s["code"].isdigit() and not s.get("exchange"):
                s["exchange"] = exchanges.get(s["code"], "NAS")

    return items


@router.post("/")
async def add_stock(body: StockAdd):
    """관심 종목 추가"""
    db = get_supabase()
    # 중복 방지 (같은 유저의 동일 종목)
    query = db.table("stocks").select("id").eq("code", body.code)
    if body.user_id:
        query = query.eq("user_id", body.user_id)
    existing = query.execute().data
    if existing:
        raise HTTPException(status_code=409, detail="이미 등록된 종목입니다")
    data = body.model_dump()
    try:
        result = db.table("stocks").insert(data).execute()
    except Exception:
        data.pop("exchange", None)
        result = db.table("stocks").insert(data).execute()
    return result.data[0]


@router.delete("/{code}")
async def remove_stock(code: str, user_id: Optional[str] = Query(default=None)):
    """관심 종목 삭제"""
    db = get_supabase()
    query = db.table("stocks").delete().eq("code", code)
    if user_id:
        query = query.eq("user_id", user_id)
    query.execute()
    return {"deleted": code}


# ─────────────────────────────────────────
# 차트 데이터
# ─────────────────────────────────────────

@router.get("/{market}/{symbol}/candles")
async def get_candles(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    timeframe: str = Query(default="일봉"),
    count: int = Query(default=600, ge=1, le=1000),
    exchange: str = Query(default="NAS", description="US 전용: NAS, NYS, AMS"),
):
    """캔들 데이터 조회 (timeframe: 일봉·주봉·월봉·60분·30분)"""
    try:
        if market in ("KOSPI", "KOSDAQ"):
            if timeframe == "주봉":
                candles = await kiwoom.get_weekly_candles(symbol, count)
            elif timeframe == "월봉":
                candles = await kiwoom.get_monthly_candles(symbol, count)
            elif timeframe == "년봉":
                candles = await kiwoom.get_yearly_candles(symbol, count)
            elif timeframe.endswith("분"):
                interval = int(timeframe.replace("분", ""))
                if interval not in (1, 3, 5, 10, 15, 30, 60):
                    raise HTTPException(status_code=400, detail=f"지원하지 않는 분봉: {timeframe}")
                candles = await kiwoom.get_minute_candles(symbol, interval, count)
            else:  # 일봉 기본
                candles = await kiwoom.get_daily_candles(symbol, count)
        else:
            if timeframe == "주봉":
                candles = await kis.get_weekly_candles(symbol, count, exchange)
            elif timeframe == "월봉":
                candles = await kis.get_monthly_candles(symbol, count, exchange)
            elif timeframe == "년봉":
                candles = await kis.get_yearly_candles(symbol, count, exchange)
            elif timeframe.endswith("분"):
                interval = int(timeframe.replace("분", ""))
                candles = await kis.get_minute_candles(symbol, interval, count, exchange)
            else:
                candles = await kis.get_daily_candles(symbol, count, exchange)
        return {"symbol": symbol, "market": market, "timeframe": timeframe, "candles": [c.model_dump() for c in candles]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{market}/{symbol}/price")
async def get_price(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    exchange: str = Query(default="NAS"),
):
    """현재가 조회"""
    try:
        if market in ("KOSPI", "KOSDAQ"):
            result = await kiwoom.get_current_price(symbol)
        else:
            result = await kis.get_current_price(symbol, exchange)
        return {"symbol": symbol, "price": result["price"], "change_pct": result["change_pct"]}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────
# 투자자별 매매동향
# ─────────────────────────────────────────

@router.get("/{market}/{symbol}/investors")
async def get_investors(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    count: int = Query(default=20, ge=1, le=60),
):
    """종목별 투자자(개인/외국인/기관) 매매동향 조회"""
    if market == "US":
        raise HTTPException(status_code=400, detail="해외 종목은 투자자 매매동향을 지원하지 않습니다")
    try:
        return await kiwoom.get_investor_trades(symbol, count)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────
# 호가 조회
# ─────────────────────────────────────────

@router.get("/{market}/{symbol}/orderbook")
async def get_orderbook(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    exchange: str = Query(default="NAS"),
):
    """주식 호가 조회 (매도/매수 각 10호가 — 국내: 키움, 해외: KIS)"""
    try:
        if market == "US":
            return await kis.get_us_orderbook(symbol, exchange)
        return await kiwoom.get_orderbook(symbol)
    except KiwoomMaintenanceError:
        raise HTTPException(status_code=503, detail="서버 점검 중입니다. 잠시 후 다시 시도해 주세요.")
    except Exception as e:
        if market == "US":
            # 해외 호가 REST 실패 시 빈 데이터 반환 (WS 실시간으로 채워짐)
            print(f"[orderbook] {symbol}/{exchange} REST 실패: {type(e).__name__}: {e}")
            return {"asks": [], "bids": [], "total_ask_qty": 0, "total_bid_qty": 0}
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────
# 고점 / 저점 자동 탐지
# ─────────────────────────────────────────

@router.get("/{market}/{symbol}/peaks")
async def get_peaks(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    n: int = Query(default=10, ge=3, le=30, description="민감도 (낮을수록 더 많은 고점)"),
    exchange: str = Query(default="NAS"),
):
    """자동 고점 / 저점 탐지 (차트에 표시용)"""
    try:
        if market in ("KOSPI", "KOSDAQ"):
            candles = await kiwoom.get_daily_candles(symbol, 500)
        else:
            candles = await kis.get_daily_candles(symbol, 500, exchange)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    highs  = [c.high  for c in candles]
    lows   = [c.low   for c in candles]
    dates  = [c.date  for c in candles]
    closes = [c.close for c in candles]

    peak_idx   = find_peaks(closes, n=n)
    valley_idx = find_valleys(closes, n=n)

    return {
        "peaks":   [{"date": dates[i], "price": highs[i]}  for i in peak_idx],
        "valleys": [{"date": dates[i], "price": lows[i]}   for i in valley_idx],
    }
