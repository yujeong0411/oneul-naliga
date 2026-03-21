from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.line import LineCreate, LineUpdate
from app.database import get_supabase

router = APIRouter(prefix="/lines", tags=["lines"])


@router.post("/")
async def create_line(line: LineCreate):
    """선 저장 (추세선 / 수평선 공통)"""
    db = get_supabase()
    data = {k: v for k, v in line.model_dump().items() if v is not None}
    try:
        result = db.table("lines").insert(data).execute()
    except Exception:
        # color 컬럼이 없는 경우 색상 제외 후 재시도
        data.pop("color", None)
        result = db.table("lines").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="선 저장 실패")
    return result.data[0]


@router.get("/{stock_code}")
async def get_lines(stock_code: str, user_id: Optional[str] = Query(default=None)):
    """특정 종목의 모든 선 조회"""
    db = get_supabase()
    query = (
        db.table("lines")
        .select("*")
        .eq("stock_code", stock_code)
        .eq("is_active", True)
        .order("created_at", desc=True)
    )
    if user_id:
        query = query.eq("user_id", user_id)
    return query.execute().data


@router.patch("/{line_id}")
async def update_line(line_id: str, body: LineUpdate):
    """선 부분 수정 (이름, 민감도, 활성 여부)"""
    db = get_supabase()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다")
    result = db.table("lines").update(updates).eq("id", line_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="선을 찾을 수 없습니다")
    return result.data[0]


@router.delete("/{line_id}")
async def delete_line(line_id: str):
    """선 삭제"""
    db = get_supabase()
    db.table("lines").delete().eq("id", line_id).execute()
    return {"deleted": line_id}
