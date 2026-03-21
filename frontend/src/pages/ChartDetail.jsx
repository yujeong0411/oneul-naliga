import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";
import AddLineModal from "../components/AddLineModal";
import EditLineSheet from "../components/EditLineSheet";
import AutoDetectPanel from "../components/AutoDetectPanel";
import OrderbookPanel from "../components/OrderbookPanel";
import InvestorPanel from "../components/InvestorPanel";
import { getCandles, getPrice, detectMarket, searchStocks, getWatchlist, addStock, removeStock, getOrderbook, getEtfInfo, getEtfDaily } from "../api/stocks";
import { useLivePrice } from "../hooks/useLivePrice";
import { useOrderbook } from "../hooks/useOrderbook";
import { getLines, createLine, updateLine, deleteLine } from "../api/lines";
import { useAuth } from "../context/AuthContext";

const B = "var(--border-tertiary)";
const TIMEFRAMES = ["일봉", "주봉", "월봉", "년봉"];
const MINUTE_OPTIONS = [1, 3, 5, 10, 15, 30, 60];
const MA_CONFIG = [
  { key: "ma5", period: 5, color: "#f59e0b", label: "MA5" },
  { key: "ma20", period: 20, color: "#8b5cf6", label: "MA20" },
  { key: "ma60", period: 60, color: "#06b6d4", label: "MA60" },
];

// ── 유틸 ──────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1100);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 1100);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return isMobile;
}

function calcMA(candles, period) {
  return candles
    .map((c, i) => {
      if (i < period - 1) return null;
      const avg = candles.slice(i - period + 1, i + 1).reduce((s, x) => s + x.close, 0) / period;
      return { time: c.time, value: Math.round(avg) };
    })
    .filter(Boolean);
}

function toChartTime(dateStr, isIntraday, isOverseas = false) {
  if (isIntraday) {
    const y = dateStr.slice(0, 4);
    const mo = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const h = dateStr.slice(8, 10);
    const m = dateStr.slice(10, 12);
    // 해외: KIS가 EST(-05:00) 기준으로 반환 → KST로 브라우저가 변환
    // 국내: KST(+09:00)
    const tz = isOverseas ? "-05:00" : "+09:00";
    return Math.floor(new Date(`${y}-${mo}-${d}T${h}:${m}:00${tz}`).getTime() / 1000);
  }
  // "20241101" → "2024-11-01"
  return dateStr.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
}

function lineColor(signalType) {
  return signalType === "loss" ? "#e53e3e" : "#38a169";
}

// ── 컴포넌트 ──────────────────────────────────

export default function ChartDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const market = detectMarket(code);
  const { user } = useAuth();

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const candleSeries = useRef(null);
  const maSeriesRefs = useRef([]);
  const trendSeriesMap = useRef({});

  const [candles, setCandles] = useState([]);
  const [lines, setLines] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [timeframe, setTimeframe] = useState("일봉");
  const [showMA, setShowMA] = useState({ ma5: true, ma20: true, ma60: false });
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [pendingPoints, setPendingPoints] = useState(null);
  const [mobileTab, setMobileTab] = useState("lines"); // "lines" | "detect" | "orderbook"
  const [showOrderbookLines, setShowOrderbookLines] = useState(true);
  const [editingLine, setEditingLine] = useState(null);
  const [showMinuteDropdown, setShowMinuteDropdown] = useState(false);
  const [chartReady, setChartReady] = useState(0);
  const [stockName, setStockName] = useState(location.state?.name || "");
  const [exchange, setExchange] = useState(location.state?.exchange || "NAS");
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [etfInfo, setEtfInfo] = useState(null);   // null = 미확인, false = ETF 아님
  const [etfNav, setEtfNav] = useState([]);

  const isDomestic = /^\d{6}$/.test(code);
  const { price: livePrice, change_pct: liveChangePct } = useLivePrice(code, exchange);
  const { supportResistance: wsSR } = useOrderbook(code, exchange);
  const [restSR, setRestSR] = useState([]);

  // REST 호가로 SR 계산 (장외시간 폴백)
  useEffect(() => {
    if (!isDomestic) return;
    getOrderbook(market, code)
      .then((data) => {
        const all = [...(data.asks || []), ...(data.bids || [])];
        if (all.length === 0) return;
        const avg = all.reduce((s, e) => s + e.quantity, 0) / all.length;
        const threshold = avg * 3;
        setRestSR(
          all
            .filter((e) => e.quantity >= threshold && e.price > 0)
            .map((e) => ({
              price: e.price,
              quantity: e.quantity,
              type: (data.asks || []).some((a) => a.price === e.price) ? "resistance" : "support",
              ratio: (e.quantity / avg).toFixed(1),
            }))
        );
      })
      .catch(() => {});
  }, [code, market, isDomestic]);

  // WebSocket 데이터 우선, 없으면 REST 폴백
  const obSR = wsSR.length > 0 ? wsSR : restSR;

  // ── 데이터 로드 ────────────────────────────

  const isIntraday = timeframe.endsWith("분");

  useEffect(() => {
    const count = timeframe === "년봉" ? 50 : timeframe === "월봉" ? 600 : timeframe === "주봉" ? 600 : 600;
    setChartLoading(true);
    getCandles(market, code, timeframe, count, exchange)
      .then((data) => {
        const chartData = (data.candles ?? []).reverse().map((c) => ({
          time: toChartTime(c.date, isIntraday, market === "US"),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        setCandles(chartData);
      })
      .catch(() => { })
      .finally(() => setChartLoading(false));
  }, [code, market, timeframe]);

  // ETF 감지 및 NAV 로드
  useEffect(() => {
    if (!isDomestic) return;
    getEtfInfo(code)
      .then((info) => {
        setEtfInfo(info || false);
        if (info) getEtfDaily(code).then((d) => setEtfNav(d.rows || [])).catch(() => {});
      })
      .catch(() => setEtfInfo(false));
  }, [code]);

  useEffect(() => {
    getPrice(market, code, exchange)
      .then((data) => setCurrentPrice(data.price))
      .catch(() => { });

    getLines(code, user?.id)
      .then((data) => setLines(data))
      .catch(() => { });

    if (user?.id) {
      getWatchlist(user.id)
        .then((list) => setIsWatchlisted((list || []).some((s) => s.code === code)))
        .catch(() => { });
    }

    searchStocks(code)
      .then((results) => {
        const match = results.find((s) => s.code === code);
        if (match) {
          if (match.name) setStockName((prev) => prev || match.name); // 한글 이름 있으면 유지
          if (!isDomestic && match.exchange) setExchange(match.exchange);
        }
      })
      .catch(() => { });
  }, [code, market, user?.id]);

  const handleWatchlistToggle = useCallback(async () => {
    if (!user?.id) return;
    if (isWatchlisted) {
      await removeStock(code, user.id).catch(() => { });
      setIsWatchlisted(false);
    } else {
      const marketLabel = market === "KOSPI" ? "국내" : "해외";
      await addStock({ code, name: stockName, market: marketLabel, user_id: user.id, exchange: market !== "KOSPI" ? exchange : undefined }).catch(() => { });
      setIsWatchlisted(true);
    }
  }, [isWatchlisted, code, stockName, market, user]);

  // ── 차트 초기화 ────────────────────────────

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    const chart = createChart(chartRef.current, {
      layout: { background: { color: "#1e1e38" }, textColor: "#a0a0c0" },
      grid: { vertLines: { color: "#2a2a4a" }, horzLines: { color: "#2a2a4a" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#2a2a4a" },
      timeScale: {
        borderColor: "#2a2a4a", timeVisible: true, secondsVisible: false,
        minBarSpacing: 1,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      width: chartRef.current.clientWidth,
      height: isMobile ? 300 : 520,
    });

    const cs = chart.addCandlestickSeries({
      upColor: "#ef4444",
      downColor: "#3b82f6",
      borderUpColor: "#ef4444",
      borderDownColor: "#3b82f6",
      wickUpColor: "#ef4444",
      wickDownColor: "#3b82f6",
    });
    cs.setData(candles);
    candleSeries.current = cs;
    chartInstance.current = chart;

    // 타임프레임별 날짜 범위로 표시 구간 설정
    const lastTime = candles[candles.length - 1].time;
    let fromTime;
    if (isIntraday) {
      // 분봉 × 6배 범위 표시
      const minuteVal = parseInt(timeframe);
      fromTime = lastTime - minuteVal * 6 * 60;
    } else {
      const d = new Date(lastTime);
      if (timeframe === "주봉") d.setMonth(d.getMonth() - 1);
      else if (timeframe === "월봉") d.setMonth(d.getMonth() - 6);
      else if (timeframe === "년봉") d.setFullYear(d.getFullYear() - 2);
      else d.setDate(d.getDate() - 7); // 일봉
      fromTime = d.toISOString().slice(0, 10);
    }
    chart.timeScale().setVisibleRange({ from: fromTime, to: lastTime });

    setChartReady((n) => n + 1);

    const onResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartInstance.current = null;
      candleSeries.current = null;
    };
  }, [candles, isMobile]);

  // ── MA 시리즈 ──────────────────────────────

  useEffect(() => {
    if (!chartInstance.current || candles.length === 0) return;
    const chart = chartInstance.current;
    maSeriesRefs.current.forEach((s) => { try { chart.removeSeries(s); } catch { } });
    maSeriesRefs.current = [];
    MA_CONFIG.forEach(({ key, period, color }) => {
      if (!showMA[key]) return;
      const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(calcMA(candles, period));
      maSeriesRefs.current.push(s);
    });
  }, [showMA, candles]);

  // ── 선 렌더링 ──────────────────────────────

  const priceLinesRef = useRef([]);

  useEffect(() => {
    if (!chartInstance.current || !candleSeries.current) return;
    const chart = chartInstance.current;
    const cs = candleSeries.current;

    // 기존 수평선 제거
    priceLinesRef.current.forEach((pl) => { try { cs.removePriceLine(pl); } catch { } });
    priceLinesRef.current = [];

    // 기존 추세선 제거
    Object.values(trendSeriesMap.current).forEach((s) => { try { chart.removeSeries(s); } catch { } });
    trendSeriesMap.current = {};

    lines.forEach((line) => {
      const color = line.color || lineColor(line.signal_type);
      if (line.line_type === "horizontal" && line.price) {
        const pl = cs.createPriceLine({ price: line.price, color, lineWidth: 1.5, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: line.name || "" });
        priceLinesRef.current.push(pl);
      } else if (line.line_type === "trend" && line.x1 && line.x2) {
        const s = chart.addLineSeries({ color, lineWidth: 1.5, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });

        // 캔들 전체 범위로 추세선 연장 (slope/intercept 사용)
        const toTime = (v) => {
          if (typeof v === "number") {
            const d = new Date(v * 1000);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          }
          return v;
        };

        let data;
        if (line.slope != null && line.intercept != null && candles.length >= 2) {
          // "YYYY-MM-DD" → UTC 초 변환
          const toTs = (t) => typeof t === "number" ? t : new Date(t + "T00:00:00Z").getTime() / 1000;
          const tFirst = toTs(candles[0].time);
          const tLast = toTs(candles[candles.length - 1].time);
          data = [
            { time: candles[0].time, value: line.slope * tFirst + line.intercept },
            { time: candles[candles.length - 1].time, value: line.slope * tLast + line.intercept },
          ];
        } else {
          data = [
            { time: toTime(line.x1), value: line.y1 },
            { time: toTime(line.x2), value: line.y2 },
          ];
        }
        s.setData(data);
        trendSeriesMap.current[line.id] = s;
      }
    });
  }, [lines, candles, chartReady]);

  // ── 호가 기반 지지/저항선 차트 표시 ─────────

  const obPriceLinesRef = useRef([]);

  useEffect(() => {
    if (!candleSeries.current) return;
    const cs = candleSeries.current;

    // 이전 호가 기반 선 제거
    obPriceLinesRef.current.forEach((pl) => {
      try { cs.removePriceLine(pl); } catch { }
    });
    obPriceLinesRef.current = [];

    if (!showOrderbookLines || !obSR || obSR.length === 0) return;

    obSR.forEach((sr) => {
      const pl = cs.createPriceLine({
        price: sr.price,
        color: sr.type === "resistance" ? "rgba(91, 141, 239, 0.6)" : "rgba(239, 91, 91, 0.6)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `${sr.type === "resistance" ? "저항" : "지지"} ${sr.ratio}x`,
      });
      obPriceLinesRef.current.push(pl);
    });
  }, [obSR, showOrderbookLines, chartReady]);

  // ── 차트 클릭 (PC 선 긋기) ─────────────────

  useEffect(() => {
    if (!chartInstance.current || !candleSeries.current) return;
    const chart = chartInstance.current;

    const handler = (param) => {
      if (!drawMode || !param.time) return;
      const price = candleSeries.current.coordinateToPrice(param.point.y);
      if (!price) return;
      const point = { time: param.time, value: Math.round(price) };
      setDrawPoints((prev) => {
        const next = [...prev, point];
        if (next.length === 2) {
          setPendingPoints(next.map((p) => ({ date: p.time, price: p.value })));
          setShowModal(true);
          setDrawMode(false);
          return [];
        }
        return next;
      });
    };

    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [drawMode]);

  // ── 저장 / 삭제 ────────────────────────────

  const handleSaveLine = useCallback(async (formData) => {
    const body = {
      stock_code: code,
      timeframe: formData.timeframe,
      line_type: formData.line_type,
      signal_type: formData.signal_type,
      name: formData.name,
      sensitivity: formData.sensitivity,
      price: formData.price ?? null,
      color: formData.color ?? null,
      user_id: user?.id ?? null,
    };

    if (formData.line_type === "trend" && pendingPoints?.length === 2) {
      const [p1, p2] = pendingPoints;
      // "20250101" → "2025-01-01" 변환 (JS Date는 ISO 8601 형식 필요)
      const parseDate = (s) => typeof s === "string" && /^\d{8}$/.test(s)
        ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
        : s;
      const t1 = new Date(parseDate(p1.date)).getTime() / 1000;
      const t2 = new Date(parseDate(p2.date)).getTime() / 1000;
      const slope = (p2.price - p1.price) / (t2 - t1);
      const intercept = p1.price - slope * t1;
      Object.assign(body, { x1: t1, y1: p1.price, x2: t2, y2: p2.price, slope, intercept });
    }

    try {
      const saved = await createLine(body);
      setLines((prev) => [...prev, saved]);
    } catch {
      // API 미연결 시 로컬 상태에만 반영
      setLines((prev) => [...prev, { ...body, id: Date.now() }]);
    }

    setPendingPoints(null);
    setShowModal(false);
  }, [code, pendingPoints]);

  const handleDeleteLine = async (id) => {
    try { await deleteLine(id); } catch { }
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateLine = useCallback(async (id, updates) => {
    try {
      const updated = await updateLine(id, updates);
      setLines((prev) => prev.map((l) => l.id === id ? { ...l, ...updated } : l));
    } catch {
      setLines((prev) => prev.map((l) => l.id === id ? { ...l, ...updates } : l));
    }
    setEditingLine(null);
  }, []);

  // 호가 기반 지지/저항선 → 내 선으로 저장
  const handleSaveOrderbookSR = useCallback(async (sr) => {
    const body = {
      stock_code: code,
      timeframe: "일봉",
      line_type: "horizontal",
      signal_type: sr.type === "resistance" ? "attack" : "loss",
      name: `호가 ${sr.type === "resistance" ? "저항" : "지지"} ${sr.price.toLocaleString()}`,
      price: sr.price,
      sensitivity: 0.5,
      user_id: user?.id ?? null,
    };
    try {
      const saved = await createLine(body);
      setLines((prev) => [...prev, saved]);
    } catch {
      setLines((prev) => [...prev, { ...body, id: Date.now() }]);
    }
  }, [code]);

  // AutoDetectPanel → 두 점 선택 완료
  const handleDetectPoints = (points) => {
    setPendingPoints(points);
    setShowModal(true);
  };

  // ── 가격 표시 ──────────────────────────────

  const lastClose = candles.at(-1)?.close;
  const prevClose = candles.at(-2)?.close;
  const displayPrice = livePrice ?? currentPrice ?? lastClose ?? 0;
  const priceChange = prevClose ? displayPrice - prevClose : 0;
  const pctChange = liveChangePct ?? (prevClose ? ((priceChange / prevClose) * 100).toFixed(2) : "0.00");

  // ── 렌더: 선 목록 ──────────────────────────

  const scrollToLine = (line) => {
    if (!chartInstance.current) return;
    const ts = chartInstance.current.timeScale();
    if (line.line_type === "horizontal" && line.price) {
      // 수평선: 현재 보이는 범위 유지, 가격 축을 해당 가격 중심으로 이동
      const cs = candleSeries.current;
      if (cs) {
        // 가격이 보이도록 차트 범위 내 마지막 캔들로 스크롤 + 가격 하이라이트
        const range = ts.getVisibleLogicalRange();
        if (range) ts.setVisibleLogicalRange(range);
        // 가격 축 포커스를 위해 crosshair 시뮬레이션 대신 fitContent 후 스크롤
        chartInstance.current.priceScale("right").applyOptions({ autoScale: false });
        const mid = line.price;
        const margin = mid * 0.03;
        cs.applyOptions({ autoscaleInfoProvider: undefined });
        setTimeout(() => {
          chartInstance.current.priceScale("right").applyOptions({ autoScale: true });
        }, 100);
      }
    } else if (line.line_type === "trend" && line.x1) {
      // 추세선: 시작점 시간으로 스크롤
      const toTime = (v) => {
        if (typeof v === "number") {
          const d = new Date(v * 1000);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
        return v;
      };
      ts.setVisibleRange({ from: toTime(line.x1), to: toTime(line.x2 || line.x1) });
    }
  };

  const renderLineList = () => (
    <div>
      {lines.length === 0 ? (
        <p style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>설정된 선이 없습니다</p>
      ) : (
        lines.map((line, i) => {
          const color = line.color || lineColor(line.signal_type);
          const target = line.line_type === "horizontal" ? line.price : line.y2;
          const dist = target && displayPrice ? ((displayPrice - target) / target * 100).toFixed(2) : null;
          return (
            <div key={line.id} onClick={() => scrollToLine(line)} style={{ padding: "14px 20px", borderBottom: i < lines.length - 1 ? B : "none", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 14, height: 2.5, background: color, borderRadius: 1 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{line.name || "이름 없음"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingLine(line); }}
                    style={{ border: "none", background: "none", cursor: "pointer", padding: "4px 6px", color: "var(--color-text-tertiary)", lineHeight: 0 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteLine(line.id); }}
                    style={{ border: "none", background: "none", fontSize: 18, color: "var(--color-text-tertiary)", cursor: "pointer", padding: "0 4px" }}
                  >×</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                  {line.timeframe}
                </span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: line.signal_type === "loss" ? "var(--color-background-danger)" : "var(--color-background-success)", color }}>
                  {line.signal_type === "loss" ? "지지선" : "저항선"}
                </span>
                {target && (
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {isDomestic ? target.toLocaleString() + "원" : "$" + target.toLocaleString()}
                  </span>
                )}
                {dist !== null && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: Number(dist) > 0 ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
                    {Number(dist) > 0 ? "+" : ""}{dist}%
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
      <div style={{ padding: "12px 20px" }}>
        <button
          onClick={() => { setPendingPoints(null); setShowModal(true); }}
          style={{
            width: "100%", padding: "13px 0", fontSize: 14, fontWeight: 600,
            background: "var(--btn-active-bg)", color: "var(--btn-active-text)",
            border: "none", borderRadius: 12, cursor: "pointer",
          }}
        >
          + 선 추가
        </button>
      </div>
    </div>
  );

  // ── 렌더링 ─────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-secondary)", paddingBottom: isMobile ? 20 : 0 }}>

      {/* 헤더 — 모바일 전용 (PC는 TopNav 사용) */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--header-bg)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: B,
        display: isMobile ? "block" : "none",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
        <div style={{ height: 54, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => navigate("/")} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px 0", fontSize: 20, color: "var(--color-text-secondary)", lineHeight: 1 }}>←</button>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>{stockName || code}</span>
              {stockName && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>{code}</span>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={handleWatchlistToggle}
              style={{ border: "none", background: "none", cursor: "pointer", padding: 4, fontSize: 20, lineHeight: 1, color: isWatchlisted ? "#f59e0b" : "var(--color-text-tertiary)" }}
              title={isWatchlisted ? "관심목록에서 제거" : "관심목록에 추가"}
            >
              {isWatchlisted ? "★" : "☆"}
            </button>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
                {isDomestic ? displayPrice.toLocaleString() + "원" : "$" + displayPrice.toLocaleString()}
              </p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: priceChange >= 0 ? "var(--color-rise)" : "var(--color-fall)" }}>
                {priceChange >= 0 ? "▲" : "▼"}{Math.abs(priceChange).toLocaleString()} ({priceChange >= 0 ? "+" : ""}{pctChange}%)
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* PC 전용: 종목 정보 바 */}
      {!isMobile && (
        <div style={{ padding: "20px 32px 0", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}>{stockName || code}</span>
          {stockName && <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>{code}</span>}
          <button
            onClick={handleWatchlistToggle}
            style={{ border: "none", background: "none", cursor: "pointer", padding: "2px 4px", fontSize: 22, lineHeight: 1, color: isWatchlisted ? "#f59e0b" : "var(--color-text-tertiary)" }}
            title={isWatchlisted ? "관심목록에서 제거" : "관심목록에 추가"}
          >
            {isWatchlisted ? "★" : "☆"}
          </button>
          <span style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)" }}>
            {isDomestic ? displayPrice.toLocaleString() + "원" : "$" + displayPrice.toLocaleString()}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: priceChange >= 0 ? "var(--color-rise)" : "var(--color-fall)" }}>
            {priceChange >= 0 ? "▲" : "▼"}{Math.abs(priceChange).toLocaleString()} ({priceChange >= 0 ? "+" : ""}{pctChange}%)
          </span>
        </div>
      )}

      {/* ETF 정보 */}
      {etfInfo && (
        <div style={{
          display: "flex", gap: 8, padding: isMobile ? "10px 20px" : "10px 32px",
          background: "var(--color-background-secondary)", borderBottom: B, flexWrap: "wrap", alignItems: "center",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "var(--color-background-info)", color: "var(--color-text-info)" }}>ETF</span>
          {etfNav[0]?.nav != null && (
            <>
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>NAV</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>
                {etfNav[0].nav.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원
              </span>
              {etfNav[0].nav_diff && etfNav[0].nav_diff !== "0.00" && (
                <span style={{ fontSize: 11, color: etfNav[0].nav_diff.startsWith("-") ? "var(--color-fall)" : "var(--color-rise)" }}>
                  (NAV-ETF {etfNav[0].nav_diff}%)
                </span>
              )}
            </>
          )}
          {etfInfo.txon_type && (
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: "auto" }}>{etfInfo.txon_type}</span>
          )}
        </div>
      )}

      {/* 봉 종류 + MA 탭 */}
      <div className="hide-scrollbar" style={{ display: "flex", gap: 8, padding: isMobile ? "12px 20px" : "12px 32px", overflowX: showMinuteDropdown ? "visible" : "auto", overflowY: showMinuteDropdown ? "visible" : "hidden", background: "var(--color-background-primary)", borderBottom: B, maxWidth: isMobile ? "100%" : "100%", margin: "0 auto", width: "100%", boxSizing: "border-box", position: "relative", zIndex: 15 }}>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => { setTimeframe(tf); setShowMinuteDropdown(false); }}
            style={{
              flexShrink: 0, padding: "6px 14px", fontSize: 13, borderRadius: 20, border: B,
              fontWeight: timeframe === tf ? 600 : 400,
              background: timeframe === tf ? "var(--btn-active-bg)" : "transparent",
              color: timeframe === tf ? "var(--btn-active-text)" : "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            {tf}
          </button>
        ))}
        {/* 분봉 드롭다운 */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowMinuteDropdown((v) => !v)}
            style={{
              padding: "6px 14px", fontSize: 13, borderRadius: 20, border: B,
              fontWeight: isIntraday ? 600 : 400,
              background: isIntraday ? "var(--btn-active-bg)" : "transparent",
              color: isIntraday ? "var(--btn-active-text)" : "var(--color-text-secondary)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {isIntraday ? timeframe : "분봉"}
            <span style={{ fontSize: 10, lineHeight: 1 }}>▾</span>
          </button>
          {showMinuteDropdown && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
              background: "var(--color-background-primary)", border: B,
              borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              overflow: "hidden", minWidth: 80,
            }}>
              {MINUTE_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => { setTimeframe(`${m}분`); setShowMinuteDropdown(false); }}
                  style={{
                    display: "block", width: "100%", padding: "8px 14px", fontSize: 13,
                    border: "none", borderBottom: `1px solid var(--color-background-secondary)`,
                    background: timeframe === `${m}분` ? "var(--color-background-secondary)" : "transparent",
                    color: timeframe === `${m}분` ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontWeight: timeframe === `${m}분` ? 600 : 400,
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  {m}분
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ width: 1, background: B, flexShrink: 0, margin: "2px 4px" }} />
        {MA_CONFIG.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setShowMA((prev) => ({ ...prev, [key]: !prev[key] }))}
            style={{
              flexShrink: 0, padding: "6px 12px", fontSize: 12, borderRadius: 20, border: B,
              fontWeight: showMA[key] ? 600 : 400,
              background: showMA[key] ? color + "22" : "transparent",
              color: showMA[key] ? color : "var(--color-text-tertiary)",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
        {isDomestic && (
          <>
            <div style={{ width: 1, background: B, flexShrink: 0, margin: "2px 4px" }} />
            <button
              onClick={() => setShowOrderbookLines((prev) => !prev)}
              style={{
                flexShrink: 0, padding: "6px 12px", fontSize: 12, borderRadius: 20, border: B,
                fontWeight: showOrderbookLines ? 600 : 400,
                background: showOrderbookLines ? "rgba(91, 141, 239, 0.15)" : "transparent",
                color: showOrderbookLines ? "#5b8def" : "var(--color-text-tertiary)",
                cursor: "pointer",
              }}
            >
              호가 지지/저항
            </button>
          </>
        )}
      </div>

      {/* PC: 레이아웃 */}
      {!isMobile && (
        <div style={{ padding: "20px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* 상단: 차트(좌) + 내 선(우) */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 24 }}>
            {/* 차트 */}
            <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {drawMode ? (drawPoints.length === 0 ? "① 첫 번째 고점을 클릭하세요" : "② 두 번째 고점을 클릭하세요") : "차트 클릭으로 고점 선택"}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => { setDrawMode(false); setDrawPoints([]); }} style={{ padding: "4px 12px", fontSize: 11, borderRadius: 20, border: B, background: !drawMode ? "var(--btn-active-bg)" : "transparent", color: !drawMode ? "var(--btn-active-text)" : "var(--color-text-secondary)", cursor: "pointer" }}>보기</button>
                  <button onClick={() => setDrawMode(true)} style={{ padding: "4px 12px", fontSize: 11, borderRadius: 20, border: B, background: drawMode ? "var(--btn-active-bg)" : "transparent", color: drawMode ? "var(--btn-active-text)" : "var(--color-text-secondary)", cursor: "pointer" }}>선 긋기</button>
                </div>
              </div>
              <div style={{ position: "relative" }}>
                {chartLoading && (
                  <div style={{
                    position: "absolute", inset: 0, zIndex: 5,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(30,30,56,0.7)", borderRadius: 8,
                    minHeight: 80,
                  }}>
                    <span style={{ color: "#a0a0c0", fontSize: 13 }}>차트 불러오는 중...</span>
                  </div>
                )}
                <div ref={chartRef} style={{ width: "100%", cursor: drawMode ? "crosshair" : "default" }} />
              </div>
            </div>

            {/* 내 선 */}
            <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
              <div style={{ padding: "12px 20px", borderBottom: B }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>내 선 ({lines.length})</span>
              </div>
              {renderLineList()}
            </div>
          </div>

          {/* 하단: 호가 + 투자자별 (국내 종목만, 좌우 균등) */}
          {isDomestic && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* 호가 */}
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: B }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>호가</span>
                </div>
                <OrderbookPanel
                  market={market}
                  code={code}
                  exchange={exchange}
                  onSaveSupportResistance={handleSaveOrderbookSR}
                />
              </div>

              {/* 투자자별 매매동향 */}
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: B }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>투자자</span>
                </div>
                <InvestorPanel market={market} code={code} />
              </div>
            </div>
          )}

        </div>
      )}

      {/* 모바일: 단일 컬럼 */}
      {isMobile && (
        <>
          {/* 차트 + 플로팅 선 긋기 버튼 */}
          <div style={{ background: "var(--color-background-primary)", borderBottom: B, position: "relative" }}>
            {chartLoading && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 5,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(30,30,56,0.7)",
                minHeight: 80,
              }}>
                <span style={{ color: "#a0a0c0", fontSize: 13 }}>차트 불러오는 중...</span>
              </div>
            )}
            <div ref={chartRef} style={{ width: "100%" }} />
            {/* 플로팅 버튼 */}
            <button
              onClick={() => { setDrawMode(!drawMode); setDrawPoints([]); }}
              style={{
                position: "absolute", bottom: 12, right: 12, zIndex: 10,
                width: 40, height: 40, borderRadius: "50%",
                border: "none", cursor: "pointer",
                background: drawMode ? "var(--btn-active-bg)" : "rgba(255,255,255,0.9)",
                color: drawMode ? "var(--btn-active-text)" : "var(--color-text-secondary)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
            {/* 안내 텍스트 */}
            {drawMode && (
              <div style={{
                position: "absolute", bottom: 12, left: 12, right: 60, zIndex: 10,
                background: "rgba(0,0,0,0.7)", borderRadius: 8,
                padding: "6px 10px", fontSize: 11, color: "#fff", fontWeight: 500,
              }}>
                {drawPoints.length === 0 ? "① 첫 번째 점을 터치하세요" : "② 두 번째 점을 터치하세요"}
              </div>
            )}
          </div>

          {/* 모바일 패널 탭 */}
          <div style={{ background: "var(--color-background-primary)", borderBottom: B, display: "flex" }}>
            {[
              { key: "lines", label: `선 목록 (${lines.length})` },
              { key: "orderbook", label: "호가" },
              { key: "investor", label: "투자자" },
              { key: "detect", label: "고/저점 탐지" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMobileTab(key)}
                style={{
                  flex: 1, padding: "12px 0", fontSize: 13, fontWeight: mobileTab === key ? 700 : 400,
                  background: "transparent", border: "none",
                  borderBottom: mobileTab === key ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                  color: mobileTab === key ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 패널 내용 */}
          <div style={{ background: "var(--color-background-primary)" }}>
            {mobileTab === "lines" && renderLineList()}
            {mobileTab === "orderbook" && (
              <OrderbookPanel
                market={market}
                code={code}
                onSaveSupportResistance={handleSaveOrderbookSR}
              />
            )}
            {mobileTab === "investor" && (
              <InvestorPanel market={market} code={code} />
            )}
            {mobileTab === "detect" && (
              <AutoDetectPanel
                market={market}
                code={code}
                timeframe={timeframe}
                onPointsSelected={handleDetectPoints}
              />
            )}
          </div>
        </>
      )}

      {/* 선 편집 시트 */}
      {editingLine && (
        <EditLineSheet
          line={editingLine}
          onClose={() => setEditingLine(null)}
          onSave={handleUpdateLine}
        />
      )}

      {/* 선 추가 모달 */}
      {showModal && (
        <AddLineModal
          onClose={() => { setShowModal(false); setPendingPoints(null); }}
          onSave={handleSaveLine}
          preselectedType={pendingPoints ? "trend" : null}
          defaultTimeframe={timeframe}
          currentPrice={displayPrice || null}
        />
      )}
    </div>
  );
}
