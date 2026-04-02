# 오늘날이가 — 신규 기능 최종 설계

## 앱의 핵심 가치

> 선을 그으면 자동으로 데이터가 쌓이고  
> **"이 선에서 진입했을 때 기대 수익률"** 을 예측해주는 앱

---

## 사용자가 하는 것 vs 앱이 하는 것

### 사용자 (필수)
- 선 긋기

### 사용자 (선택)
- `매입가` → 실제로 샀을 때 입력 → 내 실제 수익률 추적
- `매도가` → 실제로 팔았을 때 입력 → 확정 수익률 기록
- `목표가` → 여기 오르면 알림
- `손절가` → 여기 떨어지면 알림

### 앱 자동
- 선 감시
- 터치 감지 → 알림 발송
- 터치 시점 가격 / 거래량 / 20캔들 평균 거래량 기록
- N캔들 후 반등/돌파/중립 자동 판정
- 기대 수익률 자동 계산

---

## 예측 계산 방식

```
반등 확률   = bounce 횟수 / (bounce + break 횟수)
              (neutral 제외)

평균 수익률 = bounce 케이스들의 pct_move 평균

pct_move    = (N캔들 후 종가 - 터치 시점 가격)
              / 터치 시점 가격 × 100

기대 수익률 = 반등 확률 × 평균 수익률
```

---

## 반등/돌파/중립 판정 기준

| 결과 | 조건 |
|------|------|
| `bounce` (반등) | N캔들 후 종가 > 터치 가격 +1% 이상 |
| `break` (돌파) | N캔들 후 종가 < 터치 가격 -1% 이하 |
| `neutral` (중립) | ±1% 이내 — 예측 계산에서 제외 |

---

## N캔들 기준 (봉타입별)

| 봉타입 | N캔들 | 실제 기간 |
|--------|-------|----------|
| 월봉 | 3캔들 | 3개월 |
| 주봉 | 4캔들 | 4주 |
| 일봉 | 5캔들 | 1주일 |
| 60분 | 6캔들 | 6시간 |
| 30분 | 8캔들 | 4시간 |
| 15분 | 8캔들 | 2시간 |
| 5분 | 12캔들 | 1시간 |
| 1분 | 30캔들 | 30분 |

---

## 데이터 부족 처리

```
bounce + break 합산 5회 미만 → "데이터 수집 중" 표시
5회 이상                     → 기대 수익률 표시
```

---

## DB 변경사항

### 새로 만드는 테이블 — `touch_events`

```sql
CREATE TABLE touch_events (
  id              UUID PRIMARY KEY,
  line_id         UUID REFERENCES lines(id),
  stock_code      TEXT,
  user_id         UUID,
  touched_at      TIMESTAMP,
  price_at_touch  FLOAT,        -- 터치 시점 가격
  volume_at_touch FLOAT,        -- 터치 시점 거래량
  volume_avg_20   FLOAT,        -- 최근 20캔들 평균 거래량
  pct_move        FLOAT,        -- N캔들 후 종가 기준 수익률 (자동 계산)
  result          TEXT          -- 'pending' | 'bounce' | 'break' | 'neutral'
);
```

### 기존 `lines` 테이블에 추가

```sql
ALTER TABLE lines ADD COLUMN entry_price FLOAT DEFAULT NULL; -- 매입가 (선택)
ALTER TABLE lines ADD COLUMN exit_price  FLOAT DEFAULT NULL; -- 매도가 (선택)
ALTER TABLE lines ADD COLUMN tp_price    FLOAT DEFAULT NULL; -- 목표가 (선택)
ALTER TABLE lines ADD COLUMN sl_price    FLOAT DEFAULT NULL; -- 손절가 (선택)
```

---

## Backend 변경사항

### `monitor.py`

```
check_and_alert() 터치 감지 직후
→ touch_events INSERT (result = 'pending')
→ tp_price / sl_price 도달 여부도 감시 추가
```

### `main.py`

```python
# lifespan에 추가
t4 = asyncio.create_task(touch_result_judge())

async def touch_result_judge():
    while True:
        # result = 'pending'인 touch_events 조회
        # 터치 시점 + N캔들 경과 여부 확인
        # 경과했으면 캔들 데이터 조회
        # 종가 기준 ±1% 판정
        # result 업데이트 + pct_move 저장
        await asyncio.sleep(60)  # 1분마다 체크
```

### 거래량 추출 수정

| 소스 | 거래량 필드 | 수정 내용 |
|------|------------|----------|
| 키움 WS 0B | field `"13"` | 추출 추가 |
| KIS WS HDFSCNT0 | `TVOL` (index 15+) | 추출 추가 |
| 키움 REST `get_current_price()` | `trde_qty` | 추출 추가 |
| KIS REST `get_current_price()` | `tvol` | 추출 추가 |
| 캔들 API | `volume` | 이미 추출 중 |

- `on_price` 콜백 시그니처에 `volume` 파라미터 추가
- `check_and_alert()`에 `volume` 전달
- `volume_avg_20`은 터치 시점에 캔들 API 호출해서 계산

### `lines.py` 라우터에 추가

```
GET /lines/{line_id}/stats
→ 터치 횟수, 반등률, 기대 수익률 반환
→ bounce + break 5회 미만이면 "데이터 부족" 반환
```

### `line.py` 모델에 추가

```python
entry_price: Optional[float] = None
exit_price:  Optional[float] = None
tp_price:    Optional[float] = None
sl_price:    Optional[float] = None
```

---

## Frontend 변경사항

### 차트 화면 — 선 뱃지

```
데이터 충분 → 기대 수익 +5.0%   (초록 / 노랑 / 빨강)
데이터 부족 → 수집 중 (3회)
```

### 바텀시트 (선 탭했을 때)

```
터치 7회 · 반등 5회 · 돌파 2회 · 중립 0회
반등 확률 71% · 평균 수익 +7.3%
기대 수익률 +5.2%

─────────────────────────────────
매입가 [      ]   매도가 [      ]   ← 선택
목표가 [      ]   손절가 [      ]   ← 선택
─────────────────────────────────
내 실제 수익률: +5.8%               ← 입력 시 표시
```

---

## 구현 순서

### 1단계 — DB
- `touch_events` 테이블 생성
- `lines`에 4개 컬럼 추가 (`entry_price` / `exit_price` / `tp_price` / `sl_price`)

### 2단계 — 거래량 추출
- 키움/KIS WS + REST에서 `volume` 추출 추가
- `on_price` 콜백 + `check_and_alert()`에 `volume` 전달

### 3단계 — 터치 기록
- `check_and_alert()`에 `touch_events` INSERT 추가

### 4단계 — 결과 판정
- `touch_result_judge()` 백그라운드 태스크 구현
- `main.py` lifespan에 등록

### 5단계 — 기대 수익률 API
- `GET /lines/{line_id}/stats` 추가

### 6단계 — 프론트
- 바텀시트에 터치 이력 + 기대 수익률 표시
- 차트 선 옆 뱃지 추가
- 매입가 / 매도가 / 목표가 / 손절가 입력 필드 추가

---

## MVP 제외 항목 (나중에 추가)

| 항목 | 이유 |
|------|------|
| 커뮤니티 집계 | 사용자 충분히 쌓인 후 |
| N캔들 사용자 설정 | 일단 봉타입별 고정값으로 운영 |
