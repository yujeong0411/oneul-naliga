from pydantic import BaseModel
from typing import Literal


class StockCandle(BaseModel):
    date: str          # "20240101"
    open: float
    high: float
    low: float
    close: float
    volume: int


class StockInfo(BaseModel):
    symbol: str
    name: str
    market: Literal["KOSPI", "KOSDAQ", "US"]
