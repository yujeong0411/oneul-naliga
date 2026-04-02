import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { createChart, CrosshairMode, LineStyle } from "lightweight-charts";
import AddLineModal from "../components/AddLineModal";
import EditLineSheet from "../components/EditLineSheet";
import PositionModal from "../components/PositionModal";
import { getPositions } from "../api/positions";
import AutoDetectPanel from "../components/AutoDetectPanel";
import OrderbookPanel from "../components/OrderbookPanel";
import InvestorPanel from "../components/InvestorPanel";
import IndicatorPanel from "../components/IndicatorPanel";
import { getCandles, getPrice, detectMarket, searchStocks, getWatchlist, addStock, removeStock, getOrderbook, getEtfInfo, getEtfDaily } from "../api/stocks";
import { useLivePrice } from "../hooks/useLivePrice";
import { useOrderbook } from "../hooks/useOrderbook";
import { getLines, createLine, updateLine, deleteLine, getLineStats } from "../api/lines";
import { useAuth } from "../context/AuthContext";

const B = "var(--border-tertiary)";
const TIMEFRAMES = ["일봉", "주봉", "월봉", "년봉"];
const MINUTE_OPTIONS = [1, 3, 5, 10, 15, 30, 60];
const PERIOD_LABEL = { "월봉": "3개월 후", "주봉": "4주 후", "일봉": "5거래일 후", "60분": "6시간 후", "30분": "4시간 후", "15분": "2시간 후", "10분": "100분 후", "5분": "1시간 후", "3분": "1시간 후", "1분": "30분 후" };
const MA_CONFIG = [
  { key: "ma5", period: 5, color: "#f59e0b", label: "MA5" },
  { key: "ma20", period: 20, color: "#8b5cf6", label: "MA20" },
  { key: "ma60", period: 60, color: "#06b6d4", label: "MA60" },
  { key: "ma120", period: 120, color: "#ec4899", label: "MA120" },
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

const OVERLAY_DEFAULTS = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null };
function addOverlayLine(chart, opts) { return chart.addLineSeries({ ...OVERLAY_DEFAULTS, ...opts }); }
function addOverlayArea(chart, opts) { return chart.addAreaSeries({ ...OVERLAY_DEFAULTS, ...opts }); }

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
  const [showMA, setShowMA] = useState({ ma5: true, ma20: true, ma60: false, ma120: false });
  const [showIchimoku, setShowIchimoku] = useState(false);
  const ichimokuSeriesRef = useRef([]);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [pendingPoints, setPendingPoints] = useState(null);
  const [mobileTab, setMobileTab] = useState("lines"); // "lines" | "detect" | "orderbook"
  const [showOrderbookLines, setShowOrderbookLines] = useState(true);
  const [showObTooltip, setShowObTooltip] = useState(false);
  const [showMADropdown, setShowMADropdown] = useState(null);
  const [editingLine, setEditingLine] = useState(null);
  const [lineStats, setLineStats] = useState({});
  const [positions, setPositions] = useState([]);
  const [editingPosition, setEditingPosition] = useState(null); // null=닫힘, {}=새로 만들기, {id:...}=편집
  const loadPositions = () => {
    if (user?.id) getPositions(code, user.id).then(setPositions).catch(() => {});
  };  // { lineId: statsData }
  const [hiddenLines, setHiddenLines] = useState(new Set());
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
        const chartData = (data.candles ?? []).map((c) => ({
          time: toChartTime(c.date, isIntraday, market === "US"),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })).sort((a, b) => typeof a.time === "number" ? a.time - b.time : a.time.localeCompare(b.time));
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
      .then((data) => {
        setLines(data);
        (data || []).forEach((line) => {
          getLineStats(line.id).then((stats) => {
            setLineStats((prev) => ({ ...prev, [line.id]: stats }));
          }).catch(() => {});
        });
      })
      .catch(() => { });

    if (user?.id) {
      getPositions(code, user.id).then(setPositions).catch(() => {});
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
      const s = addOverlayLine(chart, { color, lineWidth: 1 });
      s.setData(calcMA(candles, period));
      maSeriesRefs.current.push(s);
    });
  }, [showMA, candles]);

  // ── 일목균형표 오버레이 ─────────────────────

  useEffect(() => {
    if (!chartInstance.current) return;
    const chart = chartInstance.current;
    // 기존 시리즈 제거
    ichimokuSeriesRef.current.forEach((s) => { try { chart.removeSeries(s); } catch {} });
    ichimokuSeriesRef.current = [];

    if (!showIchimoku || !isDomestic) return;

    const candleType = timeframe === "주봉" ? "W" : timeframe === "월봉" || timeframe === "년봉" ? "M"
      : timeframe.endsWith("분") ? timeframe.replace("분", "") : "D";

    fetch(`${import.meta.env.VITE_API_URL || ""}/api/stocks/ichimoku`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, candle_type: candleType }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data || !chartInstance.current) return;
        const chart = chartInstance.current;

        // 현재 뷰 저장 (시리즈 추가로 인한 차트 축소 방지)
        const savedRange = chart.timeScale().getVisibleLogicalRange();

        const toTime = (d) => {
          if (isIntraday) return toChartTime(d, true, false);
          return d.replace(/(\d{4})(\d{2})(\d{2}).*/, "$1-$2-$3");
        };
        const mapSeries = (arr) => arr.map((p) => ({ time: toTime(p.date), value: p.value }));

        // 전환선 (하늘색, 점선) — MA와 구분
        if (data.tenkan?.length) {
          const s = addOverlayLine(chart, { color: "#00bcd4", lineWidth: 1, lineStyle: 1 });
          s.setData(mapSeries(data.tenkan));
          ichimokuSeriesRef.current.push(s);
        }
        // 기준선 (주황색, 실선)
        if (data.kijun?.length) {
          const s = addOverlayLine(chart, { color: "#ff9800", lineWidth: 1.5 });
          s.setData(mapSeries(data.kijun));
          ichimokuSeriesRef.current.push(s);
        }
        // 후행스팬 (연보라, 점선)
        if (data.chikou?.length) {
          const s = addOverlayLine(chart, { color: "#ce93d8", lineWidth: 1, lineStyle: 2 });
          s.setData(mapSeries(data.chikou));
          ichimokuSeriesRef.current.push(s);
        }
        // 구름대: 선행스팬 A/B 사이 채우기
        if (data.senkou_a?.length && data.senkou_b?.length) {
          const aData = mapSeries(data.senkou_a);
          const bData = mapSeries(data.senkou_b);
          const BG = "#1e1e38";

          // B를 시간 기준 맵으로 변환
          const bMap = {};
          bData.forEach((p) => { bMap[typeof p.time === "object" ? JSON.stringify(p.time) : p.time] = p.value; });

          // 상단(max), 하단(min) 데이터 + 색상 구분
          const topData = [];
          const bottomData = [];
          let lastIsGreen = null;
          // 구간별로 색상이 바뀌는 지점 추적
          const segments = []; // { start, end, green }
          let segStart = 0;

          aData.forEach((p, i) => {
            const key = typeof p.time === "object" ? JSON.stringify(p.time) : p.time;
            const bv = bMap[key];
            if (bv === undefined) return;
            const isGreen = p.value >= bv;
            topData.push({ time: p.time, value: Math.max(p.value, bv) });
            bottomData.push({ time: p.time, value: Math.min(p.value, bv) });

            if (lastIsGreen !== null && isGreen !== lastIsGreen) {
              segments.push({ start: segStart, end: i - 1, green: lastIsGreen });
              segStart = i;
            }
            lastIsGreen = isGreen;
          });
          if (topData.length > 0) {
            segments.push({ start: segStart, end: topData.length - 1, green: lastIsGreen });
          }

          // 구간별 구름 AreaSeries 생성
          segments.forEach((seg) => {
            const segTop = topData.slice(seg.start, seg.end + 2); // +1 for overlap
            const segBottom = bottomData.slice(seg.start, seg.end + 2);
            if (segTop.length < 2) return;

            const color = seg.green ? "rgba(76,175,80,0.25)" : "rgba(239,83,80,0.25)";

            // 상단 fill (라인 아래로 채움)
            const sTop = addOverlayArea(chart, {
              topColor: color, bottomColor: color,
              lineColor: seg.green ? "rgba(76,175,80,0.5)" : "rgba(239,83,80,0.5)", lineWidth: 1,
            });
            sTop.setData(segTop);
            ichimokuSeriesRef.current.push(sTop);

            // 하단 마스킹 (배경색으로 덮어서 하단 채움 제거)
            const sBottom = addOverlayArea(chart, {
              topColor: BG, bottomColor: BG,
              lineColor: BG, lineWidth: 0,
            });
            sBottom.setData(segBottom);
            ichimokuSeriesRef.current.push(sBottom);
          });

          // 선행스팬 A/B 라인 (구름 위에 그리기)
          const sA = addOverlayLine(chart, { color: "rgba(76,175,80,0.6)", lineWidth: 1 });
          sA.setData(aData);
          ichimokuSeriesRef.current.push(sA);

          const sB = addOverlayLine(chart, { color: "rgba(239,83,80,0.6)", lineWidth: 1 });
          sB.setData(bData);
          ichimokuSeriesRef.current.push(sB);
        }

        // 차트 뷰 복원 (미래 선행스팬으로 인한 축소/이동 방지)
        if (savedRange) {
          chart.timeScale().setVisibleLogicalRange(savedRange);
        }
      })
      .catch(() => {});
  }, [showIchimoku, code, timeframe, isDomestic, candles]);

  // ── 선 렌더링 ──────────────────────────────

  const priceLinesRef = useRef([]);

  useEffect(() => {
    if (!chartInstance.current || !candleSeries.current) return;
    const chart = chartInstance.current;
    const cs = candleSeries.current;

    const savedRange = chart.timeScale().getVisibleLogicalRange();

    // 기존 수평선 제거
    priceLinesRef.current.forEach((pl) => { try { cs.removePriceLine(pl); } catch { } });
    priceLinesRef.current = [];

    // 기존 추세선 제거
    Object.values(trendSeriesMap.current).forEach((s) => { try { chart.removeSeries(s); } catch { } });
    trendSeriesMap.current = {};

    let hasTrend = false;
    lines.filter((line) => !hiddenLines.has(line.id) && (line.line_type === "horizontal" || line.timeframe === timeframe)).forEach((line) => {
      const color = line.color || lineColor(line.signal_type);
      if (line.line_type === "horizontal" && line.price) {
        const pl = cs.createPriceLine({ price: line.price, color, lineWidth: 1.5, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: line.name || "" });
        priceLinesRef.current.push(pl);
      } else if (line.line_type === "trend" && line.x1 && line.x2) {
        hasTrend = true;
        const s = addOverlayLine(chart, { color, lineWidth: 1.5, lineStyle: LineStyle.Dashed });

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
          const toTs = (t) => typeof t === "number" ? t : new Date(t + "T00:00:00Z").getTime() / 1000;
          const t1 = toTs(line.x1);
          const t2 = toTs(line.x2);
          // 캔들 인덱스 기반으로 원래 두 점 + 연장점 계산
          const idx1 = candles.findIndex((c) => toTs(c.time) >= t1);
          const idx2 = candles.findIndex((c) => toTs(c.time) >= t2);
          const i1 = idx1 >= 0 ? idx1 : 0;
          const i2 = idx2 >= 0 ? idx2 : candles.length - 1;
          const idxSpan = i2 - i1 || 1;
          const visualSlope = (line.y2 - line.y1) / idxSpan;
          const lastTs = toTs(candles[candles.length - 1].time);
          const prevTs = toTs(candles[candles.length - 2].time);
          const interval = lastTs - prevTs;
          const extCount = Math.round(candles.length * 0.3);
          data = [];
          // 왼쪽 연장: P1 이전 캔들 전체
          for (let i = 0; i < i1; i++) {
            data.push({ time: candles[i].time, value: line.y1 + visualSlope * (i - i1) });
          }
          // 원래 두 점 사이 + P2까지
          for (let i = i1; i <= i2; i++) {
            data.push({ time: candles[i].time, value: line.y1 + visualSlope * (i - i1) });
          }
          // P2 이후 ~ 마지막 캔들
          for (let i = i2 + 1; i < candles.length; i++) {
            data.push({ time: candles[i].time, value: line.y1 + visualSlope * (i - i1) });
          }
          // 오른쪽으로 캔들 30%분 연장
          const isNumericTime = typeof candles[0].time === "number";
          for (let i = 1; i <= extCount; i++) {
            const futureTs = lastTs + interval * i;
            const ft = isNumericTime
              ? futureTs
              : (() => { const d = new Date(futureTs * 1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; })();
            data.push({ time: ft, value: line.y1 + visualSlope * (candles.length - 1 - i1 + i) });
          }
        } else {
          data = [
            { time: toTime(line.x1), value: line.y1 },
            { time: toTime(line.x2), value: line.y2 },
          ];
        }
        data.sort((a, b) => typeof a.time === "number" ? a.time - b.time : String(a.time).localeCompare(String(b.time)));
        // 중복 시간 제거 (lightweight-charts는 같은 시간 허용 안 함)
        data = data.filter((d, i) => i === 0 || d.time !== data[i - 1].time);
        s.setData(data);
        trendSeriesMap.current[line.id] = s;
      }
    });
    // 추세선 연장으로 인한 이동 방지: 추세선이 있을 때만 범위 복원
    if (hasTrend && savedRange) {
      chart.timeScale().setVisibleLogicalRange(savedRange);
    }
  }, [lines, candles, chartReady, hiddenLines, timeframe, lineStats]);

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
          // 두 번째 마커를 잠깐 보여준 후 모달 열기
          setTimeout(() => {
            setShowModal(true);
            setDrawMode(false);
            setDrawPoints([]);
          }, 500);
          return next;
        }
        return next;
      });
    };

    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [drawMode]);

  // ── 선 긋기 클릭 포인트 마커 (HTML 오버레이) ──

  const drawDotRefs = useRef([]);

  useEffect(() => {
    // 기존 점 제거
    drawDotRefs.current.forEach((el) => el.remove());
    drawDotRefs.current = [];

    if (!chartInstance.current || !candleSeries.current || !chartRef.current) return;
    const chart = chartInstance.current;
    const cs = candleSeries.current;
    const container = chartRef.current;

    const updateDots = () => {
      drawDotRefs.current.forEach((el) => el.remove());
      drawDotRefs.current = [];

      drawPoints.forEach((p, i) => {
        const x = chart.timeScale().timeToCoordinate(p.time);
        const y = cs.priceToCoordinate(p.value);
        if (x === null || y === null) return;

        const dot = document.createElement("div");
        dot.style.cssText = `
          position:absolute; left:${x - 5}px; top:${y - 5}px;
          width:10px; height:10px; border-radius:50%;
          background:#00e676; border:2px solid #fff;
          pointer-events:none; z-index:10;
          box-shadow: 0 0 6px rgba(0,230,118,0.8);
        `;
        const label = document.createElement("div");
        label.style.cssText = `
          position:absolute; left:${x + 10}px; top:${y - 10}px;
          font-size:11px; font-weight:700; color:#00e676;
          pointer-events:none; z-index:10; white-space:nowrap;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        `;
        label.textContent = `P${i + 1} ${p.value.toLocaleString()}`;

        container.appendChild(dot);
        container.appendChild(label);
        drawDotRefs.current.push(dot, label);
      });
    };

    updateDots();

    // 차트 스크롤/줌 시 위치 업데이트
    const sub = () => updateDots();
    chart.timeScale().subscribeVisibleLogicalRangeChange(sub);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(sub);
      drawDotRefs.current.forEach((el) => el.remove());
      drawDotRefs.current = [];
    };
  }, [drawPoints]);

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
      intent: formData.intent ?? null,
    };

    if (formData.line_type === "trend" && pendingPoints?.length === 2) {
      const [p1, p2] = pendingPoints;
      // date가 숫자면 이미 Unix timestamp(초), 문자열이면 날짜 파싱
      const toUnix = (d) => {
        if (typeof d === "number") return d;
        const s = typeof d === "string" && /^\d{8}$/.test(d)
          ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
          : d;
        return new Date(s).getTime() / 1000;
      };
      const t1 = toUnix(p1.date);
      const t2 = toUnix(p2.date);
      const slope = (p2.price - p1.price) / (t2 - t1);
      const intercept = p1.price - slope * t1;
      Object.assign(body, { x1: Math.round(t1), y1: p1.price, x2: Math.round(t2), y2: p2.price, slope, intercept });
    }

    try {
      const saved = await createLine(body);
      setLines((prev) => [...prev, saved]);
      setPendingPoints(null);
      setShowModal(false);
      return saved;
    } catch {
      const fallback = { ...body, id: Date.now() };
      setLines((prev) => [...prev, fallback]);
      setPendingPoints(null);
      setShowModal(false);
      return fallback;
    }
  }, [code, pendingPoints]);

  const handleDeleteLine = async (id) => {
    // position_lines 기반: 이 선이 연결된 포지션 찾기
    const affected = positions.filter((p) =>
      (p.position_lines || []).some((pl) => pl.line?.id === id)
    );
    if (affected.length > 0) {
      const { deletePosition } = await import("../api/positions");
      for (const pos of affected) {
        const entryLines = (pos.position_lines || []).filter(pl => pl.role === "entry");
        const isLastEntry = entryLines.length <= 1 && entryLines.some(pl => pl.line?.id === id);
        if (isLastEntry) {
          await deletePosition(pos.id).catch(() => {});
        }
        // tp/sl 선 삭제는 DB CASCADE가 position_lines를 정리
      }
      loadPositions();
    }
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
    loadPositions();
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
  const pctChange = liveChangePct != null ? String(liveChangePct).replace(/^[+-]/, "") : (prevClose ? (Math.abs(priceChange / prevClose) * 100).toFixed(2) : "0.00");

  // ── 렌더: 선 목록 ──────────────────────────

  const scrollToLine = (line) => {
    if (!chartInstance.current || candles.length === 0) return;
    try {
      const ts = chartInstance.current.timeScale();
      if (line.line_type === "horizontal") {
        // 수평선: 시간 축 이동 불필요 (가격 축에만 존재), 현재 범위 유지
        return;
      } else if (line.line_type === "trend" && line.x1) {
        // 추세선: 시작점~끝점 시간으로 스크롤
        const chartTime = candles[0].time;
        const isNumeric = typeof chartTime === "number";
        const toTime = (v) => {
          if (isNumeric) {
            return typeof v === "number" ? v : Math.floor(new Date(v + "T00:00:00+09:00").getTime() / 1000);
          }
          if (typeof v === "number") {
            const d = new Date(v * 1000);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          }
          return v;
        };
        let from = toTime(line.x1);
        let to = toTime(line.x2 || line.x1);
        // from이 to보다 크면 swap
        if (isNumeric) {
          if (from > to) [from, to] = [to, from];
          const padding = Math.abs(to - from) * 0.15 || 3600;
          ts.setVisibleRange({ from: from - padding, to: to + padding });
        } else {
          if (from > to) [from, to] = [to, from];
          // from === to일 때 여유 추가
          if (from === to) {
            ts.fitContent();
          } else {
            ts.setVisibleRange({ from, to });
          }
        }
      }
    } catch (e) {
      // fallback: 에러 시 전체 보기
      try { chartInstance.current.timeScale().fitContent(); } catch {}
    }
  };

  const renderLineList = () => (
    <div>
      <p style={{ margin: 0, padding: "10px 20px 0", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
        직접 그린 지지선·저항선 목록입니다. 선을 탭하면 해당 위치로 이동하며, 가격 도달 시 알림을 받을 수 있습니다.
      </p>
      {lines.length === 0 ? (
        <p style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>설정된 선이 없습니다</p>
      ) : (
        lines.map((line, i) => {
          const target = line.line_type === "horizontal" ? line.price : line.y2;
          const isSupport = target && displayPrice ? target <= displayPrice : line.signal_type === "loss";
          const dynamicSignal = isSupport ? "loss" : "attack";
          const color = line.color || lineColor(dynamicSignal);
          const dist = target && displayPrice ? ((displayPrice - target) / target * 100).toFixed(2) : null;
          const isOtherTf = line.line_type === "trend" && line.timeframe !== timeframe;
          return (
            <div key={line.id} onClick={isOtherTf ? undefined : () => scrollToLine(line)} style={{ padding: "14px 20px", borderBottom: i < lines.length - 1 ? B : "none", cursor: isOtherTf ? "default" : "pointer", opacity: hiddenLines.has(line.id) || isOtherTf ? 0.4 : 1, pointerEvents: isOtherTf ? "none" : "auto", transition: "opacity 0.2s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 14, height: 2.5, background: color, borderRadius: 1 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{line.name || "이름 없음"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setHiddenLines((prev) => {
                        const next = new Set(prev);
                        if (next.has(line.id)) next.delete(line.id); else next.add(line.id);
                        return next;
                      });
                    }}
                    style={{ border: "none", background: "none", cursor: "pointer", padding: "4px 6px", color: hiddenLines.has(line.id) ? "var(--color-text-quaternary)" : "var(--color-text-tertiary)", lineHeight: 0 }}
                  >
                    {hiddenLines.has(line.id) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
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
                  {line.line_type === "horizontal" ? "전체" : line.timeframe}
                </span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: dynamicSignal === "loss" ? "var(--color-background-danger)" : "var(--color-background-success)", color }}>
                  {dynamicSignal === "loss" ? "지지선" : "저항선"}
                </span>
                {target && (
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {isDomestic ? target.toLocaleString() + "원" : "$" + target.toLocaleString()}
                  </span>
                )}
                {dist !== null && (() => {
                  const d = Number(dist);
                  const isSupLine = dynamicSignal === "loss";
                  // 지지선: 위에 있으면 초록, 아래(이탈)면 빨강
                  // 저항선: 아래면 회색, 위(돌파)면 파랑
                  if (isSupLine) {
                    if (d >= 0) return <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-rise)" }}>+{d.toFixed(2)}%</span>;
                    return <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-fall)" }}>{d.toFixed(2)}% 이탈</span>;
                  } else {
                    if (d <= 0) return <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)" }}>{d.toFixed(2)}%</span>;
                    return <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-info)" }}>+{d.toFixed(2)}% 돌파</span>;
                  }
                })()}
                {(() => {
                  const stats = lineStats[line.id];
                  if (!stats || (!stats.touch_count && !stats.pending)) return null;
                  const er = stats.expected_return;
                  if (er == null) return (
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--color-background-secondary)", color: "var(--color-text-tertiary)" }}>
                      {stats.touch_count}회 터치
                    </span>
                  );
                  const period = PERIOD_LABEL[line.timeframe] || "이후";
                  return (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: er >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", color: er >= 0 ? "#22c55e" : "#ef4444" }}>
                      {period} {er >= 0 ? "+" : ""}{er}%
                    </span>
                  );
                })()}
              </div>
            </div>
          );
        })
      )}
      {/* 포지션 목록 */}
      {positions.length > 0 && (
        <div style={{ borderTop: `6px solid var(--color-background-secondary)` }}>
          <div style={{ padding: "12px 20px 6px", fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)" }}>포지션</div>
          {positions.map((pos) => {
            const hasEntry = pos.entry_price > 0;
            const hasExit = pos.exit_price > 0;
            const pct = hasEntry && hasExit
              ? ((pos.exit_price - pos.entry_price) / pos.entry_price * 100)
              : hasEntry && displayPrice
              ? ((displayPrice - pos.entry_price) / pos.entry_price * 100)
              : null;
            const statusLabel = { open: "진행 중", closed: "종료", tp_hit: "목표 도달", sl_hit: "손절 도달" }[pos.status] || pos.status;
            const statusColor = { open: "#3b82f6", closed: "#6b7280", tp_hit: "#22c55e", sl_hit: "#ef4444" }[pos.status] || "#6b7280";
            const entryPLs = (pos.position_lines || []).filter(pl => pl.role === "entry" && pl.line);
            const entryLineName = entryPLs.length > 0
              ? entryPLs.map(pl => pl.line.name || (pl.line.signal_type === "loss" ? "지지선" : "저항선")).join(" + ")
              : "포지션";
            return (
              <div key={pos.id} onClick={() => setEditingPosition(pos)} style={{ padding: "10px 20px", borderBottom: B, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {entryLineName}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 10, background: statusColor + "22", color: statusColor }}>{statusLabel}</span>
                  </div>
                  {pct !== null && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: pct >= 0 ? "#22c55e" : "#ef4444" }}>
                      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {hasEntry && <span>매입 {isDomestic ? Number(pos.entry_price).toLocaleString() : "$" + Number(pos.entry_price).toLocaleString()}</span>}
                  {pos.tp_price && <span>목표 {isDomestic ? Number(pos.tp_price).toLocaleString() : "$" + Number(pos.tp_price).toLocaleString()}</span>}
                  {pos.sl_price && <span>손절 {isDomestic ? Number(pos.sl_price).toLocaleString() : "$" + Number(pos.sl_price).toLocaleString()}</span>}
                </div>
              </div>
            );
          })}
        </div>
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
              style={{ border: "none", background: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}
              title={isWatchlisted ? "관심목록에서 제거" : "관심목록에 추가"}
            >
              <svg width={22} height={22} viewBox="0 0 24 24" fill={isWatchlisted ? "#ec4899" : "none"} stroke={isWatchlisted ? "#ec4899" : "var(--color-text-tertiary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
                {isDomestic ? displayPrice.toLocaleString() + "원" : "$" + displayPrice.toLocaleString()}
              </p>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: priceChange >= 0 ? "var(--color-rise)" : "var(--color-fall)" }}>
                {priceChange >= 0 ? "▲" : "▼"}{Math.abs(priceChange).toLocaleString()} ({priceChange >= 0 ? "+" : "-"}{pctChange}%)
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
            style={{ border: "none", background: "none", cursor: "pointer", padding: "2px 4px", lineHeight: 0 }}
            title={isWatchlisted ? "관심목록에서 제거" : "관심목록에 추가"}
          >
            <svg width={24} height={24} viewBox="0 0 24 24" fill={isWatchlisted ? "#ec4899" : "none"} stroke={isWatchlisted ? "#ec4899" : "var(--color-text-tertiary)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          <span style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)" }}>
            {isDomestic ? displayPrice.toLocaleString() + "원" : "$" + displayPrice.toLocaleString()}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: priceChange >= 0 ? "var(--color-rise)" : "var(--color-fall)" }}>
            {priceChange >= 0 ? "▲" : "▼"}{Math.abs(priceChange).toLocaleString()} ({priceChange >= 0 ? "+" : "-"}{pctChange}%)
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
        <div ref={(el) => { if (el) el.__maBtn = el; }} style={{ position: "relative" }}>
          <button
            onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setShowMADropdown((v) => v ? false : { top: rect.bottom + 4, left: rect.left }); }}
            style={{
              padding: "6px 14px", fontSize: 13, borderRadius: 20, border: B,
              fontWeight: Object.values(showMA).some(Boolean) ? 600 : 400,
              background: Object.values(showMA).some(Boolean) ? "var(--btn-active-bg)" : "transparent",
              color: Object.values(showMA).some(Boolean) ? "var(--btn-active-text)" : "var(--color-text-secondary)",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
            }}
          >
            {(() => { const active = MA_CONFIG.filter(({ key }) => showMA[key]); return active.length > 0 ? active.map(({ label }) => label).join("/") : "이동평균선"; })()}
            <span style={{ fontSize: 10, lineHeight: 1 }}>▾</span>
          </button>
          {showMADropdown && (
            <>
              <div onClick={() => setShowMADropdown(false)} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
              <div style={{
                position: "fixed", top: showMADropdown.top, left: showMADropdown.left, zIndex: 1000,
                background: "var(--color-background-primary)", border: B,
                borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                overflow: "hidden", minWidth: 120,
              }}>
                {MA_CONFIG.map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => { setShowMA((prev) => ({ ...prev, [key]: !prev[key] })); setShowIchimoku(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 14px", fontSize: 13,
                      border: "none", borderBottom: `1px solid var(--color-background-secondary)`,
                      background: showMA[key] ? "var(--color-background-secondary)" : "transparent",
                      color: showMA[key] ? color : "var(--color-text-secondary)",
                      fontWeight: showMA[key] ? 600 : 400,
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, opacity: showMA[key] ? 1 : 0.3 }} />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {isDomestic && (
          <>
            <div style={{ width: 1, background: B, flexShrink: 0, margin: "2px 4px" }} />
            <button
              onClick={() => {
                setShowIchimoku((prev) => {
                  const next = !prev;
                  if (next) setShowMA({ ma5: false, ma20: false, ma60: false });
                  return next;
                });
              }}
              style={{
                flexShrink: 0, padding: "6px 12px", fontSize: 12, borderRadius: 20, border: B,
                fontWeight: showIchimoku ? 600 : 400,
                background: showIchimoku ? "rgba(171,71,188,0.15)" : "transparent",
                color: showIchimoku ? "#ab47bc" : "var(--color-text-tertiary)",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              일목균형표
            </button>
            <button
              onClick={() => setShowOrderbookLines((prev) => !prev)}
              style={{
                flexShrink: 0, padding: "6px 12px", fontSize: 12, borderRadius: 20, border: B,
                fontWeight: showOrderbookLines ? 600 : 400,
                background: showOrderbookLines ? "rgba(91, 141, 239, 0.15)" : "transparent",
                color: showOrderbookLines ? "#5b8def" : "var(--color-text-tertiary)",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              호가 지지/저항
            </button>
            <span
              onClick={(e) => { e.stopPropagation(); setShowObTooltip((v) => !v); }}
              style={{
                width: 18, height: 18, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                background: "var(--color-background-tertiary)", color: "var(--color-text-tertiary)",
                cursor: "pointer", flexShrink: 0, userSelect: "none",
              }}
            >?</span>
            {showObTooltip && (
              <>
                <div onClick={() => setShowObTooltip(false)} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
                <div
                  style={{
                    position: "fixed", top: 60, right: 20, left: 20, zIndex: 1000,
                    maxWidth: 300, margin: "0 auto",
                    background: "var(--color-background-primary)", border: B,
                    borderRadius: 12, padding: "14px 18px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    fontSize: 13, lineHeight: 1.7, color: "var(--color-text-secondary)",
                  }}
                >
                  호가창에서 평균 대비 3배 이상 물량이 쌓인 가격대를 차트에 표시합니다. 해당 가격에서 매수/매도 벽이 형성되어 가격 반전이 일어날 수 있는 구간입니다.
                  <div onClick={() => setShowObTooltip(false)} style={{ marginTop: 10, textAlign: "right", fontSize: 12, color: "var(--color-text-tertiary)", cursor: "pointer" }}>닫기</div>
                </div>
              </>
            )}
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
                {showIchimoku && (
                  <div style={{ position: "absolute", top: 8, left: 8, zIndex: 5, display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 8px", borderRadius: 6, background: "rgba(30,30,56,0.85)" }}>
                    {[
                      { color: "#00bcd4", label: "전환선", style: "dashed" },
                      { color: "#ff9800", label: "기준선" },
                      { color: "#ce93d8", label: "후행스팬", style: "dotted" },
                      { color: "rgba(76,175,80,0.6)", label: "선행A" },
                      { color: "rgba(239,83,80,0.6)", label: "선행B" },
                    ].map(({ color, label, style }) => (
                      <span key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#a0a0c0" }}>
                        <span style={{ display: "inline-block", width: 14, height: 0, borderTop: `2px ${style || "solid"} ${color}` }} />
                        {label}
                      </span>
                    ))}
                  </div>
                )}
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
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
                    매수/매도 대기 물량을 보여줍니다. 물량이 큰 가격대는 지지·저항 역할을 할 수 있습니다.
                  </p>
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

          {/* 기술적 분석 */}
          <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: B }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>기술적 분석</span>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
                이동평균선, RSI, MACD 등 기술적 지표를 종합 분석하여 현재 매수·매도 신호를 보여줍니다. 각 카드를 탭하면 상세 분석을 확인할 수 있습니다.
              </p>
            </div>
            <IndicatorPanel code={code} market={market} timeframe={timeframe} />
          </div>

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
            {showIchimoku && (
              <div style={{ position: "absolute", top: 8, left: 8, zIndex: 5, display: "flex", gap: 8, flexWrap: "wrap", padding: "3px 6px", borderRadius: 6, background: "rgba(30,30,56,0.85)" }}>
                {[
                  { color: "#00bcd4", label: "전환", style: "dashed" },
                  { color: "#ff9800", label: "기준" },
                  { color: "#ce93d8", label: "후행", style: "dotted" },
                  { color: "rgba(76,175,80,0.6)", label: "선행A" },
                  { color: "rgba(239,83,80,0.6)", label: "선행B" },
                ].map(({ color, label, style }) => (
                  <span key={label} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#a0a0c0" }}>
                    <span style={{ display: "inline-block", width: 10, height: 0, borderTop: `2px ${style || "solid"} ${color}` }} />
                    {label}
                  </span>
                ))}
              </div>
            )}
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
              { key: "detect", label: "지지/저항" },
              { key: "indicator", label: "분석" },
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
              <>
                <p style={{ margin: 0, padding: "10px 20px 0", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
                  매수/매도 대기 물량을 보여줍니다. 물량이 큰 가격대는 지지·저항 역할을 할 수 있습니다.
                </p>
                <OrderbookPanel
                  market={market}
                  code={code}
                  onSaveSupportResistance={handleSaveOrderbookSR}
                />
              </>
            )}
            {mobileTab === "investor" && (
              <InvestorPanel market={market} code={code} />
            )}
            {mobileTab === "detect" && (
              <>
                <p style={{ margin: 0, padding: "10px 20px 0", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
                  과거 차트에서 가격이 반복적으로 멈추거나 반등한 가격대를 자동으로 찾아줍니다. 선을 저장하면 해당 가격 도달 시 알림을 받을 수 있습니다.
                </p>
                <AutoDetectPanel
                  market={market}
                  code={code}
                  timeframe={timeframe}
                  onPointsSelected={handleDetectPoints}
                />
              </>
            )}
            {mobileTab === "indicator" && (
              <>
                <p style={{ margin: 0, padding: "10px 20px 0", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
                  이동평균선, RSI, MACD 등 기술적 지표를 종합 분석하여 현재 매수·매도 신호를 보여줍니다. 각 카드를 탭하면 상세 분석을 확인할 수 있습니다.
                </p>
                <IndicatorPanel code={code} market={market} timeframe={timeframe} />
              </>
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
          currentPrice={displayPrice || null}
          positions={positions}
          stockCode={code}
          userId={user?.id}
          onPositionChanged={loadPositions}
        />
      )}

      {/* 포지션 모달 */}
      {editingPosition !== null && editingPosition?.id && (
        <PositionModal
          position={editingPosition}
          lines={lines}
          stockCode={code}
          userId={user?.id}
          currentPrice={displayPrice || null}
          onClose={() => setEditingPosition(null)}
          onSaved={loadPositions}
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
          pendingPoints={pendingPoints}
          onUpdatePoints={setPendingPoints}
          positions={positions}
          stockCode={code}
          userId={user?.id}
          onPositionChanged={loadPositions}
        />
      )}
    </div>
  );
}
