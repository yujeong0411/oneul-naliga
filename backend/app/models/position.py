from pydantic import BaseModel
from typing import Optional


class PositionCreate(BaseModel):
    stock_code: str
    user_id: Optional[str] = None
    entry_line_id: Optional[str] = None  # 진입선 (lines.id)
    tp_line_id: Optional[str] = None     # 목표선
    sl_line_id: Optional[str] = None     # 손절선
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    tp_price: Optional[float] = None
    sl_price: Optional[float] = None


class PositionUpdate(BaseModel):
    entry_line_id: Optional[str] = None
    tp_line_id: Optional[str] = None
    sl_line_id: Optional[str] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    tp_price: Optional[float] = None
    sl_price: Optional[float] = None
    status: Optional[str] = None  # open / closed / tp_hit / sl_hit
