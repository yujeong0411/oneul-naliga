import { useState, useRef } from "react";

const B = "var(--border-tertiary)";
const SENSITIVITY_LABELS = ["±0.3%", "±0.5%", "±0.7%", "±1.0%", "±1.5%"];
const SENSITIVITY_VALUES = [0.3, 0.5, 0.7, 1.0, 1.5];
const COLOR_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

export default function EditLineSheet({ line, onClose, onSave }) {
  const [name, setName] = useState(line.name || "");
  const [selectedColor, setSelectedColor] = useState(line.color || "#ef4444");
  const initialIdx = SENSITIVITY_VALUES.findIndex((v) => v === line.sensitivity) ?? 1;
  const [sensitivityIdx, setSensitivityIdx] = useState(initialIdx >= 0 ? initialIdx : 1);

  const sheetRef = useRef(null);
  const startY = useRef(0);

  const onTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transition = "none";
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onTouchEnd = (e) => {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 100) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.3s ease";
      sheetRef.current.style.transform = "translateY(0)";
    }
  };

  const handleSave = () => {
    onSave(line.id, {
      name: name || line.name,
      color: selectedColor,
      sensitivity: SENSITIVITY_VALUES[sensitivityIdx],
    });
  };

  const target = line.line_type === "horizontal" ? line.price : line.y2;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }} />

      <div
        ref={sheetRef}
        style={{
          position: "relative",
          background: "var(--color-background-primary)",
          borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 480,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* 핸들 */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", cursor: "grab" }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
        </div>

        {/* 헤더 */}
        <div style={{ padding: "8px 20px 12px", borderBottom: B }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: selectedColor, flexShrink: 0 }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>선 수정</span>
          </div>
          {target && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {line.line_type === "horizontal" ? "수평선" : "추세선"} · {target.toLocaleString()}
            </p>
          )}
        </div>

        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 이름 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="선 이름"
              style={{
                width: "100%", fontSize: 14, padding: "11px 14px", border: B,
                borderRadius: 10, outline: "none", boxSizing: "border-box",
                color: "var(--color-text-primary)", background: "var(--color-background-secondary)",
              }}
            />
          </div>

          {/* 색상 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>색상</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {COLOR_PRESETS.map((c) => (
                <div
                  key={c}
                  onClick={() => setSelectedColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: c,
                    border: selectedColor === c ? "3px solid var(--color-text-primary)" : "3px solid transparent",
                    cursor: "pointer", boxSizing: "border-box",
                    outline: selectedColor === c ? `2px solid ${c}` : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          {/* 알림 민감도 */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>알림 민감도</label>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {SENSITIVITY_LABELS[sensitivityIdx]}
              </span>
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

          {/* 버튼 */}
          <button
            onClick={handleSave}
            style={{
              width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700,
              background: "var(--color-text-primary)", color: "var(--color-background-primary)",
              border: "none", borderRadius: 12, cursor: "pointer",
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
