"""Web Push 알림 서비스 (VAPID)"""
import json
from pywebpush import webpush, WebPushException
from app.config import settings
from app.database import get_supabase


def _vapid_ready() -> bool:
    return bool(settings.vapid_private_key and settings.vapid_public_key and settings.vapid_email)


def _send_one(subscription: dict, title: str, body: str, data: dict | None = None) -> bool:
    """단일 구독에 푸시 전송. 만료된 구독이면 False 반환."""
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps({"title": title, "body": body, **(data or {})}),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": f"mailto:{settings.vapid_email}"},
        )
        return True
    except WebPushException as e:
        if e.response and e.response.status_code in (404, 410):
            return False  # 만료된 구독
        raise


async def broadcast(user_id: str | None, title: str, body: str, data: dict | None = None) -> None:
    """유저의 모든 구독 디바이스에 푸시 전송. 만료된 구독은 자동 삭제."""
    if not _vapid_ready():
        print(f"[push] VAPID 미설정, 스킵: {title}")
        return

    db = get_supabase()
    query = db.table("push_subscriptions").select("*")
    if user_id:
        query = query.eq("user_id", user_id)
    rows = query.execute().data

    expired_ids = []
    for row in rows:
        sub = {"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}}
        try:
            alive = _send_one(sub, title, body, data)
            if not alive:
                expired_ids.append(row["id"])
        except Exception as e:
            print(f"[push] 전송 실패 {row['endpoint'][:40]}...: {e}")

    for eid in expired_ids:
        db.table("push_subscriptions").delete().eq("id", eid).execute()
        print(f"[push] 만료 구독 삭제: {eid}")
