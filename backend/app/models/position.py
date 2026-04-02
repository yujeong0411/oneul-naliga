from pydantic import BaseModel
from typing import Optional


class PositionCreate(BaseModel):
    stock_code: str
    user_id: Optional[str] = None
    entry_line_ids: Optional[list[str]] = None
    tp_line_ids: Optional[list[str]] = None
    sl_line_ids: Optional[list[str]] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    tp_price: Optional[float] = None
    sl_price: Optional[float] = None


class PositionLineAction(BaseModel):
    line_id: str
    role: str  # 'entry' | 'tp' | 'sl'


class PositionUpdate(BaseModel):
    add_lines: Optional[list[PositionLineAction]] = None
    remove_lines: Optional[list[str]] = None  # line_id 목록
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    tp_price: Optional[float] = None
    sl_price: Optional[float] = None
    status: Optional[str] = None  # open / closed / tp_hit / sl_hit
