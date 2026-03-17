from pydantic import BaseModel
from typing import Literal, Optional


class TrendLine(BaseModel):
    symbol: str
    market: Literal["KOSPI", "KOSDAQ", "US"]
    # 두 고점의 (날짜, 가격)
    x1: str    # "20240101"
    y1: float
    x2: str    # "20240201"
    y2: float
    label: Optional[str] = None


class HorizontalLine(BaseModel):
    symbol: str
    market: Literal["KOSPI", "KOSDAQ", "US"]
    price: float
    label: Optional[str] = None
    line_type: Literal["support", "resistance"] = "resistance"
