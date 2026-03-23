import { useState, useRef } from "react";

const B = "var(--border-tertiary)";
const SENSITIVITY_LABELS = ["±0.3%", "±0.5%", "±0.7%", "±1.0%", "±1.5%"];
const SENSITIVITY_VALUES = [0.3, 0.5, 0.7, 1.0, 1.5];
const COLOR_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

export default function AddLineModal({
  onClose,
  onSave,
  preselectedType = null,   // "trend" | "horizontal" | null
  defaultTimeframe = "일봉",
  currentPrice = null,
  pendingPoints = null,
  onUpdatePoints = null,
}) {
  const isTrend = preselectedType === "trend";
  const [lineName, setLineName] = useState("");
  const [price, setPrice] = useState("");
  const [sensitivityIdx, setSensitivityIdx] = useState(1);
  const [selectedColor, setSelectedColor] = useState("#ef4444");

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
    if (!isTrend && !price) return;

    // 현재가와 비교해 자동으로 지지/저항 결정 (알림용)
    const priceNum = Number(price);
    const signalType = (!currentPrice || priceNum <= currentPrice) ? "loss" : "attack";

    onSave({
      line_type: isTrend ? "trend" : "horizontal",
      name: lineName || (isTrend ? "추세선" : "수평선"),
      signal_type: signalType,
      timeframe: defaultTimeframe,
      sensitivity: SENSITIVITY_VALUES[sensitivityIdx],
      price: isTrend ? null : priceNum,
      color: selectedColor,
    });
  };

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
          overflow: "hidden",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* 핸들 (드래그 영역) */}
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
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
            {isTrend ? "추세선 저장" : "수평선 추가"}
          </span>
        </div>

        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 추세선 두 점 가격 수정 */}
          {isTrend && pendingPoints?.length === 2 && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {pendingPoints.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: "#00e676",
                    background: "rgba(0,230,118,0.12)", borderRadius: 4, padding: "2px 6px",
                    flexShrink: 0,
                  }}>
                    P{i + 1}
                  </span>
                  <input
                    type="number"
                    value={p.price}
                    onChange={(e) => {
                      if (!onUpdatePoints) return;
                      const updated = [...pendingPoints];
                      updated[i] = { ...updated[i], price: Number(e.target.value) };
                      onUpdatePoints(updated);
                    }}
                    style={{
                      flex: 1, fontSize: 14, fontWeight: 600, padding: "8px 10px",
                      border: B, borderRadius: 8, outline: "none", boxSizing: "border-box",
                      color: "var(--color-text-primary)", background: "var(--color-background-primary)",
                    }}
                  />
                </div>
              ))}
              <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                클릭 위치가 부정확하면 가격을 직접 수정하세요.
              </p>
            </div>
          )}

          {/* 가격 입력 (수평선만) */}
          {!isTrend && (
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>
                가격
              </label>
              <input
                type="number"
                placeholder={currentPrice ? `현재가: ${currentPrice.toLocaleString()}` : "예: 70000"}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{
                  width: "100%", fontSize: 16, fontWeight: 600, padding: "12px 14px",
                  border: B, borderRadius: 10, outline: "none", boxSizing: "border-box",
                  color: "var(--color-text-primary)", background: "var(--color-background-secondary)",
                }}
              />
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                현재가보다 낮으면 지지선, 높으면 저항선으로 자동 분류됩니다.
              </p>
            </div>
          )}

          {/* 선 이름 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>
              이름 (선택)
            </label>
            <input
              type="text"
              placeholder={isTrend ? "예: 1월 추세선" : "예: 목표가, 손절가…"}
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              style={{
                width: "100%", fontSize: 14, padding: "11px 14px", border: B,
                borderRadius: 10, outline: "none", boxSizing: "border-box",
                color: "var(--color-text-primary)", background: "var(--color-background-secondary)",
              }}
            />
          </div>

          {/* 색상 선택 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>
              색상
            </label>
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
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                알림 민감도
              </label>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {SENSITIVITY_LABELS[sensitivityIdx]}
              </span>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--color-text-tertiary)" }}>
              현재가가 이 선에 얼마나 가까워지면 알림을 보낼지 설정합니다.
            </p>
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
            disabled={!isTrend && !price}
            style={{
              width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700,
              background: "var(--color-text-primary)", color: "var(--color-background-primary)",
              border: "none", borderRadius: 12, cursor: "pointer",
              opacity: !isTrend && !price ? 0.4 : 1,
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
