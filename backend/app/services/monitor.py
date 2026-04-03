"""
24시간 가격 감시 서비스

① realtime_monitor  — 분봉 선: 키움 WebSocket 푸시 수신 → 즉시 감지
② daily_monitor     — 일봉/주봉/월봉/년봉 선: 장 마감 후(15:30 KST) REST 1회

REST API 폴링 절대 사용 금지 (키움 속도 제한 초과)
"""
import asyncio
import time
from datetime import datetime, timedelta

import pytz

from app.database import get_supabase
from app.services import kiwoom, kis, push
from app.services.kiwoom_ws import stream_prices

KST = pytz.timezone("Asia/Seoul")

REALTIME_TIMEFRAMES = {"1분", "3분", "5분", "10분", "15분", "30분", "60분"}
DAILY_TIMEFRAMES    = {"일봉", "주봉", "월봉", "년봉"}

# 봉타입별 N캔들 기준 (터치 후 결과 판정용)
N_CANDLES = {
    "월봉": 3, "주봉": 4, "일봉": 5,
    "60분": 6, "30분": 8, "15분": 8, "10분": 10,
    "5분": 12, "3분": 20, "1분": 30,
}

# 터치 중복 방지 간격 (봉타입별, 초 단위)
TOUCH_DEDUP_SECONDS = {
    "월봉": 86400 * 7, "주봉": 86400, "일봉": 3600 * 4,
    "60분": 3600, "30분": 1800, "15분": 900, "10분": 600,
    "5분": 300, "3분": 180, "1분": 60,
}

# ─────────────────────────────────────────
# lines 캐시 (DB 쿼리 최소화)
# ─────────────────────────────────────────
_lines_cache: list[dict] = []
_lines_cache_updated: float = 0.0
_LINES_CACHE_TTL = 30  # 30초마다 갱신


def _refresh_lines_cache_sync():
    global _lines_cache, _lines_cache_updated
    try:
        db = get_supabase()
        rows = db.table("lines").select("*").eq("is_active", True).execute().data
        _lines_cache = rows or []
        _lines_cache_updated = time.time()
    except Exception as e:
        print(f"[monitor] lines 캐시 갱신 실패: {e}")


async def _refresh_lines_cache():
    await asyncio.to_thread(_refresh_lines_cache_sync)


def get_cached_lines() -> list[dict]:
    """동기 호출용 (캐시 히트 시 블로킹 없음)"""
    return _lines_cache


async def ensure_lines_cache():
    """async 호출용 — 캐시 만료 시 갱신"""
    if time.time() - _lines_cache_updated > _LINES_CACHE_TTL:
        await _refresh_lines_cache()


def invalidate_lines_cache():
    global _lines_cache_updated
    _lines_cache_updated = 0.0


# ─────────────────────────────────────────
# 20캔들 평균 거래량 계산
# ─────────────────────────────────────────

async def _calc_volume_avg_20(line: dict) -> int:
    """터치 시점에 최근 20캔들 평균 거래량 계산"""
    try:
        code = line["stock_code"]
        timeframe = line.get("timeframe", "일봉")
        is_domestic = code.isdigit() and len(code) == 6

        if timeframe == "일봉":
            candles = await (kiwoom.get_daily_candles(code, count=20) if is_domestic
                           else kis.get_daily_candles(code, count=20))
        elif timeframe == "주봉":
            candles = await (kiwoom.get_weekly_candles(code, count=20) if is_domestic
                           else kis.get_weekly_candles(code, count=20))
        elif timeframe == "월봉":
            candles = await (kiwoom.get_monthly_candles(code, count=20) if is_domestic
                           else kis.get_monthly_candles(code, count=20))
        else:
            # 분봉
            interval = int(timeframe.replace("분", ""))
            candles = await (kiwoom.get_minute_candles(code, interval=interval, count=20) if is_domestic
                           else kis.get_minute_candles(code, interval=interval, count=20))

        if not candles:
            return 0
        total = sum(c.volume for c in candles)
        return total // len(candles)
    except Exception as e:
        print(f"[monitor] volume_avg_20 계산 실패: {e}")
        return 0


# ─────────────────────────────────────────
# 공통: 선 vs 현재가 비교 → 알림
# ─────────────────────────────────────────

async def check_and_alert(line: dict, current_price: float, volume: int = 0) -> None:
    """민감도 범위 진입 시 터치 기록 + 알림 + DB 저장."""
    if line["line_type"] == "trend":
        target = line["slope"] * time.time() + line["intercept"]
    else:
        target = line["price"]

    diff_pct = abs(current_price - target) / target * 100
    if diff_pct > line.get("sensitivity", 0.5):
        return

    db = get_supabase()

    # ── touch_events 기록 (알림 dedup과 별개) ──
    timeframe = line.get("timeframe", "일봉")
    dedup_sec = TOUCH_DEDUP_SECONDS.get(timeframe, 3600)
    touch_cutoff = (datetime.now(KST) - timedelta(seconds=dedup_sec)).isoformat()
    recent_touch = await asyncio.to_thread(
        lambda: db.table("touch_events")
        .select("id")
        .eq("line_id", line["id"])
        .gte("touched_at", touch_cutoff)
        .limit(1)
        .execute()
        .data
    )
    if not recent_touch:
        # 20캔들 평균 거래량 계산
        vol_avg_20 = await _calc_volume_avg_20(line)
        n_candles = N_CANDLES.get(timeframe, 5)
        try:
            await asyncio.to_thread(lambda: db.table("touch_events").insert({
                "line_id":         line["id"],
                "stock_code":      line["stock_code"],
                "user_id":         line.get("user_id"),
                "price_at_touch":  current_price,
                "volume_at_touch": volume,
                "volume_avg_20":   vol_avg_20,
                "result":          "pending",
                "n_candles":       n_candles,
            }).execute())
        except Exception as e:
            print(f"[monitor] touch_events 기록 실패: {e}")

    # ── 알림 중복 방지: 최근 1시간 내 동일 선 알림 있으면 스킵 ──
    one_hour_ago = (datetime.now(KST) - timedelta(hours=1)).isoformat()
    recent = await asyncio.to_thread(
        lambda: db.table("alerts").select("id").eq("line_id", line["id"]).gte("created_at", one_hour_ago).execute().data
    )
    if recent:
        return

    stock_code = line["stock_code"]
    is_domestic = stock_code.isdigit() and len(stock_code) == 6
    price_fmt = f"{current_price:,.0f}원" if is_domestic else f"${current_price:,.2f}"

    intent = line.get("intent") or "watch"
    intent_labels = {"buy": "매수 타점", "sell": "매도 타점", "stop": "손절 라인", "watch": "감시 가격"}
    intent_label = intent_labels.get(intent, "감시 가격")

    user_id = line.get("user_id")
    await push.broadcast(
        user_id=user_id,
        title=f"[{stock_code}] {intent_label} 도달",
        body=f"현재가 {price_fmt} · 거리 {diff_pct:.2f}%",
        data={"stock_code": stock_code, "intent": intent},
    )

    await asyncio.to_thread(lambda: db.table("alerts").insert({
        "stock_code":    stock_code,
        "line_id":       line["id"],
        "signal_type":   line["signal_type"],
        "intent":        intent,
        "current_price": current_price,
        "target_price":  target,
        "distance_pct":  diff_pct,
        "user_id":       user_id,
    }).execute())


# ─────────────────────────────────────────
# 포지션 tp/sl 감시
# ─────────────────────────────────────────

_position_cache: list[dict] = []
_position_cache_updated: float = 0.0
_POSITION_CACHE_TTL = 30


def _refresh_positions_sync():
    global _position_cache, _position_cache_updated
    try:
        db = get_supabase()
        rows = db.table("positions").select(
            "*, position_lines(role, line:line_id(id, price, line_type, slope, intercept))"
        ).eq("status", "open").execute().data
        _position_cache = rows or []
        _position_cache_updated = time.time()
    except Exception as e:
        print(f"[monitor] positions 캐시 갱신 실패: {e}")


def get_cached_positions() -> list[dict]:
    return _position_cache


async def ensure_positions_cache():
    if time.time() - _position_cache_updated > _POSITION_CACHE_TTL:
        await asyncio.to_thread(_refresh_positions_sync)


def invalidate_position_cache():
    global _position_cache_updated
    _position_cache_updated = 0.0


async def check_position_tp_sl(stock_code: str, current_price: float) -> None:
    """포지션의 목표가/손절가 도달 감시 (다중 선 지원)"""
    await ensure_positions_cache()
    positions = [p for p in get_cached_positions() if p["stock_code"] == stock_code]
    if not positions:
        return

    db = get_supabase()
    is_domestic = stock_code.isdigit() and len(stock_code) == 6

    for pos in positions:
        user_id = pos.get("user_id")
        price_fmt = f"{current_price:,.0f}원" if is_domestic else f"${current_price:,.2f}"
        pls = pos.get("position_lines") or []

        # 목표가 수집: 수동 입력 + 연결된 tp 선 가격
        tp_prices = []
        if pos.get("tp_price"):
            tp_prices.append(pos["tp_price"])
        for pl in pls:
            if pl["role"] == "tp" and pl.get("line") and pl["line"].get("price"):
                tp_prices.append(pl["line"]["price"])

        # 손절가 수집: 수동 입력 + 연결된 sl 선 가격
        sl_prices = []
        if pos.get("sl_price"):
            sl_prices.append(pos["sl_price"])
        for pl in pls:
            if pl["role"] == "sl" and pl.get("line") and pl["line"].get("price"):
                sl_prices.append(pl["line"]["price"])

        # 가장 가까운 목표가부터 체크 (낮은 순)
        hit_tp = None
        for tp in sorted(tp_prices):
            if current_price >= tp:
                hit_tp = tp
                break

        if hit_tp:
            tp_fmt = f"{hit_tp:,.0f}원" if is_domestic else f"${hit_tp:,.2f}"
            await asyncio.to_thread(lambda p=pos: db.table("positions").update({"status": "tp_hit"}).eq("id", p["id"]).execute())
            invalidate_position_cache()
            await push.broadcast(
                user_id=user_id,
                title=f"[{stock_code}] 목표가 도달",
                body=f"현재가 {price_fmt} · 목표가 {tp_fmt}",
                data={"stock_code": stock_code, "signal_type": "tp_hit"},
            )
            continue

        # 가장 가까운 손절가부터 체크 (높은 순)
        hit_sl = None
        for sl in sorted(sl_prices, reverse=True):
            if current_price <= sl:
                hit_sl = sl
                break

        if hit_sl:
            sl_fmt = f"{hit_sl:,.0f}원" if is_domestic else f"${hit_sl:,.2f}"
            await asyncio.to_thread(lambda p=pos: db.table("positions").update({"status": "sl_hit"}).eq("id", p["id"]).execute())
            invalidate_position_cache()
            await push.broadcast(
                user_id=user_id,
                title=f"[{stock_code}] 손절가 도달",
                body=f"현재가 {price_fmt} · 손절가 {sl_fmt}",
                data={"stock_code": stock_code, "signal_type": "sl_hit"},
            )


# ─────────────────────────────────────────
# ① 실시간 감시 — WebSocket (분봉 선)
# ─────────────────────────────────────────

async def realtime_monitor() -> None:
    """
    분봉 선이 있는 종목을 키움 WebSocket으로 감시.
    구독 종목이 없으면 30초마다 재확인.
    """
    while True:
        await ensure_lines_cache()
        all_lines = get_cached_lines()
        rt_lines = [l for l in all_lines if l.get("timeframe") in REALTIME_TIMEFRAMES]
        codes = list({l["stock_code"] for l in rt_lines})

        if not codes:
            print("[realtime_monitor] 분봉 선 없음. 30초 후 재확인")
            await asyncio.sleep(30)
            continue

        async def on_price(stock_code: str, price: float, change_pct: str = "0.00", volume: int = 0, **kwargs):
            # 선 터치 알림
            await ensure_lines_cache()
            lines = [
                l for l in get_cached_lines()
                if l["stock_code"] == stock_code
                and l.get("timeframe") in REALTIME_TIMEFRAMES
                and l.get("is_active")
            ]
            for line in lines:
                try:
                    await check_and_alert(line, price, volume=volume)
                except Exception as e:
                    print(f"[realtime_monitor] check 오류 {stock_code}: {e}")
            # 포지션 tp/sl 알림
            try:
                await check_position_tp_sl(stock_code, price)
            except Exception as e:
                print(f"[realtime_monitor] position check 오류 {stock_code}: {e}")

        # stream_prices 내부에서 재연결 처리
        await stream_prices(codes, on_price)


# ─────────────────────────────────────────
# ② 일봉/주봉/월봉 감시 — 장 마감 후 REST 1회
# ─────────────────────────────────────────

async def daily_monitor() -> None:
    """
    매 1분 시각 체크 → 15:30 KST에 일봉/주봉/월봉 선 REST 1회 체크.
    하루 1번만 실행.
    """
    last_run_date: str | None = None

    while True:
        await asyncio.sleep(60)

        now   = datetime.now(KST)
        today = now.strftime("%Y-%m-%d")

        if not (now.hour == 15 and now.minute >= 30):
            continue
        if last_run_date == today:
            continue

        last_run_date = today
        print(f"[daily_monitor] 장 마감 감시 시작 ({today})")

        await ensure_lines_cache()
        all_lines = get_cached_lines()
        lines = [l for l in all_lines if l.get("timeframe") in DAILY_TIMEFRAMES]

        checked_codes = set()
        for line in lines:
            code = line["stock_code"]
            try:
                if code.isdigit() and len(code) == 6:
                    result = await kiwoom.get_current_price(code)
                else:
                    result = await kis.get_current_price(code)
                await check_and_alert(line, result["price"], volume=result.get("volume", 0))
                # 포지션 tp/sl (종목당 1회만)
                if code not in checked_codes:
                    checked_codes.add(code)
                    await check_position_tp_sl(code, result["price"])
            except Exception as e:
                print(f"[daily_monitor] {code} 오류: {e}")

        print(f"[daily_monitor] 완료. 감시 선: {len(lines)}개")


# ─────────────────────────────────────────
# ③ 터치 결과 판정 — N캔들 후 반등/돌파/중립
# ─────────────────────────────────────────

# 봉타입별 판정 체크 간격 (초) — 너무 자주 체크하지 않도록
_JUDGE_INTERVAL = {
    "월봉": 86400, "주봉": 86400, "일봉": 3600,
    "60분": 600, "30분": 300, "15분": 180, "10분": 120,
    "5분": 60, "3분": 60, "1분": 30,
}

# 봉타입 → 캔들 간격 (분 단위, 분봉용)
_TIMEFRAME_MINUTES = {
    "1분": 1, "3분": 3, "5분": 5, "10분": 10,
    "15분": 15, "30분": 30, "60분": 60,
}


def _estimate_elapsed_candles(touched_at_str: str, timeframe: str) -> int:
    """터치 시점부터 현재까지 경과한 캔들 수 추정"""
    try:
        touched_at = datetime.fromisoformat(touched_at_str.replace("Z", "+00:00"))
        now = datetime.now(KST)
        if touched_at.tzinfo is None:
            touched_at = KST.localize(touched_at)
        elapsed_sec = (now - touched_at).total_seconds()

        if timeframe == "월봉":
            return int(elapsed_sec / (86400 * 30))
        elif timeframe == "주봉":
            return int(elapsed_sec / (86400 * 7))
        elif timeframe == "일봉":
            return int(elapsed_sec / 86400)
        elif timeframe in _TIMEFRAME_MINUTES:
            return int(elapsed_sec / (_TIMEFRAME_MINUTES[timeframe] * 60))
        return 0
    except Exception:
        return 0


async def _get_close_after_n(touch: dict, line: dict) -> float | None:
    """터치 후 N캔들째 종가를 가져옴. 아직 N캔들이 안 지났으면 None."""
    timeframe = line.get("timeframe", "일봉")
    n = touch.get("n_candles") or N_CANDLES.get(timeframe, 5)

    elapsed = _estimate_elapsed_candles(touch["touched_at"], timeframe)
    if elapsed < n:
        return None  # 아직 N캔들이 안 지남

    code = line["stock_code"]
    is_domestic = code.isdigit() and len(code) == 6

    try:
        # N+5캔들 정도 가져와서 터치 시점 이후 N번째 캔들 종가 확인
        fetch_count = n + 10

        if timeframe == "일봉":
            candles = await (kiwoom.get_daily_candles(code, count=fetch_count) if is_domestic
                           else kis.get_daily_candles(code, count=fetch_count))
        elif timeframe == "주봉":
            candles = await (kiwoom.get_weekly_candles(code, count=fetch_count) if is_domestic
                           else kis.get_weekly_candles(code, count=fetch_count))
        elif timeframe == "월봉":
            candles = await (kiwoom.get_monthly_candles(code, count=fetch_count) if is_domestic
                           else kis.get_monthly_candles(code, count=fetch_count))
        else:
            interval = int(timeframe.replace("분", ""))
            candles = await (kiwoom.get_minute_candles(code, interval=interval, count=fetch_count) if is_domestic
                           else kis.get_minute_candles(code, interval=interval, count=fetch_count))

        if not candles:
            return None

        # 캔들은 최신순(내림차순)으로 옴 → 뒤집어서 오래된순으로
        asc = list(reversed(candles))

        # 터치 시점 이후 N번째 캔들 찾기
        touched_at = datetime.fromisoformat(touch["touched_at"].replace("Z", "+00:00"))
        if touched_at.tzinfo is None:
            touched_at = KST.localize(touched_at)
        touch_ts = touched_at.timestamp()

        # 터치 이후 캔들만 필터
        after_touch = []
        for c in asc:
            # StockCandle.date는 "20250325" 또는 "20250325093000" 형식
            date_str = c.date
            if len(date_str) >= 12:
                # 분봉: YYYYMMDDHHmmss
                dt = datetime(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
                             int(date_str[8:10]), int(date_str[10:12]))
                dt = KST.localize(dt)
            else:
                # 일봉 이상: YYYYMMDD
                dt = datetime(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))
                dt = KST.localize(dt)
            if dt.timestamp() > touch_ts:
                after_touch.append(c)

        if len(after_touch) >= n:
            return after_touch[n - 1].close  # N번째 캔들 종가
        return None

    except Exception as e:
        print(f"[touch_judge] 캔들 조회 실패 {code}: {type(e).__name__}: {e}")
        return None


async def touch_result_judge() -> None:
    """
    pending 상태의 터치 이벤트를 주기적으로 확인하고,
    N캔들이 지났으면 반등/돌파/중립을 판정.
    """
    # 시작 시 잠시 대기 (서버 초기화 완료 후)
    await asyncio.sleep(10)

    while True:
        try:
            db = get_supabase()
            pending = await asyncio.to_thread(
                lambda: db.table("touch_events").select("*, lines:line_id(*)").eq("result", "pending").limit(50).execute().data
            )

            if not pending:
                await asyncio.sleep(60)
                continue

            for touch in pending:
                line = touch.get("lines")
                if not line:
                    await asyncio.to_thread(lambda t=touch: db.table("touch_events").update({"result": "neutral", "judged_at": datetime.now(KST).isoformat()}).eq("id", t["id"]).execute())
                    continue

                close_price = await _get_close_after_n(touch, line)
                if close_price is None:
                    continue  # 아직 N캔들 안 지남

                price_at_touch = touch["price_at_touch"]
                line_type = line.get("line_type", "horizontal")

                if line_type == "trend":
                    # 추세선: N캔들 후 시점의 추세선 가격과 종가 비교
                    slope = line.get("slope", 0) or 0
                    intercept = line.get("intercept", 0) or 0
                    n = touch.get("n_candles") or N_CANDLES.get(line.get("timeframe", "일봉"), 5)
                    # N캔들 후 시점의 추세선 가격 추정
                    touched_at = datetime.fromisoformat(touch["touched_at"].replace("Z", "+00:00"))
                    if touched_at.tzinfo is None:
                        touched_at = KST.localize(touched_at)
                    # 현재 시각의 추세선 가격
                    trend_price_now = slope * time.time() + intercept
                    pct_move = (close_price - price_at_touch) / price_at_touch * 100

                    if close_price > trend_price_now:
                        result = "maintain"
                    else:
                        result = "break"
                else:
                    # 수평선: 터치 가격 대비 종가 변화율
                    pct_move = (close_price - price_at_touch) / price_at_touch * 100

                    if pct_move >= 1.0:
                        result = "bounce"
                    elif pct_move <= -1.0:
                        result = "break"
                    else:
                        result = "neutral"

                await asyncio.to_thread(lambda t=touch, r=result, p=pct_move, c=close_price: db.table("touch_events").update({
                    "peak_after_touch": c,
                    "pct_move": round(p, 4),
                    "result": r,
                    "judged_at": datetime.now(KST).isoformat(),
                }).eq("id", t["id"]).execute())

                print(f"[touch_judge] {touch['stock_code']} line={touch['line_id'][:8]}.. → {result} ({pct_move:+.2f}%)")

        except Exception as e:
            print(f"[touch_judge] 오류: {e}")

        await asyncio.sleep(60)  # 1분마다 체크
