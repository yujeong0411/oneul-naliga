"""
기술적 지표 계산 서비스
pandas-ta 기반 RSI, MACD, BB, ADX, Stoch, CCI, ATR, ROC, MA, Mansfield RS
scipy 기반 지지/저항 자동 감지
"""
import asyncio
from datetime import datetime
from typing import Optional
import numpy as np
import pandas as pd
import pandas_ta as ta
from scipy.signal import argrelextrema

from app.models.stock import StockCandle


# ─── 신호 상수 ───────────────────────────────────────────
BUY = "buy"
SELL = "sell"
NEUTRAL = "neutral"


def _to_df(candles: list[StockCandle]) -> pd.DataFrame:
    """StockCandle 리스트 → DataFrame (시간순 오름차순)"""
    rows = [
        {"date": c.date, "open": c.open, "high": c.high,
         "low": c.low, "close": c.close, "volume": c.volume}
        for c in reversed(candles)  # candles는 최신 → 과거 순
    ]
    df = pd.DataFrame(rows)
    df["close"] = df["close"].astype(float)
    df["high"] = df["high"].astype(float)
    df["low"] = df["low"].astype(float)
    df["open"] = df["open"].astype(float)
    df["volume"] = df["volume"].astype(float)
    return df


def _indicator(name: str, key: str, value, signal: str, detail: str = "") -> dict:
    return {
        "name": name,
        "key": key,
        "value": round(float(value), 4) if value is not None else None,
        "signal": signal,
        "detail": detail,
    }


def _safe(series, idx=-1):
    try:
        v = series.iloc[idx]
        if pd.isna(v):
            return None
        return float(v)
    except Exception:
        return None


# ─── 개별 지표 계산 ─────────────────────────────────────

def _calc_rsi(df: pd.DataFrame) -> dict:
    rsi_s = ta.rsi(df["close"], length=14)
    v = _safe(rsi_s)
    if v is None:
        return _indicator("RSI(14)", "rsi", None, NEUTRAL, "데이터 부족")
    if v < 30:
        sig, detail = BUY, f"과매도 ({v:.1f})"
    elif v > 70:
        sig, detail = SELL, f"과매수 ({v:.1f})"
    else:
        sig, detail = NEUTRAL, f"중립 ({v:.1f})"
    return _indicator("RSI(14)", "rsi", v, sig, detail)


def _calc_macd(df: pd.DataFrame) -> dict:
    macd_df = ta.macd(df["close"], fast=12, slow=26, signal=9)
    if macd_df is None or macd_df.empty:
        return _indicator("MACD(12,26,9)", "macd", None, NEUTRAL, "데이터 부족")
    macd_col = [c for c in macd_df.columns if c.startswith("MACD_") and not c.startswith("MACDs_") and not c.startswith("MACDh_")]
    sig_col = [c for c in macd_df.columns if c.startswith("MACDs_")]
    if not macd_col or not sig_col:
        return _indicator("MACD(12,26,9)", "macd", None, NEUTRAL, "데이터 부족")
    macd_v = _safe(macd_df[macd_col[0]])
    sig_v = _safe(macd_df[sig_col[0]])
    if macd_v is None or sig_v is None:
        return _indicator("MACD(12,26,9)", "macd", None, NEUTRAL, "데이터 부족")
    diff = macd_v - sig_v
    if macd_v > sig_v and macd_v > 0:
        signal, detail = BUY, f"MACD 골든크로스 ({macd_v:.2f})"
    elif macd_v < sig_v and macd_v < 0:
        signal, detail = SELL, f"MACD 데드크로스 ({macd_v:.2f})"
    elif macd_v > sig_v:
        signal, detail = BUY, f"MACD 상향 ({macd_v:.2f})"
    else:
        signal, detail = NEUTRAL, f"MACD 하향 ({macd_v:.2f})"
    return _indicator("MACD(12,26,9)", "macd", macd_v, signal, detail)


def _calc_bb(df: pd.DataFrame) -> dict:
    bb_df = ta.bbands(df["close"], length=20, std=2)
    if bb_df is None or bb_df.empty:
        return _indicator("볼린저밴드(20,2)", "bb", None, NEUTRAL, "데이터 부족")
    upper_col = [c for c in bb_df.columns if "BBU" in c]
    lower_col = [c for c in bb_df.columns if "BBL" in c]
    mid_col = [c for c in bb_df.columns if "BBM" in c]
    if not upper_col or not lower_col:
        return _indicator("볼린저밴드(20,2)", "bb", None, NEUTRAL, "데이터 부족")
    upper = _safe(bb_df[upper_col[0]])
    lower = _safe(bb_df[lower_col[0]])
    mid = _safe(bb_df[mid_col[0]]) if mid_col else None
    close = _safe(df["close"])
    if close is None or upper is None or lower is None:
        return _indicator("볼린저밴드(20,2)", "bb", None, NEUTRAL, "데이터 부족")
    band_width = round((upper - lower) / mid * 100, 2) if mid else None
    if close < lower:
        signal, detail = BUY, f"하단밴드 이탈 ({close:.0f})"
    elif close > upper:
        signal, detail = SELL, f"상단밴드 돌파 ({close:.0f})"
    else:
        pct = (close - lower) / (upper - lower) * 100 if upper != lower else 50
        signal, detail = NEUTRAL, f"밴드 내 {pct:.0f}% 위치"
    return _indicator("볼린저밴드(20,2)", "bb", band_width, signal, detail)


def _calc_adx(df: pd.DataFrame) -> dict:
    adx_df = ta.adx(df["high"], df["low"], df["close"], length=14)
    if adx_df is None or adx_df.empty:
        return _indicator("ADX(14)", "adx", None, NEUTRAL, "데이터 부족")
    adx_col = [c for c in adx_df.columns if c.startswith("ADX_")]
    dmp_col = [c for c in adx_df.columns if "DMP" in c]
    dmn_col = [c for c in adx_df.columns if "DMN" in c]
    adx_v = _safe(adx_df[adx_col[0]]) if adx_col else None
    dmp_v = _safe(adx_df[dmp_col[0]]) if dmp_col else None
    dmn_v = _safe(adx_df[dmn_col[0]]) if dmn_col else None
    if adx_v is None:
        return _indicator("ADX(14)", "adx", None, NEUTRAL, "데이터 부족")
    if adx_v >= 25 and dmp_v is not None and dmn_v is not None:
        if dmp_v > dmn_v:
            signal, detail = BUY, f"강한 상승추세 (ADX {adx_v:.1f})"
        else:
            signal, detail = SELL, f"강한 하락추세 (ADX {adx_v:.1f})"
    else:
        signal, detail = NEUTRAL, f"추세 약함 (ADX {adx_v:.1f})"
    return _indicator("ADX(14)", "adx", adx_v, signal, detail)


def _calc_stoch(df: pd.DataFrame) -> dict:
    stoch_df = ta.stoch(df["high"], df["low"], df["close"], k=5, d=3, smooth_k=3)
    if stoch_df is None or stoch_df.empty:
        return _indicator("스토캐스틱(5,3,3)", "stoch", None, NEUTRAL, "데이터 부족")
    k_col = [c for c in stoch_df.columns if "STOCHk" in c]
    k_v = _safe(stoch_df[k_col[0]]) if k_col else None
    if k_v is None:
        return _indicator("스토캐스틱(5,3,3)", "stoch", None, NEUTRAL, "데이터 부족")
    if k_v < 20:
        signal, detail = BUY, f"과매도 %K={k_v:.1f}"
    elif k_v > 80:
        signal, detail = SELL, f"과매수 %K={k_v:.1f}"
    else:
        signal, detail = NEUTRAL, f"%K={k_v:.1f}"
    return _indicator("스토캐스틱(5,3,3)", "stoch", k_v, signal, detail)


def _calc_cci(df: pd.DataFrame) -> dict:
    cci_s = ta.cci(df["high"], df["low"], df["close"], length=20)
    v = _safe(cci_s)
    if v is None:
        return _indicator("CCI(20)", "cci", None, NEUTRAL, "데이터 부족")
    if v < -100:
        signal, detail = BUY, f"과매도 ({v:.1f})"
    elif v > 100:
        signal, detail = SELL, f"과매수 ({v:.1f})"
    else:
        signal, detail = NEUTRAL, f"중립 ({v:.1f})"
    return _indicator("CCI(20)", "cci", v, signal, detail)


def _calc_atr(df: pd.DataFrame) -> dict:
    atr_s = ta.atr(df["high"], df["low"], df["close"], length=14)
    v = _safe(atr_s)
    close = _safe(df["close"])
    if v is None or close is None or close == 0:
        return _indicator("ATR(14)", "atr", None, NEUTRAL, "데이터 부족")
    atr_pct = v / close * 100
    if atr_pct > 3:
        detail = f"높은 변동성 ({atr_pct:.1f}%)"
    elif atr_pct > 1.5:
        detail = f"보통 변동성 ({atr_pct:.1f}%)"
    else:
        detail = f"낮은 변동성 ({atr_pct:.1f}%)"
    return _indicator("ATR(14)", "atr", round(atr_pct, 2), NEUTRAL, detail)


def _calc_roc(df: pd.DataFrame) -> dict:
    roc_s = ta.roc(df["close"], length=12)
    v = _safe(roc_s)
    if v is None:
        return _indicator("ROC(12)", "roc", None, NEUTRAL, "데이터 부족")
    if v > 5:
        signal, detail = BUY, f"강한 상승모멘텀 ({v:.1f}%)"
    elif v > 0:
        signal, detail = BUY, f"상승모멘텀 ({v:.1f}%)"
    elif v < -5:
        signal, detail = SELL, f"강한 하락모멘텀 ({v:.1f}%)"
    else:
        signal, detail = SELL, f"하락모멘텀 ({v:.1f}%)"
    return _indicator("ROC(12)", "roc", v, signal, detail)


def _calc_ma(df: pd.DataFrame) -> list[dict]:
    """이동평균 신호 (현재가 vs MA 위치)"""
    close = _safe(df["close"])
    results = []
    for period in [5, 20, 60, 120]:
        if len(df) < period:
            results.append(_indicator(f"MA{period}", f"ma{period}", None, NEUTRAL, "데이터 부족"))
            continue
        ma_s = ta.sma(df["close"], length=period)
        ma_v = _safe(ma_s)
        if ma_v is None or close is None:
            results.append(_indicator(f"MA{period}", f"ma{period}", None, NEUTRAL, "데이터 부족"))
            continue
        pct = (close - ma_v) / ma_v * 100
        if close > ma_v:
            signal, detail = BUY, f"MA 위 (+{pct:.1f}%)"
        else:
            signal, detail = SELL, f"MA 아래 ({pct:.1f}%)"
        results.append(_indicator(f"MA{period}", f"ma{period}", ma_v, signal, detail))
    return results


def _calc_ma_cross(df: pd.DataFrame) -> dict:
    """MA5/MA20 골든크로스·데드크로스 감지 (최근 5봉 탐색)"""
    if len(df) < 25:
        return _indicator("MA크로스", "ma_cross", None, NEUTRAL, "데이터 부족")
    ma5 = ta.sma(df["close"], length=5)
    ma20 = ta.sma(df["close"], length=20)
    if ma5 is None or ma20 is None:
        return _indicator("MA크로스", "ma_cross", None, NEUTRAL, "데이터 부족")

    # 최근 5봉에서 크로스 탐지
    cross_type = None
    for i in range(-1, -6, -1):
        try:
            prev_diff = ma5.iloc[i - 1] - ma20.iloc[i - 1]
            curr_diff = ma5.iloc[i] - ma20.iloc[i]
            if pd.isna(prev_diff) or pd.isna(curr_diff):
                continue
            if prev_diff < 0 and curr_diff >= 0:
                cross_type = "golden"
                break
            elif prev_diff > 0 and curr_diff <= 0:
                cross_type = "dead"
                break
        except Exception:
            continue

    curr_ma5 = _safe(ma5)
    curr_ma20 = _safe(ma20)
    if cross_type == "golden":
        return _indicator("MA크로스", "ma_cross", curr_ma5, BUY, "골든크로스 발생")
    elif cross_type == "dead":
        return _indicator("MA크로스", "ma_cross", curr_ma5, SELL, "데드크로스 발생")
    else:
        if curr_ma5 is not None and curr_ma20 is not None:
            if curr_ma5 > curr_ma20:
                return _indicator("MA크로스", "ma_cross", curr_ma5, BUY, "MA5 > MA20 유지")
            else:
                return _indicator("MA크로스", "ma_cross", curr_ma5, SELL, "MA5 < MA20 유지")
        return _indicator("MA크로스", "ma_cross", None, NEUTRAL, "판단 불가")


def _calc_ichimoku(df: pd.DataFrame) -> dict:
    """일목균형표 (Ichimoku Cloud) 계산"""
    if len(df) < 52:
        return _indicator("일목균형표", "ichimoku", None, NEUTRAL, "데이터 부족 (최소 52봉 필요)")

    ichi = df.ta.ichimoku(tenkan=9, kijun=26, senkou=52, append=False)
    if ichi is None or (isinstance(ichi, tuple) and ichi[0] is None):
        return _indicator("일목균형표", "ichimoku", None, NEUTRAL, "계산 실패")

    # pandas-ta ichimoku returns (df_ichi, df_span_future)
    ichi_df = ichi[0] if isinstance(ichi, tuple) else ichi
    span_df = ichi[1] if isinstance(ichi, tuple) and len(ichi) > 1 else None

    # pandas-ta 표준 컬럼명: ITS_9, IKS_26, ISA_9, ISB_26
    tenkan_cols = [c for c in ichi_df.columns if c.startswith("ITS_")]
    kijun_cols = [c for c in ichi_df.columns if c.startswith("IKS_")]
    span_a_cols = [c for c in ichi_df.columns if c.startswith("ISA_")]
    span_b_cols = [c for c in ichi_df.columns if c.startswith("ISB_")]

    tenkan_v = _safe(ichi_df[tenkan_cols[0]]) if tenkan_cols else None
    kijun_v = _safe(ichi_df[kijun_cols[0]]) if kijun_cols else None

    # 선행스팬: 현재 시점 기준 (ichi_df에 있는 값)
    senkou_a = _safe(ichi_df[span_a_cols[0]]) if span_a_cols else None
    senkou_b = _safe(ichi_df[span_b_cols[0]]) if span_b_cols else None

    close = _safe(df["close"])
    chikou = close  # 후행스팬 = 현재 종가 (26일 전으로 표시)

    if any(v is None for v in [tenkan_v, kijun_v, senkou_a, senkou_b, close]):
        return _indicator("일목균형표", "ichimoku", None, NEUTRAL, "데이터 부족")

    # 구름 색상 판정
    cloud_color = "green" if senkou_a > senkou_b else "red"

    # 현재가 vs 구름대
    cloud_top = max(senkou_a, senkou_b)
    cloud_bottom = min(senkou_a, senkou_b)
    if close > cloud_top:
        price_vs_cloud = "above"
    elif close < cloud_bottom:
        price_vs_cloud = "below"
    else:
        price_vs_cloud = "inside"

    # 신호 판정
    if price_vs_cloud == "above" and tenkan_v > kijun_v:
        signal = BUY
        detail = "구름 위 + 전환선 > 기준선"
    elif price_vs_cloud == "below" and tenkan_v < kijun_v:
        signal = SELL
        detail = "구름 아래 + 전환선 < 기준선"
    else:
        signal = NEUTRAL
        pos_label = {"above": "위", "inside": "안", "below": "아래"}[price_vs_cloud]
        detail = f"구름 {pos_label}"

    cloud_thickness = abs(senkou_a - senkou_b)

    result = _indicator("일목균형표", "ichimoku", tenkan_v, signal, detail)
    result["ichimoku"] = {
        "tenkan": round(tenkan_v),
        "kijun": round(kijun_v),
        "senkou_a": round(senkou_a),
        "senkou_b": round(senkou_b),
        "chikou": round(chikou),
        "cloud_color": cloud_color,
        "price_vs_cloud": price_vs_cloud,
        "cloud_thickness": round(cloud_thickness),
        "signal": signal,
    }
    return result


def _calc_mansfield_rs(
    df: pd.DataFrame,
    benchmark_df: Optional[pd.DataFrame],
) -> dict:
    """Mansfield RS = (stock/stockMA252) / (bench/benchMA252) - 1"""
    if benchmark_df is None or len(df) < 30 or len(benchmark_df) < 30:
        return _indicator("Mansfield RS", "mansfield_rs", None, NEUTRAL, "데이터 부족")

    # 두 시리즈 날짜 정렬 (날짜 기준 merge)
    stock_s = df[["date", "close"]].rename(columns={"close": "stock"})
    bench_s = benchmark_df[["date", "close"]].rename(columns={"close": "bench"})
    merged = pd.merge(stock_s, bench_s, on="date", how="inner")
    if len(merged) < 30:
        return _indicator("Mansfield RS", "mansfield_rs", None, NEUTRAL, "기준일 불일치")

    length = min(252, len(merged))
    stock_ma = merged["stock"].rolling(length).mean()
    bench_ma = merged["bench"].rolling(length).mean()

    last_stock = merged["stock"].iloc[-1]
    last_bench = merged["bench"].iloc[-1]
    last_stock_ma = stock_ma.iloc[-1]
    last_bench_ma = bench_ma.iloc[-1]

    if any(pd.isna(v) or v == 0 for v in [last_stock, last_bench, last_stock_ma, last_bench_ma]):
        return _indicator("Mansfield RS", "mansfield_rs", None, NEUTRAL, "데이터 부족")

    rs = (last_stock / last_stock_ma) / (last_bench / last_bench_ma) - 1
    rs_pct = rs * 100
    if rs_pct > 0:
        signal, detail = BUY, f"KOSPI 대비 강세 (+{rs_pct:.1f}%)"
    else:
        signal, detail = SELL, f"KOSPI 대비 약세 ({rs_pct:.1f}%)"
    return _indicator("Mansfield RS", "mansfield_rs", round(rs_pct, 2), signal, detail)


# ─── 신호 집계 ────────────────────────────────────────────

def _score(indicators: list[dict]) -> int:
    """0~100 점수: buy=+1, sell=-1, neutral=0 → 정규화"""
    valid = [i for i in indicators if i["signal"] != NEUTRAL or i["value"] is not None]
    if not valid:
        return 50
    votes = sum(1 if i["signal"] == BUY else -1 if i["signal"] == SELL else 0 for i in valid)
    total = len(valid)
    return round((votes / total + 1) / 2 * 100)


def _summary(all_indicators: list[dict]) -> dict:
    buy = sum(1 for i in all_indicators if i["signal"] == BUY)
    sell = sum(1 for i in all_indicators if i["signal"] == SELL)
    neutral = sum(1 for i in all_indicators if i["signal"] == NEUTRAL)
    score = _score(all_indicators)
    return {"score": score, "buy": buy, "neutral": neutral, "sell": sell}


# ─── 메인 계산 함수 ───────────────────────────────────────

def _calculate_sync(
    candles: list[StockCandle],
    benchmark_candles: Optional[list[StockCandle]] = None,
) -> dict:
    df = _to_df(candles)
    bench_df = _to_df(benchmark_candles) if benchmark_candles else None

    rsi = _calc_rsi(df)
    macd = _calc_macd(df)
    bb = _calc_bb(df)
    adx = _calc_adx(df)
    stoch = _calc_stoch(df)
    cci = _calc_cci(df)
    atr = _calc_atr(df)
    roc = _calc_roc(df)
    ma_list = _calc_ma(df)
    ma_cross = _calc_ma_cross(df)
    mansfield = _calc_mansfield_rs(df, bench_df)
    ichimoku = _calc_ichimoku(df)

    # 카테고리 분류
    trend_indicators = [ma_cross, adx, macd, ichimoku] + ma_list
    momentum_indicators = [rsi, stoch, cci, roc]
    volatility_indicators = [bb, atr]
    rs_indicators = [mansfield]

    all_indicators = trend_indicators + momentum_indicators + volatility_indicators + rs_indicators

    def cat_info(indicators: list[dict]) -> dict:
        buy = sum(1 for i in indicators if i["signal"] == BUY)
        sell = sum(1 for i in indicators if i["signal"] == SELL)
        neutral = sum(1 for i in indicators if i["signal"] == NEUTRAL)
        if buy > sell:
            cat_signal = BUY
        elif sell > buy:
            cat_signal = SELL
        else:
            cat_signal = NEUTRAL
        return {
            "signal": cat_signal,
            "buy": buy, "neutral": neutral, "sell": sell,
            "indicators": indicators,
        }

    return {
        "timestamp": datetime.now().isoformat(),
        "signal_summary": _summary(all_indicators),
        "categories": {
            "trend": cat_info(trend_indicators),
            "momentum": cat_info(momentum_indicators),
            "volatility": cat_info(volatility_indicators),
            "relative_strength": cat_info(rs_indicators),
        },
    }


async def calculate_indicators(
    candles: list[StockCandle],
    benchmark_candles: Optional[list[StockCandle]] = None,
) -> dict:
    """비동기 래퍼 — pandas 계산을 스레드풀에서 실행"""
    return await asyncio.to_thread(_calculate_sync, candles, benchmark_candles)


# ─── 지지/저항 자동 감지 ──────────────────────────────────

def _detect_sr_sync(
    candles: list[StockCandle],
    current_price: float,
    order: int = 5,
    cluster_pct: float = 0.5,
) -> dict | None:
    """scipy argrelextrema 기반 지지/저항 클러스터 탐지 (동기)"""
    # candles: 최신→과거 순, 알고리즘용으로 과거→최신 순 변환
    asc = list(reversed(candles))
    n = len(asc)

    if n < order * 2 + 1:
        return None  # 캔들 수 부족

    highs = np.array([c.high for c in asc], dtype=float)
    lows  = np.array([c.low  for c in asc], dtype=float)

    peak_idx   = argrelextrema(highs, np.greater, order=order)[0]
    valley_idx = argrelextrema(lows,  np.less,    order=order)[0]

    # (price, candles_from_last) 수집
    points: list[tuple[float, int]] = []
    for i in peak_idx:
        points.append((float(highs[i]), n - 1 - i))
    for i in valley_idx:
        points.append((float(lows[i]),  n - 1 - i))

    if not points:
        return {"resistances": [], "supports": []}

    # 가격 오름차순 정렬 후 클러스터링
    points.sort(key=lambda x: x[0])
    clusters: list[list[tuple[float, int]]] = []
    cur = [points[0]]
    for pt in points[1:]:
        if abs(pt[0] - cur[0][0]) / cur[0][0] * 100 <= cluster_pct:
            cur.append(pt)
        else:
            clusters.append(cur)
            cur = [pt]
    clusters.append(cur)

    result = []
    for cl in clusters:
        prices     = [p[0] for p in cl]
        days_list  = sorted(p[1] for p in cl)
        avg_price  = sum(prices) / len(prices)
        touch      = len(cl)
        strength   = "강한" if touch >= 3 else "보통" if touch == 2 else "약한"
        formed_at  = [f"{d}거래일 전" for d in days_list]
        dist_pct   = round((avg_price - current_price) / current_price * 100, 1)
        result.append({
            "price":        round(avg_price),
            "touch_count":  touch,
            "distance_pct": dist_pct,
            "strength":     strength,
            "formed_at":    formed_at,
        })

    resistances = sorted(
        [r for r in result if r["price"] > current_price],
        key=lambda x: x["price"],
    )[:5]

    supports = sorted(
        [r for r in result if r["price"] < current_price],
        key=lambda x: x["price"],
        reverse=True,
    )[:5]

    return {"resistances": resistances, "supports": supports}


async def detect_support_resistance(
    candles: list[StockCandle],
    current_price: float,
    order: int = 5,
    cluster_pct: float = 0.5,
) -> dict | None:
    """비동기 래퍼"""
    return await asyncio.to_thread(
        _detect_sr_sync, candles, current_price, order, cluster_pct
    )
