from fastapi import APIRouter, HTTPException, Query
from typing import Literal
from pydantic import BaseModel
import httpx

from app.services import kiwoom, kis
from app.services.peak_detector import find_peaks, find_valleys
from app.database import get_supabase
from app.config import settings
from app.data.stock_list import search_stocks

router = APIRouter(prefix="/stocks", tags=["stocks"])


# ─────────────────────────────────────────
# 종목 검색
# ─────────────────────────────────────────

@router.get("/search")
async def search(q: str = Query(default="", min_length=1)):
    """종목 이름 또는 코드로 검색"""
    has_kis = bool(settings.kis_app_key and settings.kis_app_secret)
    return search_stocks(q, limit=10, include_us=has_kis)


# ─────────────────────────────────────────
# 인기종목 랭킹
# ─────────────────────────────────────────

@router.get("/ranking")
async def get_ranking(type: str = Query(default="view")):
    """인기종목 랭킹 조회 (type: view|volume|amount|surge|rise|fall|foreign|institution|etf)"""
    try:
        return await kiwoom.get_ranking(type)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/indices")
async def get_indices():
    """KOSPI / KOSDAQ + 미국 지수 조회"""
    results = []
    # 국내 지수
    try:
        kr = await kiwoom.get_indices()
        results.extend(kr)
    except Exception as e:
        print(f"[indices] 국내 지수 조회 실패: {e}")

    # 미국 지수 (KIS 키가 있을 때만)
    if settings.kis_app_key and settings.kis_app_secret:
        try:
            us = await kis.get_us_indices()
            results.extend(us)
        except Exception as e:
            print(f"[indices] 미국 지수 조회 실패: {e}")

    return results


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


@router.get("/")
async def get_watchlist():
    """관심 종목 목록 조회"""
    db = get_supabase()
    result = db.table("stocks").select("*").order("created_at", desc=False).execute()
    return result.data


@router.post("/")
async def add_stock(body: StockAdd):
    """관심 종목 추가"""
    db = get_supabase()
    # 중복 방지
    existing = db.table("stocks").select("id").eq("code", body.code).execute().data
    if existing:
        raise HTTPException(status_code=409, detail="이미 등록된 종목입니다")
    result = db.table("stocks").insert(body.model_dump()).execute()
    return result.data[0]


@router.delete("/{code}")
async def remove_stock(code: str):
    """관심 종목 삭제"""
    db = get_supabase()
    db.table("stocks").delete().eq("code", code).execute()
    return {"deleted": code}


# ─────────────────────────────────────────
# 차트 데이터
# ─────────────────────────────────────────

@router.get("/{market}/{symbol}/candles")
async def get_candles(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    timeframe: str = Query(default="일봉"),
    count: int = Query(default=200, ge=1, le=500),
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
            price = await kiwoom.get_current_price(symbol)
        else:
            price = await kis.get_current_price(symbol, exchange)
        return {"symbol": symbol, "price": price}
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
):
    """주식 호가 조회 (매도/매수 각 10호가)"""
    if market == "US":
        raise HTTPException(status_code=400, detail="해외 종목은 호가를 지원하지 않습니다")
    try:
        return await kiwoom.get_orderbook(symbol)
    except Exception as e:
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
