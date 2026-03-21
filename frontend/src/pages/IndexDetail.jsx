import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createChart, CrosshairMode } from "lightweight-charts";
import { getIndexCandles } from "../api/stocks";

const INDEX_META = {
  SP500:  { code: "SPX",  label: "S&P 500",  currency: "$" },
  NASDAQ: { code: "COMP", label: "NASDAQ",    currency: "$" },
  DOW:    { code: ".DJI", label: "다우존스",  currency: "$" },
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
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function changeColor(pct) {
  if (!pct || pct === "0.00") return "var(--color-text-tertiary)";
  return String(pct).startsWith("-") ? "var(--color-fall)" : "var(--color-rise)";
}

export default function IndexDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const meta = INDEX_META[id];

  const [period, setPeriod] = useState("D");
  const [candles, setCandles] = useState([]);
  const [info, setInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeRow, setActiveRow] = useState(null);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const seriesRef = useRef(null);

  // 데이터 로드
  useEffect(() => {
    if (!meta) return;
    setLoading(true);
    getIndexCandles(meta.code, period, 600)
      .then(({ candles: c, info: inf }) => {
        setCandles(c || []);
        setInfo(inf || {});
      })
      .catch(() => setCandles([]))
      .finally(() => setLoading(false));
  }, [meta?.code, period]);

  // 차트 렌더
  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;

    if (chartInstance.current) {
      chartInstance.current.remove();
      chartInstance.current = null;
    }

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: isMobile ? 260 : 340,
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#9ca3af" : "#6b7280",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? "#1f2937" : "#f3f4f6" },
        horzLines: { color: isDark ? "#1f2937" : "#f3f4f6" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
      handleScroll: true,
      handleScale: true,
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
    chart.timeScale().fitContent();

    chartInstance.current = chart;
    seriesRef.current = series;

    let disposed = false;
    const ro = new ResizeObserver(() => {
      if (!disposed && chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
    });
    ro.observe(chartRef.current);
    return () => {
      disposed = true;
      ro.disconnect();
      chart.remove();
      chartInstance.current = null;
    };
  }, [candles, isMobile]);

  if (!meta) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-tertiary)" }}>
      지원하지 않는 지수입니다.
    </div>
  );

  const currentPrice = info.ovrs_nmix_prpr;
  const change = info.ovrs_nmix_prdy_vrss;
  const changePct = info.prdy_ctrt;
  const isUp = changePct && !String(changePct).startsWith("-");

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
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{meta.code}</span>
        </div>
      </div>

      {/* 현재가 요약 */}
      <div style={{
        background: "var(--color-background-primary)", borderRadius: 16,
        padding: "20px 20px 16px", marginBottom: 16, boxShadow: "var(--shadow-card)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-1px" }}>
            {meta.currency}{fmt(currentPrice)}
          </span>
          {changePct && (
            <span style={{ fontSize: 16, fontWeight: 600, color: changeColor(changePct), paddingBottom: 4 }}>
              {isUp ? "+" : ""}{fmt(change)} ({isUp ? "+" : ""}{changePct}%)
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
          {[
            ["시가", info.ovrs_prod_oprc],
            ["고가", info.ovrs_prod_hgpr],
            ["저가", info.ovrs_prod_lwpr],
            ["거래량", info.acml_vol ? Number(info.acml_vol).toLocaleString() : null],
          ].map(([label, val]) => val && (
            <div key={label}>
              <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>{label}</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {label === "거래량" ? val : `${meta.currency}${fmt(val)}`}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 차트 */}
      <div style={{ background: "var(--color-background-primary)", borderRadius: 16, overflow: "hidden", marginBottom: 16, boxShadow: "var(--shadow-card)" }}>
        {/* 기간 탭 */}
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
            <div style={{ height: isMobile ? 260 : 340, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>불러오는 중...</p>
            </div>
          ) : (
            <div ref={chartRef} style={{ width: "100%" }} />
          )}
        </div>
      </div>

      {/* 날짜별 데이터 테이블 */}
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
              {candles.map((c, i) => {
                const prev = candles[i + 1];
                const chg = prev ? ((c.close - prev.close) / prev.close * 100) : null;
                const isRowUp = chg !== null && chg >= 0;
                const dateStr = c.date ? `${c.date.slice(0, 4)}.${c.date.slice(4, 6)}.${c.date.slice(6, 8)}` : "";
                return (
                  <tr key={c.date} onClick={() => setActiveRow(activeRow === i ? null : i)}
                    style={{
                      borderBottom: "1px solid var(--color-border-tertiary)",
                      background: activeRow === i ? "var(--color-background-tertiary)" : "transparent",
                      cursor: "pointer",
                    }}>
                    <td style={{ padding: "9px 12px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{dateStr}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 600, color: "var(--color-text-primary)" }}>{meta.currency}{fmt(c.close)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 500, color: chg === null ? "var(--color-text-tertiary)" : isRowUp ? "var(--color-rise)" : "var(--color-fall)" }}>
                      {chg === null ? "—" : `${isRowUp ? "+" : ""}${meta.currency}${fmt(Math.abs(c.close - (candles[i+1]?.close ?? c.close)))}`}
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
        </div>
      </div>
    </div>
  );
}
