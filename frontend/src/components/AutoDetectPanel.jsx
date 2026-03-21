import { useState, useEffect, useCallback } from "react";
import { getPeaks } from "../api/stocks";

const B = "var(--border-tertiary)";

const DEFAULT_N = { "일봉": 10, "주봉": 5, "월봉": 3, "60분": 20, "30분": 20 };

export default function AutoDetectPanel({ market, code, timeframe, onPointsSelected }) {
  const [n, setN] = useState(DEFAULT_N[timeframe] ?? 10);
  const [peaks, setPeaks] = useState([]);
  const [valleys, setValleys] = useState([]);
  const [selected, setSelected] = useState([]); // [{date, price}, ...]
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState("peaks"); // "peaks" | "valleys"

  // timeframe 변경 시 N 초기화
  useEffect(() => {
    setN(DEFAULT_N[timeframe] ?? 10);
    setSelected([]);
  }, [timeframe]);

  const fetchPeaks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPeaks(market, code, n);
      setPeaks(data.peaks ?? []);
      setValleys(data.valleys ?? []);
    } catch {
      // API 미연결 시 빈 배열 유지
    } finally {
      setLoading(false);
    }
  }, [market, code, n]);

  useEffect(() => {
    fetchPeaks();
  }, [fetchPeaks]);

  const handleSelect = (point) => {
    setSelected((prev) => {
      const alreadyIdx = prev.findIndex((p) => p.date === point.date && p.price === point.price);
      if (alreadyIdx >= 0) {
        // 선택 해제
        return prev.filter((_, i) => i !== alreadyIdx);
      }
      if (prev.length >= 2) {
        // 2개 초과 → 가장 오래된 것 교체
        return [prev[1], point];
      }
      return [...prev, point];
    });
  };

  const isSelected = (point) =>
    selected.some((p) => p.date === point.date && p.price === point.price);

  const handleDraw = () => {
    if (selected.length === 2) {
      onPointsSelected(selected);
      setSelected([]);
    }
  };

  const list = viewMode === "peaks" ? peaks : valleys;
  const dotColor = viewMode === "peaks" ? "#ef4444" : "#3b82f6";

  return (
    <div style={{ padding: "12px 0" }}>
      {/* N 슬라이더 */}
      <div style={{ padding: "0 20px 12px", borderBottom: B }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>민감도</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>N = {n}</span>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
          N개 봉 중 최고(최저)가인 지점을 고점(저점)으로 인식합니다.<br />
          낮을수록 작은 파동도 탐지하고, 높을수록 큰 흐름만 탐지합니다.
        </p>
        <input
          type="range" min={3} max={30} value={n}
          onChange={(e) => setN(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--color-text-primary)" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>민감 (N=3)</span>
          <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>둔감 (N=30)</span>
        </div>
      </div>

      {/* 고점 / 저점 탭 */}
      <div style={{ display: "flex", margin: "12px 20px", border: B, borderRadius: 10, overflow: "hidden" }}>
        {[
          { key: "peaks",   label: `고점 ${peaks.length}개`,   activeColor: "#ef4444" },
          { key: "valleys", label: `저점 ${valleys.length}개`, activeColor: "#3b82f6" },
        ].map(({ key, label, activeColor }) => (
          <button
            key={key}
            onClick={() => setViewMode(key)}
            style={{
              flex: 1, padding: "9px 0", fontSize: 13, fontWeight: viewMode === key ? 600 : 400,
              background: viewMode === key ? activeColor : "transparent",
              color: viewMode === key ? "#ffffff" : "var(--color-text-secondary)",
              border: "none", cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 선택 상태 */}
      {selected.length > 0 && (
        <div style={{ margin: "0 20px 10px", background: "var(--color-background-info)", borderRadius: 10, padding: "10px 14px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--color-text-info)", fontWeight: 600 }}>
            {selected.length === 1 ? "① 선택됨 — 두 번째 점을 선택하세요" : "② 두 점 선택 완료"}
          </p>
          {selected.map((p, i) => (
            <p key={i} style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>
              {i + 1}. {p.date} — {p.price.toLocaleString()}
            </p>
          ))}
        </div>
      )}

      {/* 포인트 리스트 */}
      {loading ? (
        <p style={{ padding: "20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>탐지 중...</p>
      ) : list.length === 0 ? (
        <p style={{ padding: "20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
          탐지된 {viewMode === "peaks" ? "고점" : "저점"}이 없습니다.<br />N값을 낮춰보세요.
        </p>
      ) : (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {list.map((point, i) => {
            const sel = isSelected(point);
            return (
              <div
                key={i}
                onClick={() => handleSelect(point)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "11px 20px",
                  borderBottom: B,
                  background: sel ? "var(--color-background-info)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {point.price.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginLeft: 8 }}>
                      {point.date}
                    </span>
                  </div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", border: `2px solid ${sel ? "var(--color-text-info)" : "var(--color-border-secondary)"}`,
                  background: sel ? "var(--color-text-info)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {sel && <span style={{ fontSize: 11, color: "white", fontWeight: 700 }}>
                    {selected.findIndex((p) => p.date === point.date) + 1}
                  </span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 추세선 그리기 버튼 */}
      {selected.length === 2 && (
        <div style={{ padding: "12px 20px 0" }}>
          <button
            onClick={handleDraw}
            style={{
              width: "100%", padding: "13px 0", fontSize: 14, fontWeight: 700,
              background: "var(--btn-active-bg)", color: "var(--btn-active-text)",
              border: "none", borderRadius: 12, cursor: "pointer",
            }}
          >
            선택한 두 점으로 추세선 그리기
          </button>
        </div>
      )}
    </div>
  );
}
