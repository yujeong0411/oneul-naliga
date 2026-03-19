import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";
import AddLineModal from "../components/AddLineModal";
import AutoDetectPanel from "../components/AutoDetectPanel";
import OrderbookPanel from "../components/OrderbookPanel";
import InvestorPanel from "../components/InvestorPanel";
import { getCandles, getPrice, detectMarket, searchStocks } from "../api/stocks";
import { useLivePrice } from "../hooks/useLivePrice";
import { useOrderbook } from "../hooks/useOrderbook";
import { getLines, createLine, deleteLine } from "../api/lines";

const B = "var(--border-tertiary)";
const TIMEFRAMES = ["일봉", "주봉", "월봉", "년봉"];
const MINUTE_OPTIONS = [1, 3, 5, 10, 15, 30, 60];
const MA_CONFIG = [
  { key: "ma5",  period: 5,  color: "#f59e0b", label: "MA5" },
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

function toChartTime(dateStr, isIntraday) {
  if (isIntraday) {
    // "20250917132000" (14자리, YYYYMMDDHHmmss) → Unix timestamp (KST)
    const y  = dateStr.slice(0, 4);
    const mo = dateStr.slice(4, 6);
    const d  = dateStr.slice(6, 8);
    const h  = dateStr.slice(8, 10);
    const m  = dateStr.slice(10, 12);
    return Math.floor(new Date(`${y}-${mo}-${d}T${h}:${m}:00+09:00`).getTime() / 1000);
  }
  // "20241101" → "2024-11-01"
  return dateStr.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
}

function lineColor(signalType) {
  return signalType === "loss" ? "#c05858" : "#3a9e62";
}

// ── 컴포넌트 ──────────────────────────────────

export default function ChartDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const market = detectMarket(code);

  const chartRef         = useRef(null);
  const chartInstance    = useRef(null);
  const candleSeries     = useRef(null);
  const maSeriesRefs     = useRef([]);
  const trendSeriesMap   = useRef({});

  const [candles,     setCandles]     = useState([]);
  const [lines,       setLines]       = useState([]);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [timeframe,   setTimeframe]   = useState("일봉");
  const [showMA,      setShowMA]      = useState({ ma5: true, ma20: true, ma60: false });
  const [drawMode,    setDrawMode]    = useState(false);
  const [drawPoints,  setDrawPoints]  = useState([]);
  const [showModal,   setShowModal]   = useState(false);
  const [pendingPoints, setPendingPoints] = useState(null);
  const [mobileTab,   setMobileTab]   = useState("lines"); // "lines" | "detect" | "orderbook"
  const [showOrderbookLines, setShowOrderbookLines] = useState(true);
  const [showMinuteDropdown, setShowMinuteDropdown] = useState(false);
  const [stockName, setStockName] = useState("");

  const isDomestic    = /^\d{6}$/.test(code);
  const { price: livePrice, change_pct: liveChangePct } = useLivePrice(isDomestic ? code : null);
  const { supportResistance: obSR } = useOrderbook(isDomestic ? code : null);

  // ── 데이터 로드 ────────────────────────────

  const isIntraday = timeframe.endsWith("분");

  useEffect(() => {
    const count = timeframe === "년봉" ? 30 : timeframe === "월봉" ? 120 : timeframe === "주봉" ? 150 : 300;
    getCandles(market, code, timeframe, count)
      .then((data) => {
        const chartData = (data.candles ?? []).reverse().map((c) => ({
          time:  toChartTime(c.date, isIntraday),
          open:  c.open,
          high:  c.high,
          low:   c.low,
          close: c.close,
        }));
        setCandles(chartData);
      })
      .catch(() => {});
  }, [code, market, timeframe]);

  useEffect(() => {
    getPrice(market, code)
      .then((data) => setCurrentPrice(data.price))
      .catch(() => {});

    getLines(code)
      .then((data) => setLines(data))
      .catch(() => {});

    searchStocks(code)
      .then((results) => {
        const match = results.find((s) => s.code === code);
        if (match) setStockName(match.name);
      })
      .catch(() => {});
  }, [code, market]);

  // ── 차트 초기화 ────────────────────────────

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    const chart = createChart(chartRef.current, {
      layout: { background: { color: "#1e1e38" }, textColor: "#a0a0c0" },
      grid: { vertLines: { color: "#2a2a4a" }, horzLines: { color: "#2a2a4a" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#2a2a4a" },
      timeScale: { borderColor: "#2a2a4a", timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      width:  chartRef.current.clientWidth,
      height: isMobile ? 300 : 520,
    });

    const cs = chart.addCandlestickSeries({
      upColor:        "#3a9e62",
      downColor:      "#c05858",
      borderUpColor:  "#3a9e62",
      borderDownColor:"#c05858",
      wickUpColor:    "#3a9e62",
      wickDownColor:  "#c05858",
    });
    cs.setData(candles);
    candleSeries.current  = cs;
    chartInstance.current = chart;

    const onResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartInstance.current = null;
      candleSeries.current  = null;
    };
  }, [candles, isMobile]);

  // ── MA 시리즈 ──────────────────────────────

  useEffect(() => {
    if (!chartInstance.current || candles.length === 0) return;
    const chart = chartInstance.current;
    maSeriesRefs.current.forEach((s) => { try { chart.removeSeries(s); } catch {} });
    maSeriesRefs.current = [];
    MA_CONFIG.forEach(({ key, period, color }) => {
      if (!showMA[key]) return;
      const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(calcMA(candles, period));
      maSeriesRefs.current.push(s);
    });
  }, [showMA, candles]);

  // ── 선 렌더링 ──────────────────────────────

  useEffect(() => {
    if (!chartInstance.current || !candleSeries.current) return;
    const chart = chartInstance.current;

    // 기존 추세선 제거
    Object.values(trendSeriesMap.current).forEach((s) => { try { chart.removeSeries(s); } catch {} });
    trendSeriesMap.current = {};

    // 캔들 시리즈 교체 (수평선 확실히 초기화)
    try { chart.removeSeries(candleSeries.current); } catch {}
    const cs = chart.addCandlestickSeries({
      upColor: "#3a9e62", downColor: "#c05858",
      borderUpColor: "#3a9e62", borderDownColor: "#c05858",
      wickUpColor: "#3a9e62", wickDownColor: "#c05858",
    });
    cs.setData(candles);
    candleSeries.current = cs;

    lines.forEach((line) => {
      const color = lineColor(line.signal_type);
      if (line.line_type === "horizontal" && line.price) {
        cs.createPriceLine({ price: line.price, color, lineWidth: 1.5, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: line.name || "" });
      } else if (line.line_type === "trend" && line.x1 && line.x2) {
        const s = chart.addLineSeries({ color, lineWidth: 1.5, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
        s.setData([
          { time: line.x1, value: line.y1 },
          { time: line.x2, value: line.y2 },
        ]);
        trendSeriesMap.current[line.id] = s;
      }
    });
  }, [lines, candles]);

  // ── 호가 기반 지지/저항선 차트 표시 ─────────

  const obPriceLinesRef = useRef([]);

  useEffect(() => {
    if (!candleSeries.current) return;
    const cs = candleSeries.current;

    // 이전 호가 기반 선 제거
    obPriceLinesRef.current.forEach((pl) => {
      try { cs.removePriceLine(pl); } catch {}
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
  }, [obSR, showOrderbookLines]);

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
      stock_code:  code,
      timeframe:   formData.timeframe,
      line_type:   formData.line_type,
      signal_type: formData.signal_type,
      name:        formData.name,
      sensitivity: formData.sensitivity,
      price:       formData.price ?? null,
    };

    if (formData.line_type === "trend" && pendingPoints?.length === 2) {
      const [p1, p2] = pendingPoints;
      const t1 = new Date(p1.date).getTime() / 1000;
      const t2 = new Date(p2.date).getTime() / 1000;
      const slope     = (p2.price - p1.price) / (t2 - t1);
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
    try { await deleteLine(id); } catch {}
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

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

  const lastClose  = candles.at(-1)?.close;
  const prevClose  = candles.at(-2)?.close;
  const displayPrice  = livePrice ?? currentPrice ?? lastClose ?? 0;
  const priceChange   = prevClose ? displayPrice - prevClose : 0;
  const pctChange     = liveChangePct ?? (prevClose ? ((priceChange / prevClose) * 100).toFixed(2) : "0.00");

  // ── 렌더: 선 목록 ──────────────────────────

  const renderLineList = () => (
    <div>
      {lines.length === 0 ? (
        <p style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>설정된 선이 없습니다</p>
      ) : (
        lines.map((line, i) => {
          const color   = lineColor(line.signal_type);
          const target  = line.line_type === "horizontal" ? line.price : line.y2;
          const dist    = target && displayPrice ? ((displayPrice - target) / target * 100).toFixed(2) : null;
          return (
            <div key={line.id} style={{ padding: "14px 20px", borderBottom: i < lines.length - 1 ? B : "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 14, height: 2.5, background: color, borderRadius: 1 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{line.name || "이름 없음"}</span>
                </div>
                <button
                  onClick={() => handleDeleteLine(line.id)}
                  style={{ border: "none", background: "none", fontSize: 18, color: "var(--color-text-tertiary)", cursor: "pointer", padding: "0 4px" }}
                >×</button>
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
            background: "var(--color-background-secondary)", color: "var(--color-text-primary)",
            border: B, borderRadius: 12, cursor: "pointer",
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
        background: "var(--color-background-primary)",
        borderBottom: B, height: 54,
        padding: "0 20px",
        display: isMobile ? "flex" : "none", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate("/")} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px 0", fontSize: 20, color: "var(--color-text-secondary)", lineHeight: 1 }}>←</button>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>{stockName || code}</span>
            {stockName && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-text-tertiary)" }}>{code}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
            {isDomestic ? displayPrice.toLocaleString() + "원" : "$" + displayPrice.toLocaleString()}
          </p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: priceChange >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
            {priceChange >= 0 ? "+" : ""}{pctChange}%
          </p>
        </div>
      </header>

      {/* PC 전용: 종목 정보 바 */}
      {!isMobile && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 32px 0", display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}>{stockName || code}</span>
          {stockName && <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>{code}</span>}
          <span style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)" }}>
            {isDomestic ? displayPrice.toLocaleString() + "원" : "$" + displayPrice.toLocaleString()}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: priceChange >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
            {priceChange >= 0 ? "+" : ""}{pctChange}%
          </span>
        </div>
      )}

      {/* 봉 종류 + MA 탭 */}
      <div className="hide-scrollbar" style={{ display: "flex", gap: 8, padding: isMobile ? "12px 20px" : "12px 32px", overflowX: showMinuteDropdown ? "visible" : "auto", overflowY: showMinuteDropdown ? "visible" : "hidden", background: "var(--color-background-primary)", borderBottom: B, maxWidth: isMobile ? "100%" : 1400, margin: "0 auto", width: "100%", boxSizing: "border-box", position: "relative", zIndex: 15 }}>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => { setTimeframe(tf); setShowMinuteDropdown(false); }}
            style={{
              flexShrink: 0, padding: "6px 14px", fontSize: 13, borderRadius: 20, border: B,
              fontWeight: timeframe === tf ? 600 : 400,
              background: timeframe === tf ? "var(--color-text-primary)" : "transparent",
              color: timeframe === tf ? "white" : "var(--color-text-secondary)",
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
              background: isIntraday ? "var(--color-text-primary)" : "transparent",
              color: isIntraday ? "white" : "var(--color-text-secondary)",
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

      {/* PC: 2열 레이아웃 */}
      {!isMobile && (
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 32px", display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 20 }}>
          {/* 차트 */}
          <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                {drawMode ? (drawPoints.length === 0 ? "① 첫 번째 고점을 클릭하세요" : "② 두 번째 고점을 클릭하세요") : "차트 클릭으로 고점 선택"}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setDrawMode(false); setDrawPoints([]); }} style={{ padding: "4px 12px", fontSize: 11, borderRadius: 20, border: B, background: !drawMode ? "var(--color-text-primary)" : "transparent", color: !drawMode ? "white" : "var(--color-text-secondary)", cursor: "pointer" }}>보기</button>
                <button onClick={() => setDrawMode(true)} style={{ padding: "4px 12px", fontSize: 11, borderRadius: 20, border: B, background: drawMode ? "var(--color-text-primary)" : "transparent", color: drawMode ? "white" : "var(--color-text-secondary)", cursor: "pointer" }}>선 긋기</button>
              </div>
            </div>
            <div ref={chartRef} style={{ width: "100%", cursor: drawMode ? "crosshair" : "default" }} />
          </div>

          {/* 사이드바: 탭 전환 (내 선 / 호가) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* 내 선 */}
            <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
              <div style={{ padding: "12px 20px", borderBottom: B }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>내 선 ({lines.length})</span>
              </div>
              {renderLineList()}
            </div>

            {/* 호가 (국내 종목만) */}
            {isDomestic && (
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: B }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>호가</span>
                </div>
                <OrderbookPanel
                  market={market}
                  code={code}
                  onSaveSupportResistance={handleSaveOrderbookSR}
                />
              </div>
            )}

            {/* 투자자별 매매동향 (국내 종목만) */}
            {isDomestic && (
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
                <div style={{ padding: "12px 20px", borderBottom: B }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>투자자</span>
                </div>
                <InvestorPanel market={market} code={code} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 모바일: 단일 컬럼 */}
      {isMobile && (
        <>
          {/* 차트 + 플로팅 선 긋기 버튼 */}
          <div style={{ background: "var(--color-background-primary)", borderBottom: B, position: "relative" }}>
            <div ref={chartRef} style={{ width: "100%" }} />
            {/* 플로팅 버튼 */}
            <button
              onClick={() => { setDrawMode(!drawMode); setDrawPoints([]); }}
              style={{
                position: "absolute", bottom: 12, right: 12, zIndex: 10,
                width: 40, height: 40, borderRadius: "50%",
                border: "none", cursor: "pointer",
                background: drawMode ? "var(--color-text-primary)" : "rgba(255,255,255,0.9)",
                color: drawMode ? "#fff" : "var(--color-text-secondary)",
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
              { key: "lines",     label: `선 목록 (${lines.length})` },
              { key: "orderbook", label: "호가" },
              { key: "investor",  label: "투자자" },
              { key: "detect",    label: "고점 탐지" },
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

      {/* 선 추가 모달 */}
      {showModal && (
        <AddLineModal
          onClose={() => { setShowModal(false); setPendingPoints(null); }}
          onSave={handleSaveLine}
          preselectedType={pendingPoints ? "trend" : null}
          defaultTimeframe={timeframe}
        />
      )}
    </div>
  );
}
