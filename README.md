# oneul-naliga

주식 차트 분석 웹앱 - 추세선/지지저항선 설정 및 24시간 가격 알림

## 기술 스택

- **프론트엔드**: React + Vite + Tailwind CSS + Lightweight Charts
- **백엔드**: FastAPI (Python)
- **DB**: Supabase (PostgreSQL)
- **서버**: Railway
- **알림**: 텔레그램 봇
- **국내 주식**: 키움 REST API
- **해외 주식**: 한국투자증권 API

## 핵심 기능

1. 주식 차트에서 고점 두 개 클릭 → 추세선 자동 생성
2. 수평 지지/저항선 가격 직접 입력
3. 이동평균선 (5일, 20일, 60일)
4. 서버 24시간 현재가 감시 → 선에 닿으면 텔레그램 알림
5. 국내(코스피/코스닥) + 해외(미국) 종목 통합 관리

## 프로젝트 구조

```
oneul-naliga/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── routers/
│   │   │   ├── stocks.py
│   │   │   ├── lines.py
│   │   │   └── alerts.py
│   │   ├── services/
│   │   │   ├── kiwoom.py
│   │   │   ├── kis.py
│   │   │   ├── monitor.py
│   │   │   └── telegram.py
│   │   └── models/
│   │       ├── stock.py
│   │       └── line.py
│   ├── .env
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   └── api/
    ├── index.html
    └── package.json
```

## 설치 및 실행

```bash
# 백엔드
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# 프론트엔드
cd frontend
npm install
npm run dev
```
