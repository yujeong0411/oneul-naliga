from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.position import PositionCreate, PositionUpdate
from app.database import get_supabase
from app.services.monitor import invalidate_position_cache

router = APIRouter(prefix="/positions", tags=["positions"])


@router.post("/")
async def create_position(body: PositionCreate):
    """포지션 생성"""
    db = get_supabase()
    pos_data = {
        k: v for k, v in body.model_dump(
            exclude={"entry_line_ids", "tp_line_ids", "sl_line_ids"}
        ).items() if v is not None
    }
    result = db.table("positions").insert(pos_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="포지션 생성 실패")
    pos = result.data[0]

    # position_lines 삽입
    links = []
    for lid in (body.entry_line_ids or []):
        links.append({"position_id": pos["id"], "line_id": lid, "role": "entry"})
    for lid in (body.tp_line_ids or []):
        links.append({"position_id": pos["id"], "line_id": lid, "role": "tp"})
    for lid in (body.sl_line_ids or []):
        links.append({"position_id": pos["id"], "line_id": lid, "role": "sl"})
    if links:
        db.table("position_lines").insert(links).execute()

    invalidate_position_cache()
    return pos


@router.get("/")
async def get_positions(
    stock_code: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
):
    """포지션 목록 조회 (연결된 선 포함)"""
    db = get_supabase()
    query = db.table("positions").select(
        "*, position_lines(id, role, line:line_id(id, name, price, line_type, signal_type, color))"
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
    """포지션 수정"""
    db = get_supabase()
    updates = body.model_dump(exclude_unset=True)

    # 선 연결 추가
    add_lines = updates.pop("add_lines", None)
    if add_lines:
        rows = [
            {"position_id": position_id, "line_id": l["line_id"], "role": l["role"]}
            for l in add_lines
        ]
        db.table("position_lines").upsert(rows, on_conflict="position_id,line_id").execute()

    # 선 연결 해제
    remove_lines = updates.pop("remove_lines", None)
    if remove_lines:
        for lid in remove_lines:
            db.table("position_lines").delete().eq(
                "position_id", position_id
            ).eq("line_id", lid).execute()

    # 목표가/손절가 변경 시 상태 초기화 (tp_hit/sl_hit → open)
    if "tp_price" in updates or "sl_price" in updates:
        current = db.table("positions").select("status, tp_price, sl_price").eq("id", position_id).execute().data
        if current:
            pos = current[0]
            if "tp_price" in updates and pos["status"] == "tp_hit" and updates["tp_price"] != pos["tp_price"]:
                updates["status"] = "open"
            if "sl_price" in updates and pos["status"] == "sl_hit" and updates["sl_price"] != pos["sl_price"]:
                updates["status"] = "open"

    # 나머지 필드 업데이트
    if updates:
        result = db.table("positions").update(updates).eq("id", position_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="포지션을 찾을 수 없습니다")
        pos = result.data[0]
    else:
        pos = db.table("positions").select("*").eq("id", position_id).execute().data
        if not pos:
            raise HTTPException(status_code=404, detail="포지션을 찾을 수 없습니다")
        pos = pos[0]

    if pos.get("status") == "open":
        invalidate_position_cache()
    return pos


@router.delete("/{position_id}")
async def delete_position(position_id: str):
    """포지션 삭제 (position_lines는 CASCADE로 자동 삭제)"""
    db = get_supabase()
    db.table("positions").delete().eq("id", position_id).execute()
    invalidate_position_cache()
    return {"deleted": position_id}
