import httpx
from app.config import settings


async def send_alert(line: dict, current_price: float, target_price: float, diff_pct: float) -> None:
    """텔레그램 알림 전송

    Args:
        line: DB lines 행 (stock_code, name, timeframe, signal_type 포함)
        current_price: 현재가
        target_price: 선 위의 목표가 (수평선은 price, 추세선은 계산값)
        diff_pct: 거리 (%)
    """
    signal_label = "저항선" if line.get("signal_type") == "attack" else "지지선"
    icon = "📈" if line.get("signal_type") == "attack" else "📉"

    stock_code = line["stock_code"]
    is_domestic = stock_code.isdigit() and len(stock_code) == 6
    price_fmt = f"{current_price:,.0f}원" if is_domestic else f"${current_price:,.2f}"
    target_fmt = f"{target_price:,.0f}원" if is_domestic else f"${target_price:,.2f}"

    msg = (
        f"{icon} <b>[{line['stock_code']}] {signal_label} 도달!</b>\n"
        f"\n"
        f"봉 종류:  {line.get('timeframe', '-')}\n"
        f"선 이름:  {line.get('name') or '이름 없음'}\n"
        f"현재가:   {price_fmt}\n"
        f"선 가격:  {target_fmt}\n"
        f"거리:     {diff_pct:.2f}%\n"
        f"\n"
        f"→ 설정한 {signal_label}에 근접했습니다"
    )

    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        print(f"[telegram] 알림 스킵 (토큰 미설정): {line.get('stock_code')} {signal_label}")
        return

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    async with httpx.AsyncClient() as client:
        await client.post(url, json={
            "chat_id": settings.telegram_chat_id,
            "text": msg,
            "parse_mode": "HTML",
        })
