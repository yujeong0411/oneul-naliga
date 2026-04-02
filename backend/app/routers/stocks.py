from fastapi import APIRouter, HTTPException, Query
from typing import Literal, Optional
from pydantic import BaseModel
import httpx

from app.services import kiwoom, kis
from app.services.kiwoom import KiwoomMaintenanceError
from app.services.peak_detector import find_peaks, find_valleys
from app.services.indicators import calculate_indicators, detect_support_resistance
from app.services.indicator_ws import _get_benchmark
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


_RANKING_TYPES = ["view", "volume", "amount", "surge", "rise", "fall", "foreign", "institution", "etf"]
_ranking_cache: dict[str, list] = {}


async def _refresh_all_rankings():
    """모든 랭킹 타입을 순차 갱신 (백그라운드 태스크)"""
    import asyncio
    while True:
        for rt in _RANKING_TYPES:
            try:
                data = await kiwoom.get_ranking(rt)
                _ranking_cache[rt] = data
            except Exception as e:
                print(f"[ranking] {rt} 백그라운드 갱신 실패: {type(e).__name__}: {e}")
            await asyncio.sleep(0.5)
        await asyncio.sleep(30)


@router.get("/ranking")
async def get_ranking(type: str = Query(default="view")):
    """인기종목 랭킹 조회 — 캐시 즉시 반환"""
    if type in _ranking_cache:
        return _ranking_cache[type]
    try:
        data = await kiwoom.get_ranking(type)
        _ranking_cache[type] = data
        return data
    except KiwoomMaintenanceError:
        raise HTTPException(status_code=503, detail="키움 API 점검 중입니다.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/indices/kr")
async def get_indices_kr():
    """국내 지수 조회 (KOSPI / KOSDAQ)"""
    try:
        kr = await kiwoom.get_indices()
        _cache["indices_kr"] = kr
        return {"data": kr, "error": None}
    except KiwoomMaintenanceError:
        print(f"[indices] 키움 점검 중 → 캐시 반환")
        return {"data": _cache.get("indices_kr", []), "error": "kiwoom"}
    except Exception as e:
        print(f"[indices] 키움 국내 지수 조회 실패: {e}")
        return {"data": _cache.get("indices_kr", []), "error": "kiwoom"}


@router.get("/indices/us")
async def get_indices_us():
    """미국 지수 조회 (DOW / NASDAQ / SP500)"""
    if not settings.kis_app_key or not settings.kis_app_secret:
        return {"data": [], "error": None}
    try:
        us = await kis.get_us_indices()
        _cache["indices_us"] = us
        return {"data": us, "error": None}
    except Exception as e:
        print(f"[indices] KIS 미국 지수 조회 실패: {e}")
        return {"data": _cache.get("indices_us", []), "error": "kis"}


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


# ─────────────────────────────────────────
# 기술적 지표
# ─────────────────────────────────────────

class IndicatorRequest(BaseModel):
    code: str
    candle_type: str = "D"   # "1"|"5"|"60"|"D"|"W"|"M"


@router.post("/indicators")
async def get_indicators(body: IndicatorRequest):
    """
    기술적 지표 계산 (국내 종목 전용)
    candle_type: "1"=1분봉, "5"=5분봉, "60"=60분봉, "D"=일봉, "W"=주봉, "M"=월봉
    """
    try:
        ct = body.candle_type
        if ct == "D":
            candles = await kiwoom.get_daily_candles(body.code, count=300)
        elif ct == "W":
            candles = await kiwoom.get_weekly_candles(body.code, count=150)
        elif ct == "M":
            candles = await kiwoom.get_monthly_candles(body.code, count=120)
        else:
            interval = int(ct)
            candles = await kiwoom.get_minute_candles(body.code, interval=interval, count=300)

        if not candles:
            raise HTTPException(status_code=404, detail="캔들 데이터 없음")

        benchmark = await _get_benchmark() if ct == "D" else None
        result = await calculate_indicators(candles, benchmark)
        result["code"] = body.code
        result["candle_type"] = ct
        return result
    except KiwoomMaintenanceError:
        raise HTTPException(status_code=503, detail="서버 점검 중입니다")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))



# ─────────────────────────────────────────
# 일목균형표 차트 데이터
# ─────────────────────────────────────────

@router.post("/ichimoku")
async def get_ichimoku_chart(body: IndicatorRequest):
    """일목균형표 차트용 시계열 데이터 반환"""
    import pandas as pd
    import pandas_ta as ta

    try:
        ct = body.candle_type
        if ct == "D":
            candles = await kiwoom.get_daily_candles(body.code, count=300)
        elif ct == "W":
            candles = await kiwoom.get_weekly_candles(body.code, count=150)
        elif ct == "M":
            candles = await kiwoom.get_monthly_candles(body.code, count=120)
        else:
            interval = int(ct)
            candles = await kiwoom.get_minute_candles(body.code, interval=interval, count=300)

        if not candles or len(candles) < 52:
            raise HTTPException(status_code=400, detail="데이터 부족 (최소 52봉)")

        # candles: 최신→과거, DataFrame은 과거→최신
        asc = list(reversed(candles))
        rows = [{"date": c.date, "open": c.open, "high": c.high,
                 "low": c.low, "close": c.close, "volume": c.volume} for c in asc]
        df = pd.DataFrame(rows)
        df["close"] = df["close"].astype(float)
        df["high"] = df["high"].astype(float)
        df["low"] = df["low"].astype(float)

        ichi = df.ta.ichimoku(tenkan=9, kijun=26, senkou=52, append=False)
        if ichi is None:
            raise HTTPException(status_code=500, detail="일목균형표 계산 실패")

        ichi_df = ichi[0] if isinstance(ichi, tuple) else ichi
        span_df = ichi[1] if isinstance(ichi, tuple) and len(ichi) > 1 else None

        tenkan_col = [c for c in ichi_df.columns if c.startswith("ITS_")]
        kijun_col = [c for c in ichi_df.columns if c.startswith("IKS_")]
        span_a_col = [c for c in ichi_df.columns if c.startswith("ISA_")]
        span_b_col = [c for c in ichi_df.columns if c.startswith("ISB_")]

        def series_to_list(series, dates):
            result = []
            for i, v in enumerate(series):
                if pd.notna(v) and i < len(dates):
                    result.append({"date": dates[i], "value": round(float(v))})
            return result

        dates = [c.date for c in asc]

        data = {
            "tenkan": series_to_list(ichi_df[tenkan_col[0]], dates) if tenkan_col else [],
            "kijun": series_to_list(ichi_df[kijun_col[0]], dates) if kijun_col else [],
            "chikou": [],  # 후행스팬: 현재 종가를 26봉 전에 표시
        }

        # 선행스팬 A/B: 26봉 앞으로 시프트 + 미래 구름
        if span_a_col and span_b_col:
            from datetime import datetime, timedelta

            # 캔들 간격 추정 (분봉 vs 일봉)
            is_minute = len(dates[0]) > 8  # 분봉: "20260327093000"
            if is_minute and len(dates) >= 2:
                # 분봉 간격 계산
                d1 = datetime.strptime(dates[-2][:12], "%Y%m%d%H%M")
                d2 = datetime.strptime(dates[-1][:12], "%Y%m%d%H%M")
                interval = d2 - d1
            else:
                interval = timedelta(days=1)
                if ct == "W":
                    interval = timedelta(days=7)
                elif ct == "M":
                    interval = timedelta(days=30)

            # 선행스팬은 26봉 앞으로 시프트
            def shifted_dates(offset=26):
                """dates 배열에서 offset만큼 앞으로 시프트된 날짜 배열 생성"""
                result = []
                for i in range(len(dates)):
                    future_idx = i + offset
                    if future_idx < len(dates):
                        result.append(dates[future_idx])
                    else:
                        # 미래 날짜 생성
                        overshoot = future_idx - len(dates) + 1
                        if is_minute:
                            base = datetime.strptime(dates[-1][:12], "%Y%m%d%H%M")
                            fd = base + interval * overshoot
                            result.append(fd.strftime("%Y%m%d%H%M") + "00")
                        else:
                            base = datetime.strptime(dates[-1][:8], "%Y%m%d")
                            fd = base + interval * overshoot
                            result.append(fd.strftime("%Y%m%d"))
                return result

            shifted = shifted_dates(26)

            span_a_current = []
            span_b_current = []
            sa_series = ichi_df[span_a_col[0]]
            sb_series = ichi_df[span_b_col[0]]
            for i in range(len(sa_series)):
                a_v = sa_series.iloc[i]
                b_v = sb_series.iloc[i]
                if pd.notna(a_v) and pd.notna(b_v) and i < len(shifted):
                    span_a_current.append({"date": shifted[i], "value": round(float(a_v))})
                    span_b_current.append({"date": shifted[i], "value": round(float(b_v))})

            # 미래 구름 (span_df) - 이미 26봉 이후 데이터
            if span_df is not None:
                future_a_col = [c for c in span_df.columns if c.startswith("ISA_")]
                future_b_col = [c for c in span_df.columns if c.startswith("ISB_")]
                if future_a_col and future_b_col:
                    for fi in range(len(span_df)):
                        a_v = span_df[future_a_col[0]].iloc[fi]
                        b_v = span_df[future_b_col[0]].iloc[fi]
                        if pd.notna(a_v) and pd.notna(b_v):
                            overshoot = len(dates) + fi - len(dates) + 26 + 1
                            if is_minute:
                                base = datetime.strptime(dates[-1][:12], "%Y%m%d%H%M")
                                fd = base + interval * (fi + 27)
                                fd_str = fd.strftime("%Y%m%d%H%M") + "00"
                            else:
                                base = datetime.strptime(dates[-1][:8], "%Y%m%d")
                                fd = base + interval * (fi + 27)
                                fd_str = fd.strftime("%Y%m%d")
                            span_a_current.append({"date": fd_str, "value": round(float(a_v))})
                            span_b_current.append({"date": fd_str, "value": round(float(b_v))})

            data["senkou_a"] = span_a_current
            data["senkou_b"] = span_b_current

        # 후행스팬: 종가를 26봉 전에 표시
        for i in range(len(df)):
            target_idx = i - 26
            if target_idx >= 0 and target_idx < len(dates):
                data["chikou"].append({"date": dates[target_idx], "value": round(float(df["close"].iloc[i]))})

        return data

    except KiwoomMaintenanceError:
        raise HTTPException(status_code=503, detail="서버 점검 중입니다")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ─────────────────────────────────────────
# 지지 / 저항 자동 감지
# ─────────────────────────────────────────

@router.get("/{stock_code}/support-resistance")
async def get_support_resistance(
    stock_code: str,
    candle_type: str = Query(default="D"),
    order: int = Query(default=5, ge=3, le=15),
):
    """
    지지/저항 구간 자동 감지 (국내 종목 전용)
    candle_type: "D"=일봉, "W"=주봉, "1"|"5"|"60"=분봉
    order: 파동 크기 (3=작은, 5=중간, 10=큰)
    """
    try:
        if candle_type == "D":
            candles = await kiwoom.get_daily_candles(stock_code, count=200)
        elif candle_type == "W":
            candles = await kiwoom.get_weekly_candles(stock_code, count=150)
        else:
            interval = int(candle_type)
            candles = await kiwoom.get_minute_candles(stock_code, interval=interval, count=200)

        if not candles:
            raise HTTPException(status_code=404, detail="캔들 데이터 없음")

        current_price = float(candles[0].close)
        result = await detect_support_resistance(candles, current_price, order=order)

        if result is None:
            raise HTTPException(status_code=422, detail="캔들 수 부족")

        return {
            "stock_code":    stock_code,
            "current_price": current_price,
            "candle_type":   candle_type,
            "order":         order,
            **result,
        }
    except KiwoomMaintenanceError:
        raise HTTPException(status_code=503, detail="서버 점검 중입니다")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
