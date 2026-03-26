from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.position import PositionCreate, PositionUpdate
from app.database import get_supabase

router = APIRouter(prefix="/positions", tags=["positions"])


@router.post("/")
async def create_position(body: PositionCreate):
    """포지션 생성"""
    db = get_supabase()
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    result = db.table("positions").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="포지션 생성 실패")
    return result.data[0]


@router.get("/")
async def get_positions(
    stock_code: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    """포지션 목록 조회"""
    db = get_supabase()
    query = db.table("positions").select(
        "*, entry_line:entry_line_id(id, name, price, line_type, signal_type, color),"
        " tp_line:tp_line_id(id, name, price, line_type, signal_type, color),"
        " sl_line:sl_line_id(id, name, price, line_type, signal_type, color)"
    ).order("created_at", desc=True)
    if stock_code:
        query = query.eq("stock_code", stock_code)
    if user_id:
        query = query.eq("user_id", user_id)
    if status:
        query = query.eq("status", status)
    return query.execute().data


@router.patch("/{position_id}")
async def update_position(position_id: str, body: PositionUpdate):
    """포지션 수정 (매도가 입력, 선 연결 변경 등)"""
    db = get_supabase()
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다")
    result = db.table("positions").update(updates).eq("id", position_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="포지션을 찾을 수 없습니다")
    return result.data[0]


@router.delete("/{position_id}")
async def delete_position(position_id: str):
    """포지션 삭제"""
    db = get_supabase()
    db.table("positions").delete().eq("id", position_id).execute()
    return {"deleted": position_id}
