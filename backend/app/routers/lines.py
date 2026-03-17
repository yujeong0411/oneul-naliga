from fastapi import APIRouter, HTTPException
from app.models.line import TrendLine, HorizontalLine
from app.database import get_supabase

router = APIRouter(prefix="/lines", tags=["lines"])


@router.post("/trend")
async def save_trend_line(line: TrendLine):
    db = get_supabase()
    result = db.table("trend_lines").insert(line.model_dump()).execute()
    return result.data


@router.get("/trend/{symbol}")
async def get_trend_lines(symbol: str):
    db = get_supabase()
    result = db.table("trend_lines").select("*").eq("symbol", symbol).execute()
    return result.data


@router.delete("/trend/{line_id}")
async def delete_trend_line(line_id: int):
    db = get_supabase()
    db.table("trend_lines").delete().eq("id", line_id).execute()
    return {"deleted": line_id}


@router.post("/horizontal")
async def save_horizontal_line(line: HorizontalLine):
    db = get_supabase()
    result = db.table("horizontal_lines").insert(line.model_dump()).execute()
    return result.data


@router.get("/horizontal/{symbol}")
async def get_horizontal_lines(symbol: str):
    db = get_supabase()
    result = db.table("horizontal_lines").select("*").eq("symbol", symbol).execute()
    return result.data


@router.delete("/horizontal/{line_id}")
async def delete_horizontal_line(line_id: int):
    db = get_supabase()
    db.table("horizontal_lines").delete().eq("id", line_id).execute()
    return {"deleted": line_id}
