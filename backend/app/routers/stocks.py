from fastapi import APIRouter, HTTPException, Query
from typing import Literal
from app.services import kiwoom, kis

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/{market}/{symbol}/candles")
async def get_candles(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    count: int = Query(default=200, ge=1, le=500),
    exchange: str = Query(default="NAS", description="US 전용: NAS, NYS, AMS"),
):
    """일봉 데이터 조회"""
    try:
        if market in ("KOSPI", "KOSDAQ"):
            candles = await kiwoom.get_daily_candles(symbol, count)
        else:
            candles = await kis.get_daily_candles(symbol, count)
        return {"symbol": symbol, "market": market, "candles": candles}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/{market}/{symbol}/price")
async def get_price(
    market: Literal["KOSPI", "KOSDAQ", "US"],
    symbol: str,
    exchange: str = Query(default="NAS"),
):
    """현재가 조회"""
    try:
        if market in ("KOSPI", "KOSDAQ"):
            price = await kiwoom.get_current_price(symbol)
        else:
            price = await kis.get_current_price(symbol, exchange)
        return {"symbol": symbol, "price": price}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
