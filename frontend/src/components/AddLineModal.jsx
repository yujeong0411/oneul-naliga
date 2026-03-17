import { useState } from "react";

const B = "var(--border-tertiary)";

export default function AddLineModal({ onClose, onSave, preselectedType = null }) {
  const [tab, setTab] = useState(preselectedType || "trend");
  const [lineName, setLineName] = useState("");
  const [signalType, setSignalType] = useState("loss");
  const [price, setPrice] = useState("");

  const handleSave = () => {
    if (tab === "horizontal" && !price) return;
    onSave({
      name: lineName || (tab === "trend" ? "추세선" : "수평선"),
      type: tab,
      signalType,
      color: signalType === "loss" ? "#ef4444" : "#10b981",
      targetPrice: tab === "horizontal" ? Number(price) : null,
      distance: null,
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }} />

      <div style={{ position: "relative", background: "var(--color-background-primary)", border: B, borderRadius: 16, width: "100%", maxWidth: 480, margin: "0 16px", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: B }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>선 추가</span>
          <span onClick={onClose} style={{ fontSize: 18, color: "var(--color-text-tertiary)", cursor: "pointer", lineHeight: 1 }}>×</span>
        </div>

        <div style={{ padding: 20 }}>
          {/* Tabs */}
          {!preselectedType && (
            <div style={{ display: "flex", gap: 0, marginBottom: 20, border: B, borderRadius: 8, overflow: "hidden" }}>
              <button
                onClick={() => setTab("trend")}
                style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: tab === "trend" ? 500 : 400, background: tab === "trend" ? "var(--color-background-warning)" : "var(--color-background-primary)", color: tab === "trend" ? "var(--color-text-warning)" : "var(--color-text-secondary)", border: "none", cursor: "pointer" }}
              >
                추세선 (두 점 클릭)
              </button>
              <button
                onClick={() => setTab("horizontal")}
                style={{ flex: 1, padding: 10, fontSize: 13, fontWeight: tab === "horizontal" ? 500 : 400, background: tab === "horizontal" ? "var(--color-background-warning)" : "var(--color-background-primary)", color: tab === "horizontal" ? "var(--color-text-warning)" : "var(--color-text-secondary)", border: "none", borderLeft: B, cursor: "pointer" }}
              >
                수평선 (가격 입력)
              </button>
            </div>
          )}

          {/* 추세선 안내 */}
          {tab === "trend" && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              {preselectedType ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-success)", fontWeight: 500 }}>✓ 차트에서 두 점이 선택됐습니다. 선 정보를 입력하세요.</p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>"차트에서 선 긋기 시작" 버튼을 눌러 두 점을 클릭하면 자동으로 열립니다.</p>
              )}
            </div>
          )}

          {/* 수평선 가격 */}
          {tab === "horizontal" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>지지/저항 가격 (원)</label>
              <input
                type="number"
                placeholder="예: 70000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ width: "100%", fontSize: 15, fontWeight: 500, padding: "10px 12px", border: B, borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)" }}
              />
            </div>
          )}

          {/* 선 이름 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>선 이름</label>
            <input
              type="text"
              placeholder={tab === "trend" ? "예: 1월 고점 저항선" : "예: 1월 저점 지지선"}
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              style={{ width: "100%", fontSize: 13, padding: "9px 12px", border: B, borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)" }}
            />
          </div>

          {/* 신호 종류 */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>신호 종류</label>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, border: signalType === "loss" ? "2px solid var(--color-border-danger)" : B, background: signalType === "loss" ? "var(--color-background-danger)" : "var(--color-background-primary)", cursor: "pointer" }}>
                <input type="radio" name="signal" checked={signalType === "loss"} onChange={() => setSignalType("loss")} style={{ accentColor: "#dc2626" }} />
                <span style={{ fontSize: 13, color: signalType === "loss" ? "var(--color-text-danger)" : "var(--color-text-secondary)", fontWeight: signalType === "loss" ? 500 : 400 }}>로스 지점</span>
              </label>
              <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, border: signalType === "attack" ? "2px solid var(--color-border-success)" : B, background: signalType === "attack" ? "var(--color-background-success)" : "var(--color-background-primary)", cursor: "pointer" }}>
                <input type="radio" name="signal" checked={signalType === "attack"} onChange={() => setSignalType("attack")} style={{ accentColor: "#16a34a" }} />
                <span style={{ fontSize: 13, color: signalType === "attack" ? "var(--color-text-success)" : "var(--color-text-secondary)", fontWeight: signalType === "attack" ? 500 : 400 }}>공격 지점</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={handleSave}
            style={{ width: "100%", padding: 12, fontSize: 14, fontWeight: 500, background: "#f59e0b", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            선 저장하기
          </button>
        </div>
      </div>
    </div>
  );
}
