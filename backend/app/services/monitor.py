"""
24시간 가격 감시 서비스
- APScheduler로 주기적으로 현재가 조회
- 설정된 선(수평선/추세선)에 닿으면 텔레그램 알림
"""
from app.services import kiwoom, kis, telegram
from app.database import get_supabase

TOLERANCE = 0.003  # 0.3% 오차 허용


async def check_alerts() -> None:
    """DB에 저장된 모든 알림 라인과 현재가 비교"""
    db = get_supabase()

    # 수평선 알림 조회
    lines = db.table("horizontal_lines").select("*").execute().data

    for line in lines:
        symbol = line["symbol"]
        market = line["market"]
        target_price = line["price"]

        try:
            if market in ("KOSPI", "KOSDAQ"):
                current = await kiwoom.get_current_price(symbol)
            else:
                current = await kis.get_current_price(symbol)

            # 현재가가 목표가의 ±0.3% 이내면 알림
            diff_ratio = abs(current - target_price) / target_price
            if diff_ratio <= TOLERANCE:
                label = line.get("label") or f"{line['line_type']} 선"
                msg = (
                    f"<b>[{symbol}] {label} 도달 알림</b>\n"
                    f"현재가: {current:,.0f}\n"
                    f"목표가: {target_price:,.0f}\n"
                    f"시장: {market}"
                )
                await telegram.send_alert(msg)

        except Exception as e:
            print(f"[monitor] {symbol} 가격 조회 실패: {e}")
