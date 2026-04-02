from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.models.line import LineCreate, LineUpdate
from app.database import get_supabase
from app.services.monitor import invalidate_lines_cache

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
    invalidate_lines_cache()
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
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다")
    result = db.table("lines").update(updates).eq("id", line_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="선을 찾을 수 없습니다")
    invalidate_lines_cache()
    return result.data[0]


@router.delete("/{line_id}")
async def delete_line(line_id: str):
    """선 삭제"""
    db = get_supabase()
    db.table("lines").delete().eq("id", line_id).execute()
    invalidate_lines_cache()
    return {"deleted": line_id}


# 봉타입별 터치 집계 기간 (일 단위)
_STATS_PERIOD_DAYS = {
    "1분": 3, "3분": 3, "5분": 3, "10분": 3, "15분": 3, "30분": 3, "60분": 3,
    "일봉": 365, "주봉": 730, "월봉": 1095, "년봉": 1095,
}




def _calc_weighted_bounce_rate(bounce_list: list, break_list: list) -> float:
    """최근성 가중치 적용 반등 확률: weight = 1 / (1 + days_since_touch / 30)"""
    from datetime import datetime
    import pytz
    KST = pytz.timezone("Asia/Seoul")
    now = datetime.now(KST)

    weighted_sum = 0.0
    weight_total = 0.0

    for t in bounce_list + break_list:
        touched_at = t.get("touched_at", "")
        try:
            dt = datetime.fromisoformat(touched_at.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = KST.localize(dt)
            days = (now - dt).total_seconds() / 86400
        except Exception:
            days = 30
        w = 1.0 / (1.0 + days / 30.0)
        weighted_sum += w * (1.0 if t["result"] == "bounce" else 0.0)
        weight_total += w

    return weighted_sum / weight_total if weight_total > 0 else 0.0


@router.get("/{line_id}/stats")
async def get_line_stats(line_id: str):
    """선의 터치 통계 반환 (수평선: 기대 수익률, 추세선: 유효성)"""
    db = get_supabase()

    # 선 정보 조회
    line_row = db.table("lines").select("line_type, timeframe").eq("id", line_id).execute().data
    if not line_row:
        return {"error": "선을 찾을 수 없습니다"}
    line_type = line_row[0]["line_type"]
    timeframe = line_row[0].get("timeframe", "일봉")

    # 봉타입별 기간 필터
    from datetime import datetime, timedelta
    import pytz
    KST = pytz.timezone("Asia/Seoul")
    period_days = _STATS_PERIOD_DAYS.get(timeframe, 365)
    cutoff = (datetime.now(KST) - timedelta(days=period_days)).isoformat()

    # 판정 완료된 터치 조회 (기간 필터 적용)
    touches = (
        db.table("touch_events")
        .select("result, pct_move, touched_at")
        .eq("line_id", line_id)
        .neq("result", "pending")
        .gte("touched_at", cutoff)
        .execute()
        .data
    )
    pending_count = (
        db.table("touch_events")
        .select("id", count="exact")
        .eq("line_id", line_id)
        .eq("result", "pending")
        .execute()
    )
    pending = pending_count.count or 0
    total = len(touches)

    break_list = [t for t in touches if t["result"] == "break"]
    break_count = len(break_list)

    if line_type == "trend":
        # ── 추세선: maintain vs break ──
        maintain_list = [t for t in touches if t["result"] == "maintain"]
        maintain_count = len(maintain_list)
        decisive = maintain_count + break_count

        result = {
            "line_type": "trend",
            "touch_count": total + pending,
            "pending": pending,
            "maintain_count": maintain_count,
            "break_count": break_count,
            "decisive": decisive,
        }
        if decisive > 0:
            validity = maintain_count / decisive
            result["validity"] = round(validity, 2)
            avg_pct_move = sum(t["pct_move"] for t in maintain_list) / maintain_count if maintain_count > 0 else 0.0
            result["avg_pct_move"] = round(avg_pct_move, 2)
            result["expected_return"] = round(validity * avg_pct_move, 2)
        return result

    else:
        # ── 수평선: bounce vs break vs neutral ──
        bounce_list = [t for t in touches if t["result"] == "bounce"]
        neutral_list = [t for t in touches if t["result"] == "neutral"]
        bounce_count = len(bounce_list)
        neutral_count = len(neutral_list)
        decisive = bounce_count + break_count

        result = {
            "line_type": "horizontal",
            "touch_count": total + pending,
            "pending": pending,
            "bounce_count": bounce_count,
            "break_count": break_count,
            "neutral_count": neutral_count,
            "decisive": decisive,
        }
        if decisive > 0:
            weighted_bounce_rate = _calc_weighted_bounce_rate(bounce_list, break_list)
            avg_pct_move = sum(t["pct_move"] for t in bounce_list) / bounce_count if bounce_count > 0 else 0.0
            result["bounce_rate"] = round(weighted_bounce_rate, 2)
            result["avg_pct_move"] = round(avg_pct_move, 2)
            result["expected_return"] = round(weighted_bounce_rate * avg_pct_move, 2)
        return result
