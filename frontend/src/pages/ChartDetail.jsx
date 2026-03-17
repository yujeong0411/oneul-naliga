import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";
import AddLineModal from "../components/AddLineModal";

const TIMEFRAMES = ["일봉", "주봉", "월봉"];

// 목업 캔들 데이터 (실제로는 API에서 가져옴)
const mockCandles = [
  { time: "2024-11-01", open: 68000, high: 70500, low: 67500, close: 70000 },
  { time: "2024-11-04", open: 70000, high: 71800, low: 69200, close: 71200 },
  { time: "2024-11-05", open: 71200, high: 73000, low: 70800, close: 72500 },
  { time: "2024-11-06", open: 72500, high: 74200, low: 71500, close: 73800 },
  { time: "2024-11-07", open: 73800, high: 75000, low: 72000, close: 72800 },
  { time: "2024-11-08", open: 72800, high: 74500, low: 71000, close: 71500 },
  { time: "2024-11-11", open: 71500, high: 73200, low: 70000, close: 72000 },
  { time: "2024-11-12", open: 72000, high: 73800, low: 71200, close: 73200 },
  { time: "2024-11-13", open: 73200, high: 76200, low: 72500, close: 75800 },
  { time: "2024-11-14", open: 75800, high: 77000, low: 74000, close: 74500 },
  { time: "2024-11-15", open: 74500, high: 75500, low: 72800, close: 73000 },
  { time: "2024-11-18", open: 73000, high: 74200, low: 71500, close: 72000 },
  { time: "2024-11-19", open: 72000, high: 73500, low: 70800, close: 71200 },
  { time: "2024-11-20", open: 71200, high: 72800, low: 69500, close: 70500 },
  { time: "2024-11-21", open: 70500, high: 72000, low: 69000, close: 71800 },
  { time: "2024-11-22", open: 71800, high: 73200, low: 71000, close: 72500 },
  { time: "2024-11-25", open: 72500, high: 74800, low: 71800, close: 74200 },
  { time: "2024-11-26", open: 74200, high: 75500, low: 73000, close: 73500 },
  { time: "2024-11-27", open: 73500, high: 74800, low: 72000, close: 72800 },
  { time: "2024-11-28", open: 72800, high: 74000, low: 71500, close: 73200 },
  { time: "2024-12-02", open: 73200, high: 74500, low: 72000, close: 74000 },
  { time: "2024-12-03", open: 74000, high: 75200, low: 73200, close: 74800 },
  { time: "2024-12-04", open: 74800, high: 76500, low: 74000, close: 75500 },
  { time: "2024-12-05", open: 75500, high: 77200, low: 74800, close: 76200 },
  { time: "2024-12-06", open: 76200, high: 78900, low: 75500, close: 78500 },
  { time: "2024-12-09", open: 78500, high: 79500, low: 76000, close: 76800 },
  { time: "2024-12-10", open: 76800, high: 77500, low: 74500, close: 75000 },
  { time: "2024-12-11", open: 75000, high: 76200, low: 73500, close: 74200 },
  { time: "2024-12-12", open: 74200, high: 75000, low: 72800, close: 73500 },
  { time: "2024-12-13", open: 73500, high: 74800, low: 72500, close: 74000 },
  { time: "2024-12-16", open: 74000, high: 75500, low: 73200, close: 75000 },
  { time: "2024-12-17", open: 75000, high: 76800, low: 74500, close: 76200 },
  { time: "2024-12-18", open: 76200, high: 77500, low: 75000, close: 75800 },
  { time: "2024-12-19", open: 75800, high: 76500, low: 74200, close: 74800 },
  { time: "2024-12-20", open: 74800, high: 75500, low: 73000, close: 73800 },
  { time: "2024-12-23", open: 73800, high: 74800, low: 72500, close: 74200 },
  { time: "2024-12-24", open: 74200, high: 75000, low: 73000, close: 73500 },
  { time: "2024-12-26", open: 73500, high: 74500, low: 72200, close: 74000 },
  { time: "2024-12-27", open: 74000, high: 75200, low: 73200, close: 74500 },
  { time: "2025-01-02", open: 74500, high: 76000, low: 74000, close: 75500 },
  { time: "2025-01-03", open: 75500, high: 77000, low: 75000, close: 76500 },
  { time: "2025-01-06", open: 76500, high: 77800, low: 75800, close: 77200 },
  { time: "2025-01-07", open: 77200, high: 78500, low: 76500, close: 77800 },
  { time: "2025-01-08", open: 77800, high: 79200, low: 77000, close: 78500 },
  { time: "2025-01-09", open: 78500, high: 80000, low: 77800, close: 79200 },
  { time: "2025-01-10", open: 79200, high: 80500, low: 78000, close: 78800 },
  { time: "2025-01-13", open: 78800, high: 79500, low: 76500, close: 77000 },
  { time: "2025-01-14", open: 77000, high: 77800, low: 75500, close: 76200 },
  { time: "2025-01-15", open: 76200, high: 77500, low: 75000, close: 76800 },
  { time: "2025-01-16", open: 76800, high: 77200, low: 75200, close: 75500 },
  { time: "2025-01-17", open: 75500, high: 76200, low: 73800, close: 74500 },
  { time: "2025-01-20", open: 74500, high: 75500, low: 73200, close: 75000 },
  { time: "2025-01-21", open: 75000, high: 76200, low: 74200, close: 75800 },
  { time: "2025-01-22", open: 75800, high: 76800, low: 74800, close: 76200 },
  { time: "2025-01-23", open: 76200, high: 77500, low: 75500, close: 77000 },
  { time: "2025-01-24", open: 77000, high: 79200, low: 76500, close: 78900 },
  { time: "2025-01-27", open: 78900, high: 80000, low: 77500, close: 78000 },
  { time: "2025-01-28", open: 78000, high: 78800, low: 76800, close: 77500 },
  { time: "2025-01-29", open: 77500, high: 78200, low: 75800, close: 76500 },
  { time: "2025-01-30", open: 76500, high: 77200, low: 75000, close: 75800 },
  { time: "2025-02-03", open: 75800, high: 76500, low: 74200, close: 74800 },
  { time: "2025-02-04", open: 74800, high: 75800, low: 73500, close: 75200 },
  { time: "2025-02-05", open: 75200, high: 76500, low: 74500, close: 76000 },
  { time: "2025-02-06", open: 76000, high: 77200, low: 75200, close: 76800 },
  { time: "2025-02-07", open: 76800, high: 77800, low: 76000, close: 77200 },
  { time: "2025-02-10", open: 77200, high: 78200, low: 76500, close: 77800 },
  { time: "2025-02-11", open: 77800, high: 78800, low: 77000, close: 78200 },
  { time: "2025-02-12", open: 78200, high: 79500, low: 77500, close: 79000 },
  { time: "2025-02-13", open: 79000, high: 80200, low: 78200, close: 79800 },
  { time: "2025-02-14", open: 79800, high: 80800, low: 78800, close: 80000 },
];

// 이동평균 계산
function calcMA(candles, period) {
  return candles
    .map((c, i) => {
      if (i < period - 1) return null;
      const slice = candles.slice(i - period + 1, i + 1);
      const avg = slice.reduce((sum, x) => sum + x.close, 0) / period;
      return { time: c.time, value: Math.round(avg) };
    })
    .filter(Boolean);
}

export default function ChartDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const trendSeriesMapRef = useRef({}); // lineId -> series

  const [timeframe, setTimeframe] = useState("일봉");
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]); // [{time, value}, ...]
  const [lines, setLines] = useState([
    {
      id: 1,
      name: "저항 추세선",
      type: "trend",
      signalType: "loss",
      color: "#ef4444",
      targetPrice: 79200,
      distance: 1.5,
      x1: "2025-01-13", y1: 77000,
      x2: "2025-01-24", y2: 78900,
    },
    {
      id: 2,
      name: "수평 지지선",
      type: "horizontal",
      signalType: "attack",
      color: "#3b82f6",
      targetPrice: 70000,
      distance: -10.1,
    },
  ]);
  const [showModal, setShowModal] = useState(false);
  const [pendingTrendPoints, setPendingTrendPoints] = useState(null);
  const [sensitivity, setSensitivity] = useState(2);
  const [alertOn, setAlertOn] = useState(true);
  const [showMA, setShowMA] = useState({ ma5: true, ma20: true, ma60: false });

  const stockName = code === "005930" ? "삼성전자" : code;
  const currentPrice = mockCandles[mockCandles.length - 1].close;

  // 차트 초기화
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      layout: {
        background: { color: "#ffffff" },
        textColor: "#1a1a1a",
      },
      grid: {
        vertLines: { color: "#f0ebe0" },
        horzLines: { color: "#f0ebe0" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#e8e0d0" },
      timeScale: {
        borderColor: "#e8e0d0",
        timeVisible: true,
      },
      width: chartRef.current.clientWidth,
      height: 380,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    candleSeries.setData(mockCandles);
    candleSeriesRef.current = candleSeries;
    chartInstanceRef.current = chart;

    // 창 크기 대응
    const handleResize = () => {
      chart.applyOptions({ width: chartRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // 이동평균선 토글
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    const chart = chartInstanceRef.current;

    // 기존 MA 시리즈 제거 후 재생성
    if (chartRef.current._maSeries) {
      chartRef.current._maSeries.forEach((s) => chart.removeSeries(s));
    }
    const maSeries = [];
    const maConfig = [
      { key: "ma5", period: 5, color: "#f59e0b" },
      { key: "ma20", period: 20, color: "#8b5cf6" },
      { key: "ma60", period: 60, color: "#06b6d4" },
    ];
    maConfig.forEach(({ key, period, color }) => {
      if (!showMA[key]) return;
      const s = chart.addLineSeries({
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(calcMA(mockCandles, period));
      maSeries.push(s);
    });
    chartRef.current._maSeries = maSeries;
  }, [showMA]);

  // 저장된 라인을 차트에 렌더링
  useEffect(() => {
    if (!chartInstanceRef.current || !candleSeriesRef.current) return;
    const chart = chartInstanceRef.current;
    const candleSeries = candleSeriesRef.current;

    // 기존 추세선 시리즈 제거
    Object.values(trendSeriesMapRef.current).forEach((s) => {
      try { chart.removeSeries(s); } catch {}
    });
    trendSeriesMapRef.current = {};

    // 기존 수평선 제거
    candleSeries.setData(mockCandles); // priceLine은 setData 후에 다시 붙임

    lines.forEach((line) => {
      if (line.type === "horizontal") {
        candleSeries.createPriceLine({
          price: line.targetPrice,
          color: line.color,
          lineWidth: 1.5,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: line.name,
        });
      } else if (line.type === "trend" && line.x1 && line.x2) {
        const s = chart.addLineSeries({
          color: line.color,
          lineWidth: 1.5,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s.setData([
          { time: line.x1, value: line.y1 },
          { time: line.x2, value: line.y2 },
        ]);
        trendSeriesMapRef.current[line.id] = s;
      }
    });
  }, [lines]);

  // 클릭으로 추세선 점 선택
  useEffect(() => {
    if (!chartInstanceRef.current || !candleSeriesRef.current) return;
    const chart = chartInstanceRef.current;

    const handler = (param) => {
      if (!drawMode || !param.time) return;
      const price = candleSeriesRef.current.coordinateToPrice(param.point.y);
      if (!price) return;

      const point = { time: param.time, value: Math.round(price) };
      setDrawPoints((prev) => {
        const next = [...prev, point];
        if (next.length === 2) {
          // 두 점 선택 완료 → 모달 열기
          setPendingTrendPoints(next);
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

  const handleSaveLine = useCallback(
    (line) => {
      const newLine = { ...line, id: Date.now() };
      if (line.type === "trend" && pendingTrendPoints) {
        newLine.x1 = pendingTrendPoints[0].time;
        newLine.y1 = pendingTrendPoints[0].value;
        newLine.x2 = pendingTrendPoints[1].time;
        newLine.y2 = pendingTrendPoints[1].value;
        newLine.targetPrice = pendingTrendPoints[1].value;
      }
      setLines((prev) => [...prev, newLine]);
      setPendingTrendPoints(null);
      setShowModal(false);
    },
    [pendingTrendPoints]
  );

  const handleDeleteLine = (id) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const prevClose = mockCandles[mockCandles.length - 2].close;
  const priceChange = currentPrice - prevClose;
  const pctChange = ((priceChange / prevClose) * 100).toFixed(2);

  const B = "var(--border-tertiary)";

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-secondary)", display: "flex", flexDirection: "column" }}>

      {/* ── Top Navbar (full-width, sticky) ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--color-background-primary)",
        borderBottom: B,
        padding: "0 32px",
        height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span
            onClick={() => navigate("/")}
            style={{ fontSize: 13, color: "var(--color-text-tertiary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            ← 홈
          </span>
          <div style={{ width: 1, height: 16, background: "var(--color-border-secondary)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>{stockName}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{code}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}>{currentPrice.toLocaleString()}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: priceChange >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
            {priceChange >= 0 ? "+" : ""}{Math.abs(priceChange).toLocaleString()} ({priceChange >= 0 ? "+" : ""}{pctChange}%)
          </span>
        </div>
        <div style={{ width: 120 }} />
      </header>

      {/* ── Page Content ── */}
      <main style={{ flex: 1, maxWidth: 1280, width: "100%", margin: "0 auto", padding: "24px 32px", boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 20 }}>

            {/* Left: Chart */}
            <div>
              {/* Timeframe tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {TIMEFRAMES.map((tf) => (
                  <span
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    style={{ fontSize: 12, padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontWeight: timeframe === tf ? 500 : 400, background: timeframe === tf ? "var(--color-background-info)" : "var(--color-background-primary)", color: timeframe === tf ? "var(--color-text-info)" : "var(--color-text-secondary)", border: B }}
                  >
                    {tf}
                  </span>
                ))}
                <div style={{ flex: 1 }} />
                {[
                  { key: "ma5", label: "MA5", activeColor: "var(--color-text-warning)", activeBg: "var(--color-background-warning)" },
                  { key: "ma20", label: "MA20", activeColor: "#7c3aed", activeBg: "#ede9fe" },
                  { key: "ma60", label: "MA60", activeColor: "#0e7490", activeBg: "#cffafe" },
                ].map(({ key, label, activeColor, activeBg }) => (
                  <span
                    key={key}
                    onClick={() => setShowMA((prev) => ({ ...prev, [key]: !prev[key] }))}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 20, cursor: "pointer", fontWeight: 500, background: showMA[key] ? activeBg : "var(--color-background-primary)", color: showMA[key] ? activeColor : "var(--color-text-tertiary)", border: B }}
                  >
                    {label}
                  </span>
                ))}
              </div>

              {/* Chart card */}
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, padding: 12 }}>
                {/* Mode toggle */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {drawMode ? (drawPoints.length === 0 ? "첫 번째 고점을 클릭하세요..." : "두 번째 고점을 클릭하세요...") : "클릭으로 고점/저점 선택 → 선 생성"}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span onClick={() => { setDrawMode(false); setDrawPoints([]); }} style={{ fontSize: 11, padding: "3px 12px", borderRadius: 20, cursor: "pointer", fontWeight: !drawMode ? 500 : 400, background: !drawMode ? "var(--color-background-info)" : "var(--color-background-primary)", color: !drawMode ? "var(--color-text-info)" : "var(--color-text-secondary)", border: B }}>보기</span>
                    <span onClick={() => setDrawMode(true)} style={{ fontSize: 11, padding: "3px 12px", borderRadius: 20, cursor: "pointer", fontWeight: drawMode ? 500 : 400, background: drawMode ? "var(--color-background-info)" : "var(--color-background-primary)", color: drawMode ? "var(--color-text-info)" : "var(--color-text-secondary)", border: B }}>선 긋기</span>
                  </div>
                </div>

                {/* Chart */}
                <div ref={chartRef} style={{ width: "100%", cursor: drawMode ? "crosshair" : "default" }} />

                {/* Selected point indicator */}
                {drawMode && drawPoints.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: B, fontSize: 11, color: "var(--color-text-secondary)" }}>
                    고점① {drawPoints[0].time} — <span style={{ color: "var(--color-text-info)", fontWeight: 500 }}>{drawPoints[0].value.toLocaleString()}</span>
                    {drawPoints.length === 1 && <span style={{ color: "var(--color-border-primary)", marginLeft: 8 }}>두 번째 점 대기 중...</span>}
                  </div>
                )}

                {/* Legend */}
                <div style={{ display: "flex", gap: 16, marginTop: 8, paddingTop: 8, borderTop: B }}>
                  {lines.map((line) => (
                    <div key={line.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke={line.color} strokeWidth="1.5" strokeDasharray="4,2"/></svg>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{line.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Lines list */}
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: B, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>내 선</span>
                  <span onClick={() => { setPendingTrendPoints(null); setShowModal(true); }} style={{ fontSize: 12, color: "var(--color-text-info)", cursor: "pointer" }}>+ 추가 ↗</span>
                </div>
                {lines.length === 0 ? (
                  <p style={{ padding: "20px 16px", fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center" }}>설정된 선이 없습니다</p>
                ) : (
                  lines.map((line, i) => (
                    <div key={line.id} style={{ padding: "12px 16px", borderBottom: i < lines.length - 1 ? B : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 14, height: 2, background: line.color, borderRadius: 1 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{line.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: line.signalType === "loss" ? "var(--color-background-danger)" : "var(--color-background-success)", color: line.signalType === "loss" ? "var(--color-text-danger)" : "var(--color-text-success)" }}>
                            {line.signalType === "loss" ? "로스 지점" : "공격 지점"}
                          </span>
                          <span onClick={() => handleDeleteLine(line.id)} style={{ fontSize: 14, color: "var(--color-border-primary)", cursor: "pointer" }}>×</span>
                        </div>
                      </div>
                      {line.type === "trend" && line.x1 && (
                        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>고점① {line.x1} → 고점② {line.x2}</p>
                      )}
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-secondary)" }}>
                        현재 선 가격: <span style={{ color: line.color, fontWeight: 600 }}>{line.targetPrice?.toLocaleString()}</span>
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-secondary)" }}>
                        거리: <span style={{ fontWeight: 500, color: typeof line.distance === "number" && line.distance > 0 ? "var(--color-text-danger)" : "var(--color-text-success)" }}>
                          {typeof line.distance === "number" ? `${line.distance > 0 ? "+" : ""}${line.distance}%` : "—"}
                        </span>
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Alert settings */}
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, padding: "14px 16px" }}>
                <p style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>알림 설정</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>알림 민감도</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>±{[0.3, 0.5, 0.7, 1.0, 1.5][sensitivity - 1]}%</span>
                </div>
                <input type="range" min="1" max="5" value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--color-text-info)" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>정밀 ±0.3%</span>
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>여유 ±1.0%</span>
                </div>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: B, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>텔레그램 알림</span>
                  <div onClick={() => setAlertOn(!alertOn)} style={{ width: 36, height: 20, background: alertOn ? "var(--color-text-success)" : "var(--color-border-primary)", borderRadius: 10, position: "relative", cursor: "pointer", transition: "background 0.2s" }}>
                    <div style={{ width: 16, height: 16, background: "var(--color-background-primary)", borderRadius: "50%", position: "absolute", top: 2, right: alertOn ? 2 : "auto", left: alertOn ? "auto" : 2, transition: "all 0.2s" }} />
                  </div>
                </div>
              </div>

              {/* Draw button */}
              <button
                onClick={() => { setDrawMode(true); setDrawPoints([]); }}
                style={{ width: "100%", padding: "11px 0", fontSize: 13, fontWeight: 500, background: "var(--color-background-primary)", color: "var(--color-text-primary)", border: B, borderRadius: 10, cursor: "pointer" }}
              >
                {drawMode ? "클릭 대기 중..." : "차트에서 선 긋기 시작 ↗"}
              </button>
            </div>
          </div>
      </main>

      {showModal && (
        <AddLineModal
          onClose={() => { setShowModal(false); setPendingTrendPoints(null); }}
          onSave={handleSaveLine}
          preselectedType={pendingTrendPoints ? "trend" : null}
        />
      )}
    </div>
  );
}
