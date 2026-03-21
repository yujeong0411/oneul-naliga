from pydantic import BaseModel, field_validator
from typing import Literal, Optional

VALID_TIMEFRAMES = {"일봉", "주봉", "월봉", "년봉", "1분", "3분", "5분", "10분", "15분", "30분", "60분"}


class LineCreate(BaseModel):
    """선 생성 요청 모델"""
    stock_code: str
    timeframe: str

    @field_validator("timeframe")
    @classmethod
    def check_timeframe(cls, v):
        if v not in VALID_TIMEFRAMES:
            raise ValueError(f"지원하지 않는 timeframe: {v}")
        return v
    line_type: Literal["trend", "horizontal"]
    signal_type: Literal["attack", "loss"]
    name: Optional[str] = None

    # 추세선용 (두 고점)
    x1: Optional[int] = None   # Unix timestamp
    y1: Optional[float] = None
    x2: Optional[int] = None
    y2: Optional[float] = None
    slope: Optional[float] = None
    intercept: Optional[float] = None

    # 수평선용
    price: Optional[float] = None

    color: Optional[str] = None  # 사용자 지정 색상 (hex)
    sensitivity: float = 0.5  # 알림 민감도 (±%)
    user_id: Optional[str] = None


class LineUpdate(BaseModel):
    """선 수정 요청 모델 (부분 업데이트)"""
    name: Optional[str] = None
    color: Optional[str] = None
    sensitivity: Optional[float] = None
    is_active: Optional[bool] = None
