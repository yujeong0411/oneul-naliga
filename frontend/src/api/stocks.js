const API_URL = import.meta.env.VITE_API_URL || "";
const BASE = `${API_URL}/api`;

// ── 관심 종목 CRUD ──────────────────────────────

export const getWatchlist = (userId) => {
  const params = userId ? `?user_id=${userId}` : "";
  return fetch(`${BASE}/stocks/${params}`).then((r) => r.json());
};

export const addStock = (body) =>
  fetch(`${BASE}/stocks/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const removeStock = (code, userId) => {
  const params = userId ? `?user_id=${userId}` : "";
  return fetch(`${BASE}/stocks/${code}${params}`, { method: "DELETE" }).then((r) => r.json());
};

// ── 종목 검색 ────────────────────────────────────

export const searchStocks = (q) =>
  fetch(`${BASE}/stocks/search?q=${encodeURIComponent(q)}`).then((r) => r.json());

// ── 인기종목 랭킹 ─────────────────────────────────

export const getRanking = (type = "view") =>
  fetch(`${BASE}/stocks/ranking?type=${type}`).then((r) => {
    if (r.status === 503) throw Object.assign(new Error("maintenance"), { maintenance: true });
    return r.json();
  });

export const getOverseasRanking = (type = "rise", exchange = "NAS") =>
  fetch(`${BASE}/stocks/ranking/overseas?type=${type}&exchange=${exchange}`).then((r) => r.json());

export const getIndexCandles = (code, period = "D", count = 200) =>
  fetch(`${BASE}/stocks/indices/candles?code=${encodeURIComponent(code)}&period=${period}&count=${count}`).then((r) => r.json());

export const getDomesticIndexCandles = (inds_cd, period = "D", count = 600) =>
  fetch(`${BASE}/stocks/indices/domestic/candles?inds_cd=${inds_cd}&period=${period}&count=${count}`).then((r) => r.json());

export const getDomesticIndexInfo = (inds_cd, mrkt_tp = "0") =>
  fetch(`${BASE}/stocks/indices/domestic/info?inds_cd=${inds_cd}&mrkt_tp=${mrkt_tp}`).then((r) => r.json());

// ── 시장 지수 ─────────────────────────────────────

export const getIndices = () =>
  fetch(`${BASE}/stocks/indices`).then((r) => r.json()).then((r) => ({
    data: r.data ?? r,
    errors: r.errors ?? [],
  }));

// ── 환율 ───────────────────────────────────────────

export const getFX = () =>
  fetch(`${BASE}/stocks/fx`).then((r) => r.json());

// ── 차트 데이터 ─────────────────────────────────

export const getCandles = (market, symbol, timeframe = "일봉", count = 200, exchange = "NAS") =>
  fetch(`${BASE}/stocks/${market}/${symbol}/candles?timeframe=${encodeURIComponent(timeframe)}&count=${count}&exchange=${exchange}`).then((r) =>
    r.json()
  );

export const getPrice = (market, symbol, exchange = "NAS") =>
  fetch(`${BASE}/stocks/${market}/${symbol}/price?exchange=${exchange}`).then((r) => r.json());

// ── 투자자별 매매동향 ──────────────────────────────

export const getInvestors = (market, symbol, count = 20) =>
  fetch(`${BASE}/stocks/${market}/${symbol}/investors?count=${count}`).then((r) => r.json());

// ── 호가 조회 ─────────────────────────────────────

export const getOrderbook = (market, symbol, exchange = "NAS") =>
  fetch(`${BASE}/stocks/${market}/${symbol}/orderbook?exchange=${exchange}`).then((r) => r.json());

// ── 고점 / 저점 탐지 ────────────────────────────

export const getPeaks = (market, symbol, n = 10) =>
  fetch(`${BASE}/stocks/${market}/${symbol}/peaks?n=${n}`).then((r) => r.json());

// ── ETF ──────────────────────────────────────────

export const getEtfInfo = (code) =>
  fetch(`${BASE}/stocks/etf/${code}/info`).then((r) => r.json());

export const getEtfDaily = (code) =>
  fetch(`${BASE}/stocks/etf/${code}/daily`).then((r) => r.json());

// ── 유틸: 종목코드로 market 자동 판별 ────────────

export const detectMarket = (code) =>
  /^\d{6}$/.test(code) ? "KOSPI" : "US";

