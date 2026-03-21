# 오늘 날이가

국내/해외 주식 차트 분석 및 가격 알림 웹앱 (PWA)

## 기능

### 홈
- 코스피/코스닥/S&P500/나스닥/다우존스 지수 실시간 표시
- USD/JPY/EUR 등 환율 실시간 표시
- 관심 종목 실시간 가격 (WebSocket)
- 국내/해외 인기 종목 랭킹 (조회순·거래량·거래대금·상승·하락 등)
- 금융 뉴스 (키워드 커스텀, localStorage 저장)

### 주식 차트
- 국내(코스피/코스닥) + 미국 종목 통합 검색
- 일봉/주봉/월봉/년봉 + 분봉(1·3·5·10·15·30·60분)
- 이동평균선 MA5/MA20/MA60 토글
- 호가 지지/저항 라인 자동 표시 (국내 전용)

### 추세선 / 지지저항선
- 고점 두 개 클릭 → 추세선 자동 생성
- 수평 지지/저항 가격 직접 입력
- 손절/이익실현 선 구분 관리

### 알림
- 서버 24시간 현재가 감시
- 가격이 설정 선에 도달하면 텔레그램 봇 알림

### 기타
- 카카오 로그인
- 다크모드
- PWA (홈 화면 추가 지원)

## 기술 스택

| 구분 | 기술 |
|---|---|
| 프론트엔드 | React 18 + Vite + Lightweight Charts |
| 백엔드 | FastAPI (Python 3.12) |
| DB | Supabase (PostgreSQL) |
| 인증 | Supabase Auth + 카카오 OAuth |
| 국내 주식 | 키움 REST API + WebSocket |
| 해외 주식/지수 | 한국투자증권(KIS) API + WebSocket |
| 알림 | 텔레그램 봇 |
| 뉴스 | 네이버 검색 API / 구글 뉴스 RSS (폴백) |
| 배포 | Railway (백엔드) + Vercel (프론트엔드) |

## 프로젝트 구조

```
oneul-naliga/
├── backend/
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── routers/
│       │   ├── stocks.py     # 시세, 차트, 랭킹, 지수
│       │   ├── lines.py      # 추세선/지지저항선 CRUD
│       │   ├── alerts.py     # 알림 설정
│       │   └── news.py       # 금융 뉴스
│       ├── services/
│       │   ├── kiwoom.py     # 키움 REST API
│       │   ├── kiwoom_ws.py  # 키움 WebSocket (실시간)
│       │   ├── kis.py        # 한국투자증권 REST API
│       │   ├── kis_ws.py     # KIS WebSocket (실시간)
│       │   ├── monitor.py    # 가격 감시 백그라운드 태스크
│       │   └── telegram.py   # 텔레그램 알림 발송
│       └── models/
│           ├── stock.py
│           └── line.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── Home.jsx
        │   ├── ChartDetail.jsx
        │   ├── IndexDetail.jsx
        │   ├── Alerts.jsx
        │   └── Settings.jsx
        ├── components/
        ├── api/
        └── hooks/
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

# 텔레그램 봇
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# 네이버 검색 API (선택 - 없으면 구글 뉴스 RSS로 자동 대체)
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

## 실행

```bash
# 백엔드
cd backend
python -m venv .venv && source .venv/Scripts/activate
pip install -e .
uvicorn app.main:app --reload

# 프론트엔드
cd frontend
npm install
npm run dev
```
