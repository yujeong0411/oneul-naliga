import { useState, useEffect } from "react";
import { getInvestors } from "../api/stocks";

const B = "var(--border-tertiary)";

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.abs(value) / max * 100 : 0;
  const isPositive = value > 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, height: 18 }}>
      {/* 음수 바 (왼쪽) */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
        {!isPositive && (
          <div style={{
            width: `${pct}%`, height: 14, borderRadius: "3px 0 0 3px",
            background: `${color}30`,
            minWidth: value !== 0 ? 2 : 0,
          }} />
        )}
      </div>
      {/* 중앙선 */}
      <div style={{ width: 1, height: 18, background: "var(--color-border-primary)", flexShrink: 0 }} />
      {/* 양수 바 (오른쪽) */}
      <div style={{ flex: 1 }}>
        {isPositive && (
          <div style={{
            width: `${pct}%`, height: 14, borderRadius: "0 3px 3px 0",
            background: `${color}30`,
            minWidth: value !== 0 ? 2 : 0,
          }} />
        )}
      </div>
    </div>
  );
}

export default function InvestorPanel({ market, code }) {
  const isDomestic = /^\d{6}$/.test(code);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isDomestic) return;
    setLoading(true);
    getInvestors(market, code, 20)
      .then((d) => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [market, code, isDomestic]);

  if (!isDomestic) {
    return (
      <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
        해외 종목은 투자자 매매동향을 지원하지 않습니다
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
        불러오는 중...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
        데이터가 없습니다
      </div>
    );
  }

  // 오늘 데이터 요약
  const today = data[0];
  const investors = [
    { label: "개인", key: "individual", color: "#f59e0b" },
    { label: "외국인", key: "foreign", color: "#6366f1" },
    { label: "기관", key: "institution", color: "#ef4444" },
  ];

  const maxVal = Math.max(
    ...investors.map((inv) => Math.abs(today[inv.key] || 0)),
    1,
  );

  // 최근 5일 합산
  const recent5 = data.slice(0, 5);
  const sum5 = investors.map((inv) => ({
    ...inv,
    total: recent5.reduce((s, d) => s + (d[inv.key] || 0), 0),
  }));
  const maxSum5 = Math.max(...sum5.map((s) => Math.abs(s.total)), 1);

  const fmtQty = (v) => {
    if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}만`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}천`;
    return v.toLocaleString();
  };

  const fmtDate = (d) => {
    if (!d || d.length < 8) return d;
    return `${d.slice(4, 6)}.${d.slice(6, 8)}`;
  };

  return (
    <div style={{ fontSize: 12 }}>

      {/* 오늘 요약 */}
      <div style={{ padding: "14px 16px", borderBottom: B }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12 }}>
          오늘 순매수
          <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-tertiary)", marginLeft: 6 }}>
            {fmtDate(today.date)}
          </span>
        </div>
        {investors.map((inv) => {
          const val = today[inv.key] || 0;
          return (
            <div key={inv.key} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: inv.color }} />
                  <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{inv.label}</span>
                </div>
                <span style={{
                  fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: val > 0 ? "var(--color-rise)" : val < 0 ? "var(--color-fall)" : "var(--color-text-tertiary)",
                }}>
                  {val > 0 ? "+" : ""}{fmtQty(val)}주
                </span>
              </div>
              <Bar value={val} max={maxVal} color={inv.color} />
            </div>
          );
        })}
      </div>

      {/* 5일 합산 */}
      <div style={{ padding: "14px 16px", borderBottom: B }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 12 }}>
          최근 5일 합산
        </div>
        {sum5.map((inv) => (
          <div key={inv.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: inv.color }} />
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{inv.label}</span>
              </div>
              <span style={{
                fontWeight: 700, fontVariantNumeric: "tabular-nums",
                color: inv.total > 0 ? "var(--color-rise)" : inv.total < 0 ? "var(--color-fall)" : "var(--color-text-tertiary)",
              }}>
                {inv.total > 0 ? "+" : ""}{fmtQty(inv.total)}주
              </span>
            </div>
            <Bar value={inv.total} max={maxSum5} color={inv.color} />
          </div>
        ))}
      </div>

      {/* 일별 테이블 */}
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 10 }}>
          일별 추이
        </div>
        {/* 헤더 */}
        <div style={{
          display: "grid", gridTemplateColumns: "50px 1fr 1fr 1fr",
          padding: "6px 0", borderBottom: B, fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)",
        }}>
          <span>날짜</span>
          <span style={{ textAlign: "right" }}>개인</span>
          <span style={{ textAlign: "right" }}>외국인</span>
          <span style={{ textAlign: "right" }}>기관</span>
        </div>
        {/* 행 */}
        {data.slice(0, 10).map((d, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "50px 1fr 1fr 1fr",
            padding: "7px 0", borderBottom: i < 9 ? `1px solid var(--color-background-secondary)` : "none",
            fontSize: 11, fontVariantNumeric: "tabular-nums",
          }}>
            <span style={{ color: "var(--color-text-tertiary)" }}>{fmtDate(d.date)}</span>
            <span style={{ textAlign: "right", color: d.individual > 0 ? "var(--color-rise)" : d.individual < 0 ? "var(--color-fall)" : "var(--color-text-tertiary)" }}>
              {d.individual > 0 ? "+" : ""}{fmtQty(d.individual)}
            </span>
            <span style={{ textAlign: "right", color: d.foreign > 0 ? "var(--color-rise)" : d.foreign < 0 ? "var(--color-fall)" : "var(--color-text-tertiary)" }}>
              {d.foreign > 0 ? "+" : ""}{fmtQty(d.foreign)}
            </span>
            <span style={{ textAlign: "right", color: d.institution > 0 ? "var(--color-rise)" : d.institution < 0 ? "var(--color-fall)" : "var(--color-text-tertiary)" }}>
              {d.institution > 0 ? "+" : ""}{fmtQty(d.institution)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
