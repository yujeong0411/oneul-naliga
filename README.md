# 오늘 날이가

국내/해외 주식 차트 분석 및 가격 알림 웹앱 (PWA)

## 기능

### 홈
- 코스피/코스닥/S&P500/나스닥/다우존스 지수 실시간 표시 (국내/해외 분리 API)
- USD/JPY/EUR/CNY/GBP 환율 실시간 표시 (KIS 우선, open.er-api.com 폴백)
- 국내/해외 인기 종목 랭킹 9종 + 해외 5종 (30초 백그라운드 갱신, 탭 전환 즉시 응답)
- 금융 뉴스 (키워드 커스텀, localStorage 저장)

### 주식 차트
- 국내(코스피/코스닥) + 미국(NAS/NYS/AMS) 종목 통합 검색
- 일봉/주봉/월봉/년봉 + 분봉(1·3·5·10·15·30·60분)
- 이동평균선 MA5/MA20/MA60 (드롭다운 복수 선택)
- 일목균형표 (전환선/기준선/선행스팬/구름대)
- 호가 지지/저항 라인 자동 표시 (평균 3배 물량 가격대)
- 투자자별 매매동향 (개인/외국인/기관, 국내 전용)
- ETF 정보 + NAV 추이

### 추세선 / 지지저항선
- 차트에서 고점 두 개 클릭 → 추세선 자동 생성 (slope/intercept 기반 연장)
- 수평 지지/저항 가격 직접 입력
- 지지/저항 자동 감지 (peak detector)
- 선별 숨기기/표시 토글, 이름·민감도 편집

### 기술적 분석
- RSI, MACD, 볼린저밴드, 스토캐스틱, ADX, CCI, 윌리엄스%R 등 종합 분석
- 카드별 상세 분석 확인 가능
- 실시간 WebSocket 업데이트

### 알림
- 서버 24시간 가격 감시 (분봉: WebSocket 실시간, 일봉 이상: 장 마감 후 REST 1회)
- 설정한 선에 가격 도달 시 웹 푸시 알림 (VAPID)
- 알림 히스토리 관리

### 기타
- 카카오 로그인 (Supabase Auth)
- 다크모드
- PWA (홈 화면 추가 지원)
- 반응형 UI (모바일/태블릿/PC 3단계)
- 스플래시 화면 + 데이터 프리페치

## 기술 스택

| 구분 | 기술 |
|---|---|
| 프론트엔드 | React 18 + Vite + Lightweight Charts 4.2 |
| 백엔드 | FastAPI (Python 3.12+) |
| DB | Supabase (PostgreSQL) |
| 인증 | Supabase Auth + 카카오 OAuth |
| 국내 시세 | 키움 REST API + WebSocket (0B+0D 통합 싱글턴) |
| 해외 시세 | 한국투자증권(KIS) REST + WebSocket (싱글턴 매니저) |
| 알림 | 웹 푸시 (VAPID / pywebpush) |
| 뉴스 | 네이버 검색 API / 구글 뉴스 RSS (폴백) |
| 배포 | Railway (백엔드) + Vercel (프론트엔드) |

## 프로젝트 구조

```
oneul-naliga/
├── backend/
│   └── app/
│       ├── main.py                # FastAPI 앱 + WebSocket + 백그라운드 태스크
│       ├── config.py              # 환경변수 (Pydantic Settings)
│       ├── database.py            # Supabase 클라이언트
│       ├── routers/
│       │   ├── stocks.py          # 시세, 차트, 랭킹, 지수, 환율, 호가, 기술 지표
│       │   ├── lines.py           # 추세선/수평선 CRUD
│       │   ├── alerts.py          # 알림 CRUD + 푸시 구독
│       │   └── news.py            # 금융 뉴스
│       ├── services/
│       │   ├── http_client.py     # 공유 httpx AsyncClient 싱글턴
│       │   ├── kiwoom.py          # 키움 REST API (토큰 캐시 + Supabase 영속화)
│       │   ├── kiwoom_ws.py       # 키움 WebSocket 싱글턴 (0B+0D 단일 연결)
│       │   ├── kis.py             # KIS REST API (retry + dedup)
│       │   ├── kis_ws.py          # KIS WebSocket 싱글턴 매니저
│       │   ├── monitor.py         # 가격 감시 (분봉 실시간 + 장 마감 REST)
│       │   ├── indicators.py      # 기술적 지표 계산
│       │   ├── indicator_ws.py    # 기술적 지표 실시간 WS
│       │   ├── peak_detector.py   # 지지/저항 자동 감지
│       │   └── push.py            # 웹 푸시 (VAPID)
│       ├── models/
│       │   ├── stock.py           # StockCandle
│       │   ├── line.py            # LineCreate, LineUpdate
│       │   └── alert.py
│       └── data/
│           └── stock_list.py      # 종목 검색
└── frontend/
    └── src/
        ├── App.jsx                # 라우팅 + 레이아웃
        ├── pages/
        │   ├── Home.jsx           # 메인 (지수/환율/랭킹/뉴스)
        │   ├── ChartDetail.jsx    # 차트 상세
        │   ├── IndexDetail.jsx    # 해외 지수 상세
        │   ├── DomesticIndexDetail.jsx
        │   ├── Watchlist.jsx      # 관심종목
        │   ├── Alerts.jsx         # 알림 히스토리
        │   ├── Settings.jsx       # 설정
        │   └── Login.jsx
        ├── components/
        │   ├── OrderbookPanel.jsx  # 호가창
        │   ├── IndicatorPanel.jsx  # 기술적 분석
        │   ├── AutoDetectPanel.jsx # 지지/저항 자동감지
        │   ├── InvestorPanel.jsx   # 투자자 매매동향
        │   ├── AddLineModal.jsx    # 선 추가
        │   ├── EditLineSheet.jsx   # 선 편집
        │   └── SearchOverlay.jsx   # 종목 검색
        ├── hooks/
        │   ├── useLivePrice.js     # 실시간 가격 WS
        │   ├── useOrderbook.js     # 실시간 호가 WS
        │   ├── useAlertCount.jsx   # 알림 카운트
        │   └── usePushNotification.js
        └── api/
            ├── stocks.js
            ├── lines.js
            ├── alerts.js
            └── news.js
```

## 환경 변수

`backend/.env` 파일을 생성하고 아래 값을 입력합니다. (`backend/.env.example` 참고)

```env
# Supabase
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=

# 카카오 OAuth
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=

# 키움 REST API
KIWOOM_APP_KEY=
KIWOOM_APP_SECRET=

# 한국투자증권 API
KIS_APP_KEY=
KIS_APP_SECRET=

# 네이버 검색 API (선택 - 없으면 구글 뉴스 RSS로 자동 대체)
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# 웹 푸시 (VAPID) — uv run vapid --gen 으로 생성
VAPID_PRIVATE_KEY=     # raw Base64URL 32바이트 (PEM 아님)
VAPID_PUBLIC_KEY=
VAPID_EMAIL=           # mailto:your@email.com
```

`frontend/.env`:
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=          # 백엔드 URL (예: https://xxx.railway.app)
```

## 실행

```bash
# 백엔드
cd backend
uv venv && source .venv/Scripts/activate  # Windows
uv pip install -e .
uvicorn app.main:app --reload

# 프론트엔드
cd frontend
npm install
npm run dev
```
