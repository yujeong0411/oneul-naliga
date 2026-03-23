import { useState, useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

/** ChartDetail timeframe 문자열 → indicator candle_type 변환 */
function toCandleType(timeframe = "일봉") {
  if (timeframe === "주봉") return "W";
  if (timeframe === "월봉" || timeframe === "년봉") return "M";
  if (timeframe.endsWith("분")) return timeframe.replace("분", ""); // "5분" → "5"
  return "D"; // 일봉 기본
}

const CAT_LABELS = {
  trend: "추세",
  momentum: "모멘텀",
  volatility: "변동성",
  relative_strength: "상대강도",
};

const SIG_COLOR = {
  buy: "var(--color-signal-buy)",
  sell: "var(--color-signal-sell)",
  neutral: "var(--color-text-tertiary)",
};

const SIG_BG = {
  buy: "var(--color-signal-bg-buy)",
  sell: "var(--color-signal-bg-sell)",
  neutral: "var(--color-background-tertiary)",
};

const SIG_LABEL = { buy: "매수", sell: "매도", neutral: "중립" };

// ── 신호 배지 ────────────────────────────────────────────
function SignalBadge({ signal, small }) {
  return (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 700,
      padding: small ? "1px 5px" : "2px 7px", borderRadius: 4,
      color: SIG_COLOR[signal] || "var(--color-text-tertiary)",
      background: SIG_BG[signal] || "var(--color-background-tertiary)",
    }}>
      {SIG_LABEL[signal] || signal}
    </span>
  );
}

// ── 점수 바 ──────────────────────────────────────────────
function ScoreBar({ score, buy, neutral, sell }) {
  const total = buy + neutral + sell || 1;
  const needleLeft = `${score}%`;

  return (
    <div style={{ padding: "16px 20px" }}>
      {/* 레이블 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--color-signal-sell)", fontWeight: 600 }}>
          매도 {sell}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>
          종합 {score}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-signal-buy)", fontWeight: 600 }}>
          매수 {buy}
        </span>
      </div>

      {/* 바 */}
      <div style={{ position: "relative", height: 7, borderRadius: 4, overflow: "visible",
        background: `linear-gradient(to right, var(--color-signal-sell) 0%, var(--color-border-primary) 50%, var(--color-signal-buy) 100%)`,
        opacity: 0.45,
      }}>
        <div style={{
          position: "absolute", left: `calc(${score}% - 2px)`, top: -4,
          width: 4, height: 15, borderRadius: 2,
          background: score >= 60 ? "var(--color-signal-buy)" : score <= 40 ? "var(--color-signal-sell)" : "#f59e0b",
          boxShadow: score >= 60 ? "0 1px 6px rgba(34,197,94,0.6)" : score <= 40 ? "0 1px 6px rgba(239,68,68,0.6)" : "0 1px 6px rgba(245,158,11,0.6)",
        }} />
      </div>

      {/* 매수/중립/매도 카운트 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, gap: 6 }}>
        {[
          { label: "매도", count: sell, color: "var(--color-signal-sell)", bg: "var(--color-signal-bg-sell)" },
          { label: "중립", count: neutral, color: "var(--color-text-secondary)", bg: "var(--color-background-tertiary)" },
          { label: "매수", count: buy, color: "var(--color-signal-buy)", bg: "var(--color-signal-bg-buy)" },
        ].map(({ label, count, color, bg }) => (
          <div key={label} style={{ flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 10, background: bg }}>
            <div style={{ fontSize: 17, fontWeight: 700, color }}>{count}</div>
            <div style={{ fontSize: 10, color, marginTop: 2, opacity: 0.8 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 카테고리 카드 그리드 ─────────────────────────────────
function CategoryGrid({ categories, onSelect, selected }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 12px" }}>
      {Object.entries(categories).map(([key, cat]) => (
        <button
          key={key}
          onClick={() => onSelect(selected === key ? null : key)}
          style={{
            background: selected === key ? SIG_BG[cat.signal] : "var(--color-background-secondary)",
            border: `1.5px solid ${selected === key ? SIG_COLOR[cat.signal] : "var(--color-border-primary)"}`,
            borderRadius: 12, padding: "11px 13px", cursor: "pointer",
            textAlign: "left", transition: "all 0.15s ease",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>
            {CAT_LABELS[key]}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SignalBadge signal={cat.signal} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-primary)" }}>
              <span style={{ color: "var(--color-signal-buy)" }}>{cat.buy}↑</span>
              {" "}
              <span style={{ color: "var(--color-signal-sell)" }}>{cat.sell}↓</span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── 일목균형표 상세 카드 ─────────────────────────────────
function IchimokuCard({ ichimoku }) {
  if (!ichimoku) return null;
  const { tenkan, kijun, senkou_a, senkou_b, chikou, cloud_color, price_vs_cloud, cloud_thickness, signal } = ichimoku;
  const fmt = (v) => v?.toLocaleString() ?? "—";
  const cloudLabel = cloud_color === "green" ? "상승구름" : "하락구름";
  const posLabel = { above: "구름 위", inside: "구름 안", below: "구름 아래" }[price_vs_cloud] || "—";

  return (
    <div style={{ margin: "0 16px 12px", padding: 14, borderRadius: 12, background: "var(--color-background-secondary)", border: "1.5px solid var(--color-border-primary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>일목균형표</span>
        <SignalBadge signal={signal} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ color: "#00bcd4", fontWeight: 600 }}>전환선</span> {fmt(tenkan)}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ color: "#ff9800", fontWeight: 600 }}>기준선</span> {fmt(kijun)}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ color: "rgba(76,175,80,0.8)", fontWeight: 600 }}>선행A</span> {fmt(senkou_a)}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ color: "rgba(239,83,80,0.8)", fontWeight: 600 }}>선행B</span> {fmt(senkou_b)}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ color: "#ce93d8", fontWeight: 600 }}>후행스팬</span> {fmt(chikou)}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          <span style={{ fontWeight: 600 }}>구름두께</span> {fmt(cloud_thickness)}
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
          background: cloud_color === "green" ? "var(--color-signal-bg-buy)" : "var(--color-signal-bg-sell)",
          color: cloud_color === "green" ? "var(--color-signal-buy)" : "var(--color-signal-sell)",
        }}>
          {cloudLabel}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{posLabel}</span>
      </div>
    </div>
  );
}

// ── 지표 상세 리스트 ─────────────────────────────────────
function IndicatorList({ indicators }) {
  return (
    <div>
      {indicators.map((ind) => (
        <div
          key={ind.key}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 20px",
            borderBottom: "1px solid var(--color-border-tertiary)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {ind.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
              {ind.detail || "—"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {ind.value !== null && ind.value !== undefined && (
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {typeof ind.value === "number" ? ind.value.toFixed(ind.value > 1000 ? 0 : ind.value > 10 ? 1 : 2) : ind.value}
              </span>
            )}
            <SignalBadge signal={ind.signal} small />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────
export default function IndicatorPanel({ code, market, timeframe = "일봉" }) {
  const candleType = toCandleType(timeframe);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCat, setSelectedCat] = useState(null);

  const wsRef = useRef(null);
  const lastDataRef = useRef(null);  // 깜빡임 방지용 이전 데이터

  const isMinute = candleType !== "D" && candleType !== "W" && candleType !== "M";
  const isRestOnly = ["W", "M"].includes(candleType);  // 주봉/월봉은 REST만

  // 해외 종목은 준비 중
  if (market === "US") {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>🌐</div>
        <div style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 600, marginBottom: 6 }}>
          해외 종목 분석 준비 중
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          국내 종목에서 기술적 지표를 확인하세요
        </div>
      </div>
    );
  }

  // REST 호출 (주봉/월봉 + 초기 로드)
  const fetchRest = async (ct) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${API_URL}/api/stocks/indicators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, candle_type: ct }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const json = await resp.json();
      lastDataRef.current = json;
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // WS 연결 — 실패 시 REST로 폴백
  const connectWs = (ct) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const url = `${WS_URL}/ws/indicators/${code}?candle_type=${ct}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    let gotData = false;

    ws.onmessage = (e) => {
      try {
        const json = JSON.parse(e.data);
        gotData = true;
        lastDataRef.current = json;
        setData(json);
        setLoading(false);
        setError(null);
      } catch {}
    };
    // WS 오류/종료 시 데이터가 없으면 REST로 조용히 폴백
    const fallback = () => {
      if (!gotData) fetchRest(ct);
    };
    ws.onerror = fallback;
    ws.onclose = fallback;
  };

  useEffect(() => {
    // code가 바뀌면 이전 데이터 초기화 (다른 종목 데이터 잔상 방지)
    if (lastDataRef.current && lastDataRef.current.code !== code) {
      lastDataRef.current = null;
      setData(null);
    }

    if (isRestOnly) {
      // 주봉/월봉: WS 닫고 REST만
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      fetchRest(candleType);
    } else if (isMinute) {
      // 분봉: WS 연결
      setLoading(!lastDataRef.current);
      connectWs(candleType);
    } else {
      // 일봉: WS 연결
      setLoading(!lastDataRef.current);
      connectWs(candleType);
    }

    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [code, timeframe]);

  const displayData = data;

  return (
    <div style={{ background: "var(--color-background-primary)" }}>
      {/* 로딩 or 오류 (데이터 없을 때만) */}
      {!displayData && (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          {error ? (
            <>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                지표를 불러오지 못했습니다
              </div>
              <button
                onClick={() => fetchRest(candleType)}
                style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8,
                  background: "var(--color-background-secondary)", border: "none", cursor: "pointer",
                  color: "var(--color-text-primary)" }}
              >
                다시 시도
              </button>
            </>
          ) : (
            <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
              지표 계산 중...
            </span>
          )}
        </div>
      )}

      {/* 데이터 */}
      {displayData && (
        <>
          {/* 종합 신호 바 */}
          <ScoreBar
            score={displayData.signal_summary.score}
            buy={displayData.signal_summary.buy}
            neutral={displayData.signal_summary.neutral}
            sell={displayData.signal_summary.sell}
          />

          {/* 카테고리 그리드 */}
          <CategoryGrid
            categories={displayData.categories}
            onSelect={setSelectedCat}
            selected={selectedCat}
          />

          {/* 선택한 카테고리 지표 상세 */}
          {selectedCat && displayData.categories[selectedCat] && (
            <div style={{ borderTop: "1px solid var(--color-border-tertiary)" }}>
              <div style={{ padding: "10px 20px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>
                  {CAT_LABELS[selectedCat]}
                </span>
                <button
                  onClick={() => setSelectedCat(null)}
                  style={{ border: "none", background: "none", cursor: "pointer",
                    fontSize: 13, color: "var(--color-text-tertiary)", padding: "2px 4px" }}
                >
                  ×
                </button>
              </div>
              <IndicatorList indicators={displayData.categories[selectedCat].indicators} />
            </div>
          )}

          {/* 일목균형표 카드 */}
          {(() => {
            const ichInd = displayData.categories?.trend?.indicators?.find((i) => i.key === "ichimoku");
            return ichInd?.ichimoku ? <IchimokuCard ichimoku={ichInd.ichimoku} /> : null;
          })()}

          {/* 업데이트 시각 */}
          <div style={{ padding: "8px 20px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
              {timeframe} 기준
            </span>
            <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
              {new Date(displayData.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              {loading && " · 갱신 중"}
            </span>
          </div>

          {/* 면책 문구 */}
          <div style={{
            margin: "0 16px 14px", padding: "9px 12px", borderRadius: 8,
            background: "rgba(255, 120, 0, 0.08)",
            borderLeft: "3px solid orange",
            display: "flex", alignItems: "flex-start", gap: 7,
          }}>
            <span style={{ fontSize: 13, color: "orange", marginTop: 1, flexShrink: 0 }}>⚠</span>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              <strong style={{ color: "orange", fontWeight: 700 }}>참고용</strong>
              {" "}— 지표 종합이며 확정 매매 신호가 아닙니다. 복수 시간대와 거래량을 함께 확인하세요.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
