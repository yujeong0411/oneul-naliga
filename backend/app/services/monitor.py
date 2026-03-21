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


# ─────────────────────────────────────────
# 공통: 선 vs 현재가 비교 → 알림
# ─────────────────────────────────────────

async def check_and_alert(line: dict, current_price: float) -> None:
    """민감도 범위 진입 시 텔레그램 알림 + DB 저장. 중복 방지 포함."""
    if line["line_type"] == "trend":
        target = line["slope"] * time.time() + line["intercept"]
    else:
        target = line["price"]

    diff_pct = abs(current_price - target) / target * 100
    if diff_pct > line.get("sensitivity", 0.5):
        return

    db = get_supabase()

    # 중복 방지: 최근 1시간 내 동일 선 알림 있으면 스킵
    one_hour_ago = (datetime.now(KST) - timedelta(hours=1)).isoformat()
    recent = (
        db.table("alerts")
        .select("id")
        .eq("line_id", line["id"])
        .gte("created_at", one_hour_ago)
        .execute()
        .data
    )
    if recent:
        return

    signal_label = "저항선" if line.get("signal_type") == "attack" else "지지선"
    stock_code = line["stock_code"]
    is_domestic = stock_code.isdigit() and len(stock_code) == 6
    price_fmt = f"{current_price:,.0f}원" if is_domestic else f"${current_price:,.2f}"

    user_id = line.get("user_id")
    await push.broadcast(
        user_id=user_id,
        title=f"[{stock_code}] {signal_label} 도달",
        body=f"현재가 {price_fmt} · 거리 {diff_pct:.2f}%",
        data={"stock_code": stock_code, "signal_type": line.get("signal_type")},
    )

    db.table("alerts").insert({
        "stock_code":    stock_code,
        "line_id":       line["id"],
        "signal_type":   line["signal_type"],
        "current_price": current_price,
        "target_price":  target,
        "distance_pct":  diff_pct,
        "user_id":       user_id,
    }).execute()


# ─────────────────────────────────────────
# ① 실시간 감시 — WebSocket (분봉 선)
# ─────────────────────────────────────────

async def realtime_monitor() -> None:
    """
    분봉 선이 있는 종목을 키움 WebSocket으로 감시.
    구독 종목이 없으면 30초마다 재확인.
    """
    while True:
        db = get_supabase()
        rows = (
            db.table("lines")
            .select("stock_code")
            .in_("timeframe", list(REALTIME_TIMEFRAMES))
            .eq("is_active", True)
            .execute()
            .data
        )
        codes = list({r["stock_code"] for r in rows})

        if not codes:
            print("[realtime_monitor] 분봉 선 없음. 30초 후 재확인")
            await asyncio.sleep(30)
            continue

        async def on_price(stock_code: str, price: float, change_pct: str = "0.00"):
            lines = (
                db.table("lines")
                .select("*")
                .eq("stock_code", stock_code)
                .in_("timeframe", list(REALTIME_TIMEFRAMES))
                .eq("is_active", True)
                .execute()
                .data
            )
            for line in lines:
                try:
                    await check_and_alert(line, price)
                except Exception as e:
                    print(f"[realtime_monitor] check 오류 {stock_code}: {e}")

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

        db = get_supabase()
        lines = (
            db.table("lines")
            .select("*")
            .in_("timeframe", list(DAILY_TIMEFRAMES))
            .eq("is_active", True)
            .execute()
            .data
        )

        for line in lines:
            code = line["stock_code"]
            try:
                if code.isdigit() and len(code) == 6:
                    result = await kiwoom.get_current_price(code)
                else:
                    result = await kis.get_current_price(code)
                await check_and_alert(line, result["price"])
            except Exception as e:
                print(f"[daily_monitor] {code} 오류: {e}")

        print(f"[daily_monitor] 완료. 감시 선: {len(lines)}개")
