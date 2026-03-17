import httpx
from app.config import settings


async def send_alert(message: str) -> None:
    """텔레그램 알림 전송"""
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    async with httpx.AsyncClient() as client:
        await client.post(url, json={
            "chat_id": settings.telegram_chat_id,
            "text": message,
            "parse_mode": "HTML",
        })
