from fastapi import APIRouter, HTTPException, Query
from app.database import get_supabase_service

router = APIRouter(tags=["users"])

TABLES_WITH_USER_ID = ["lines", "alerts", "push_subscriptions", "positions", "position_lines"]


@router.delete("/users/me")
async def delete_user(user_id: str = Query(...)):
    """회원 탈퇴: 유저 관련 데이터 삭제 후 Supabase Auth 유저 삭제"""
    db = get_supabase_service()

    # 1) 유저 데이터 삭제
    for table in TABLES_WITH_USER_ID:
        try:
            db.table(table).delete().eq("user_id", user_id).execute()
        except Exception:
            pass  # 테이블이 없거나 컬럼이 없으면 무시

    # 2) Supabase Auth 유저 삭제
    try:
        db.auth.admin.delete_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"유저 삭제 실패: {e}")

    return {"ok": True}
