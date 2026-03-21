import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createChart, CrosshairMode } from "lightweight-charts";
import { getDomesticIndexCandles, getDomesticIndexInfo } from "../api/stocks";

const INDEX_META = {
  KOSPI:  { inds_cd: "001", mrkt_tp: "0", label: "KOSPI",  unit: 1 },
  KOSDAQ: { inds_cd: "101", mrkt_tp: "1", label: "KOSDAQ", unit: 1 },
};

const PERIODS = [
  { label: "일봉", value: "D" },
  { label: "주봉", value: "W" },
  { label: "월봉", value: "M" },
  { label: "년봉", value: "Y" },
];

function useIsMobile() {
  const [v, setV] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setV(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return v;
}

function fmt(n, dec = 2) {
  if (n == null || n === 0) return "—";
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function DomesticIndexDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const meta = INDEX_META[id];

  const [period, setPeriod] = useState("D");
  const [candles, setCandles] = useState([]);
  const [info, setInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // 현재가 정보 로드
  useEffect(() => {
    if (!meta) return;
    getDomesticIndexInfo(meta.inds_cd, meta.mrkt_tp)
      .then((data) => setInfo(data))
      .catch(() => {});
  }, [meta?.inds_cd]);

  // 캔들 로드
  useEffect(() => {
    if (!meta) return;
    setLoading(true);
    setVisibleCount(10);
    getDomesticIndexCandles(meta.inds_cd, period, 600)
      .then(({ candles: c }) => setCandles(c || []))
      .catch(() => setCandles([]))
      .finally(() => setLoading(false));
  }, [meta?.inds_cd, period]);

  // 차트 렌더
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.remove();
      chartInstance.current = null;
    }

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

    const series = chart.addCandlestickSeries({
      upColor: "#ef4444",
      downColor: "#3b82f6",
      borderUpColor: "#ef4444",
      borderDownColor: "#3b82f6",
      wickUpColor: "#ef4444",
      wickDownColor: "#3b82f6",
    });

    const chartData = [...candles]
      .reverse()
      .filter((c) => c.date && c.close)
      .map((c) => ({
        time: `${c.date.slice(0, 4)}-${c.date.slice(4, 6)}-${c.date.slice(6, 8)}`,
        open: c.open || c.close,
        high: c.high || c.close,
        low: c.low || c.close,
        close: c.close,
      }));

    series.setData(chartData);

    // 타임프레임별 표시 구간
    const lastTime = chartData[chartData.length - 1]?.time;
    if (lastTime) {
      const d = new Date(lastTime);
      if (period === "W") d.setMonth(d.getMonth() - 1);
      else if (period === "M") d.setMonth(d.getMonth() - 6);
      else if (period === "Y") d.setFullYear(d.getFullYear() - 2);
      else d.setDate(d.getDate() - 7);
      chart.timeScale().setVisibleRange({ from: d.toISOString().slice(0, 10), to: lastTime });
    }

    chartInstance.current = chart;

    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    });
    ro.observe(chartRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartInstance.current = null;
    };
  }, [candles, isMobile, period]);

  if (!meta) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
      지원하지 않는 지수입니다.
    </div>
  );

  const isUp = info.flu_rt && !String(info.flu_rt).startsWith("-");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "16px 16px 80px" : "24px 32px 60px" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{
          border: "none", background: "none", cursor: "pointer", padding: 4,
          color: "var(--color-text-tertiary)", fontSize: 20, lineHeight: 1,
        }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "var(--color-text-primary)" }}>
            {meta.label}
          </h1>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{meta.inds_cd}</span>
        </div>
      </div>

      {/* 현재가 요약 */}
      <div style={{
        background: "var(--color-background-primary)", borderRadius: 16,
        padding: "20px 20px 16px", marginBottom: 16, boxShadow: "var(--shadow-card)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-1px" }}>
            {fmt(info.cur_prc)}
          </span>
          {info.flu_rt && (
            <span style={{ fontSize: 16, fontWeight: 600, color: isUp ? "var(--color-rise)" : "var(--color-fall)", paddingBottom: 4 }}>
              {isUp ? "▲" : "▼"}{fmt(info.pred_pre)} ({info.flu_rt}%)
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
          {[
            ["시가", info.open_pric],
            ["고가", info.high_pric],
            ["저가", info.low_pric],
            ["거래량", info.trde_qty ? Number(info.trde_qty).toLocaleString() : null],
          ].map(([label, val]) => val && (
            <div key={label}>
              <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>{label}</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {label === "거래량" ? val : fmt(val)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 차트 */}
      <div style={{ background: "var(--color-background-primary)", borderRadius: 16, overflow: "hidden", marginBottom: 16, boxShadow: "var(--shadow-card)" }}>
        <div style={{ display: "flex", gap: 4, padding: "12px 16px 0" }}>
          {PERIODS.map(({ label, value }) => (
            <button key={value} onClick={() => setPeriod(value)} style={{
              padding: "5px 14px", fontSize: 12, borderRadius: 20, border: "none",
              fontWeight: period === value ? 700 : 400, cursor: "pointer",
              background: period === value ? "var(--color-text-primary)" : "var(--color-background-tertiary)",
              color: period === value ? "var(--color-background-primary)" : "var(--color-text-secondary)",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ padding: "12px 0 0" }}>
          {loading ? (
            <div style={{ height: isMobile ? 300 : 520, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>차트 불러오는 중...</p>
            </div>
          ) : (
            <div ref={chartRef} style={{ width: "100%" }} />
          )}
        </div>
      </div>

      {/* 시세 테이블 */}
      <div style={{ background: "var(--color-background-primary)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <div style={{ padding: "16px 16px 8px" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary)" }}>기간별 시세</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                {["날짜", "종가", "등락", "거래량", "등락률"].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: h === "날짜" ? "left" : "right", color: "var(--color-text-tertiary)", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candles.slice(0, visibleCount).map((c, i) => {
                const prev = candles[i + 1];
                const chg = prev ? ((c.close - prev.close) / prev.close * 100) : null;
                const isRowUp = chg !== null && chg >= 0;
                const dateStr = c.date ? `${c.date.slice(0, 4)}.${c.date.slice(4, 6)}.${c.date.slice(6, 8)}` : "";
                return (
                  <tr key={c.date} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                    <td style={{ padding: "9px 12px", color: "var(--color-text-secondary)" }}>{dateStr}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>{fmt(c.close)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: chg === null ? "var(--color-text-tertiary)" : isRowUp ? "var(--color-rise)" : "var(--color-fall)" }}>
                      {chg === null ? "—" : `${isRowUp ? "+" : ""}${fmt(Math.abs(c.close - (candles[i+1]?.close ?? c.close)))}`}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: "var(--color-text-tertiary)" }}>{c.volume ? Number(c.volume).toLocaleString() : "—"}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: chg === null ? "var(--color-text-tertiary)" : isRowUp ? "var(--color-rise)" : "var(--color-fall)" }}>
                      {chg === null ? "—" : `${isRowUp ? "+" : ""}${chg.toFixed(2)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {candles.length === 0 && !loading && (
            <p style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>데이터 없음</p>
          )}
          {candles.length > visibleCount && (
            <button onClick={() => setVisibleCount((v) => v + 10)} style={{
              width: "100%", padding: "12px", border: "none", borderTop: "1px solid var(--color-border-tertiary)",
              background: "none", cursor: "pointer", fontSize: 13, color: "var(--color-text-tertiary)",
              fontWeight: 500,
            }}>
              더보기 ({visibleCount} / {candles.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
