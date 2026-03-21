from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_supabase
from app.config import settings

router = APIRouter(prefix="/alerts", tags=["alerts"])


# ─────────────────────────────────────────
# 알림 로그
# ─────────────────────────────────────────

@router.get("/")
async def get_alerts(
    stock_code: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    """알림 로그 조회 (최신순)"""
    db = get_supabase()
    query = db.table("alerts").select("*").order("created_at", desc=True).limit(limit)
    if stock_code:
        query = query.eq("stock_code", stock_code)
    if user_id:
        query = query.eq("user_id", user_id)
    return query.execute().data


@router.delete("/{alert_id}")
async def delete_alert(alert_id: str, user_id: Optional[str] = Query(default=None)):
    """알림 로그 삭제"""
    db = get_supabase()
    query = db.table("alerts").delete().eq("id", alert_id)
    if user_id:
        query = query.eq("user_id", user_id)
    query.execute()
    return {"deleted": alert_id}


# ─────────────────────────────────────────
# Web Push 구독 관리
# ─────────────────────────────────────────

class PushSubscription(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_id: Optional[str] = None


@router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """VAPID 공개키 반환 (프론트엔드 구독 시 필요)"""
    if not settings.vapid_public_key:
        raise HTTPException(status_code=503, detail="Push 알림이 설정되지 않았습니다")
    return {"public_key": settings.vapid_public_key}


@router.post("/push/subscribe")
async def subscribe_push(body: PushSubscription):
    """푸시 구독 저장 (같은 endpoint면 업데이트)"""
    db = get_supabase()
    existing = db.table("push_subscriptions").select("id").eq("endpoint", body.endpoint).execute().data
    if existing:
        db.table("push_subscriptions").update({
            "p256dh": body.p256dh,
            "auth": body.auth,
            "user_id": body.user_id,
        }).eq("endpoint", body.endpoint).execute()
    else:
        db.table("push_subscriptions").insert({
            "endpoint": body.endpoint,
            "p256dh": body.p256dh,
            "auth": body.auth,
            "user_id": body.user_id,
        }).execute()
    return {"ok": True}


@router.delete("/push/subscribe")
async def unsubscribe_push(endpoint: str = Query(...)):
    """푸시 구독 해제"""
    db = get_supabase()
    db.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()
    return {"ok": True}


@router.post("/push/test")
async def test_push(user_id: Optional[str] = Query(default=None)):
    """푸시 알림 테스트 전송"""
    from app.services import push
    try:
        await push.broadcast(
            user_id=user_id,
            title="오늘 날이가 알림 테스트",
            body="푸시 알림이 정상적으로 연결됐습니다 ✓",
        )
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
