import { useState } from "react";

const B = "var(--border-tertiary)";
const TIMEFRAMES = ["일봉", "주봉", "월봉", "년봉", "1분", "3분", "5분", "10분", "15분", "30분", "60분"];
const SENSITIVITY_LABELS = ["±0.3%", "±0.5%", "±0.7%", "±1.0%", "±1.5%"];
const SENSITIVITY_VALUES = [0.3, 0.5, 0.7, 1.0, 1.5];

export default function AddLineModal({
  onClose,
  onSave,
  preselectedType = null,   // "trend" | "horizontal" | null
  defaultTimeframe = "일봉",
}) {
  const [tab, setTab] = useState(preselectedType || "horizontal");
  const [lineName, setLineName] = useState("");
  const [signalType, setSignalType] = useState("loss");
  const [timeframe, setTimeframe] = useState(defaultTimeframe);
  const [price, setPrice] = useState("");
  const [sensitivityIdx, setSensitivityIdx] = useState(1); // default 0.5%

  const handleSave = () => {
    if (tab === "horizontal" && !price) return;
    onSave({
      line_type: tab,
      name: lineName || (tab === "trend" ? "추세선" : "수평선"),
      signal_type: signalType,
      timeframe,
      sensitivity: SENSITIVITY_VALUES[sensitivityIdx],
      price: tab === "horizontal" ? Number(price) : null,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }} />

      {/* 바텀시트 스타일 */}
      <div style={{
        position: "relative",
        background: "var(--color-background-primary)",
        borderRadius: "20px 20px 0 0",
        width: "100%", maxWidth: 480,
        overflow: "hidden",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {/* 핸들 */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
        </div>

        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 12px", borderBottom: B }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>{preselectedType === "trend" ? "추세선 저장" : "수평선 추가"}</span>
          <span onClick={onClose} style={{ fontSize: 20, color: "var(--color-text-tertiary)", cursor: "pointer", lineHeight: 1 }}>×</span>
        </div>

        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 추세선 안내 (차트에서 두 점 선택 후 열린 경우) */}
          {preselectedType === "trend" && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "12px 14px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-success)", fontWeight: 500 }}>두 점이 선택됐습니다. 선 정보를 입력하세요.</p>
            </div>
          )}

          {/* 수평선 가격 (수동 추가 시) */}
          {tab === "horizontal" && (
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>지지 / 저항 가격</label>
              <input
                type="number"
                placeholder="예: 70000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{
                  width: "100%", fontSize: 16, fontWeight: 600, padding: "12px 14px",
                  border: B, borderRadius: 10, outline: "none", boxSizing: "border-box",
                  color: "var(--color-text-primary)", background: "var(--color-background-secondary)",
                }}
              />
            </div>
          )}

          {/* 신호 종류 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>선 종류</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { key: "loss", label: "지지선", activeBorder: "var(--color-border-danger)", activeBg: "var(--color-background-danger)", activeColor: "var(--color-text-danger)" },
                { key: "attack", label: "저항선", activeBorder: "var(--color-border-success)", activeBg: "var(--color-background-success)", activeColor: "var(--color-text-success)" },
              ].map(({ key, label, activeBorder, activeBg, activeColor }) => (
                <label key={key} style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "11px 12px",
                  borderRadius: 10, cursor: "pointer",
                  border: signalType === key ? `2px solid ${activeBorder}` : B,
                  background: signalType === key ? activeBg : "transparent",
                }}>
                  <input type="radio" name="signal" checked={signalType === key} onChange={() => setSignalType(key)} style={{ display: "none" }} />
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${signalType === key ? activeBorder : "var(--color-border-primary)"}`, background: signalType === key ? activeBorder : "transparent", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: signalType === key ? 600 : 400, color: signalType === key ? activeColor : "var(--color-text-secondary)" }}>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 선 이름 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>선 이름 (선택)</label>
            <input
              type="text"
              placeholder={tab === "trend" ? "예: 1월 고점 저항선" : "예: 1월 저점 지지선"}
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              style={{
                width: "100%", fontSize: 14, padding: "11px 14px", border: B,
                borderRadius: 10, outline: "none", boxSizing: "border-box",
                color: "var(--color-text-primary)", background: "var(--color-background-secondary)",
              }}
            />
          </div>

          {/* 민감도 */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>알림 민감도</label>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{SENSITIVITY_LABELS[sensitivityIdx]}</span>
            </div>
            <input
              type="range" min={0} max={4} value={sensitivityIdx}
              onChange={(e) => setSensitivityIdx(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--color-text-info)" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>정밀 ±0.3%</span>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>여유 ±1.5%</span>
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={tab === "horizontal" && !price}
            style={{
              width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700,
              background: "var(--color-text-primary)", color: "white",
              border: "none", borderRadius: 12, cursor: "pointer",
              opacity: tab === "horizontal" && !price ? 0.4 : 1,
            }}
          >
            선 저장하기
          </button>
        </div>
      </div>
    </div>
  );
}
