import { useState, useRef } from "react";
import { createPosition, updatePosition } from "../api/positions";

const B = "var(--border-tertiary)";
const SENSITIVITY_LABELS = ["±0.3%", "±0.5%", "±0.7%", "±1.0%", "±1.5%"];
const SENSITIVITY_VALUES = [0.3, 0.5, 0.7, 1.0, 1.5];
const COLOR_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

const INTENTS = [
  { value: "buy", label: "매수 기준선", color: "#22c55e" },
  { value: "sell", label: "매도 기준선", color: "#3b82f6" },
  { value: "stop", label: "손절 기준선", color: "#ef4444" },
  { value: "watch", label: "관찰용", color: "#6b7280" },
];

export default function AddLineModal({
  onClose,
  onSave,
  preselectedType = null,
  defaultTimeframe = "일봉",
  currentPrice = null,
  pendingPoints = null,
  onUpdatePoints = null,
  positions = [],
  stockCode = "",
  userId = null,
  onPositionChanged = null,
}) {
  const isTrend = preselectedType === "trend";
  const [lineName, setLineName] = useState("");
  const [price, setPrice] = useState("");
  const [sensitivityIdx, setSensitivityIdx] = useState(1);
  const [selectedColor, setSelectedColor] = useState("#ef4444");
  const [intent, setIntent] = useState(null);
  const [posTarget, setPosTarget] = useState("new");
  const [entryPriceInput, setEntryPriceInput] = useState("");
  const [saving, setSaving] = useState(false);
  const isDomestic = /^\d{6}$/.test(stockCode);

  const openPositions = positions.filter((p) => p.status === "open");

  const sheetRef = useRef(null);
  const startY = useRef(0);
  const onTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && sheetRef.current) { sheetRef.current.style.transition = "none"; sheetRef.current.style.transform = `translateY(${dy}px)`; }
  };
  const onTouchEnd = (e) => {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 100) onClose();
    else if (sheetRef.current) { sheetRef.current.style.transition = "transform 0.3s ease"; sheetRef.current.style.transform = "translateY(0)"; }
  };

  const handleSave = async () => {
    if (!isTrend && !price) return;
    setSaving(true);

    const priceNum = Number(price);
    const signalType = (!currentPrice || priceNum <= currentPrice) ? "loss" : "attack";

    // 1. 선 저장
    const lineData = {
      line_type: isTrend ? "trend" : "horizontal",
      name: lineName || (isTrend ? "추세선" : "수평선"),
      signal_type: signalType,
      timeframe: defaultTimeframe,
      sensitivity: SENSITIVITY_VALUES[sensitivityIdx],
      price: isTrend ? null : priceNum,
      color: selectedColor,
      intent: intent,
    };

    try {
      const savedLine = await onSave(lineData);

      // 2. 포지션 자동 생성/연결 (의도가 있고 watch가 아닐 때)
      if (intent && intent !== "watch" && savedLine?.id) {
        const linePrice = isTrend ? null : priceNum;
        const entryVal = entryPriceInput ? Number(entryPriceInput) : null;
        if (intent === "buy") {
          const body = { stock_code: stockCode, user_id: userId, entry_line_ids: [savedLine.id] };
          if (entryVal) body.entry_price = entryVal;
          if (posTarget === "new") {
            await createPosition(body);
          } else {
            await updatePosition(posTarget, { add_lines: [{ line_id: savedLine.id, role: "entry" }], ...(entryVal ? { entry_price: entryVal } : {}) });
          }
        } else if (intent === "sell" && posTarget && posTarget !== "new") {
          await updatePosition(posTarget, { add_lines: [{ line_id: savedLine.id, role: "tp" }], tp_price: linePrice });
        } else if (intent === "stop" && posTarget && posTarget !== "new") {
          await updatePosition(posTarget, { add_lines: [{ line_id: savedLine.id, role: "sl" }], sl_price: linePrice });
        }
        onPositionChanged?.();
      }
    } catch (e) {
      console.error("저장 실패:", e);
    } finally {
      setSaving(false);
    }
  };

  const canSave = isTrend || !!price;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }} />
      <div ref={sheetRef} style={{ position: "relative", background: "var(--color-background-primary)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* 핸들 */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", cursor: "grab" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
        </div>

        {/* 헤더 */}
        <div style={{ padding: "8px 20px 12px", borderBottom: B }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>
            {isTrend ? "추세선 저장" : "수평선 추가"}
          </span>
        </div>

        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── 차트 설정 ── */}

          {/* 추세선 두 점 */}
          {isTrend && pendingPoints?.length === 2 && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {pendingPoints.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#00e676", background: "rgba(0,230,118,0.12)", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>P{i + 1}</span>
                  <input type="number" value={p.price} onChange={(e) => { if (!onUpdatePoints) return; const updated = [...pendingPoints]; updated[i] = { ...updated[i], price: Number(e.target.value) }; onUpdatePoints(updated); }}
                    style={{ flex: 1, fontSize: 14, fontWeight: 600, padding: "8px 10px", border: B, borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-primary)" }} />
                </div>
              ))}
              <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>클릭 위치가 부정확하면 가격을 직접 수정하세요.</p>
            </div>
          )}

          {/* 기준 가격 (수평선) */}
          {!isTrend && (
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>
                {intent === "buy" ? "매수 타점" : intent === "sell" ? "목표가" : intent === "stop" ? "손절가" : "기준 가격"}
              </label>
              <div style={{ position: "relative" }}>
                <input type="number" placeholder={currentPrice ? `현재가: ${currentPrice.toLocaleString()}` : "예: 70000"} value={price} onChange={(e) => setPrice(e.target.value)}
                  style={{ width: "100%", fontSize: 16, fontWeight: 600, padding: "12px 14px", paddingRight: currentPrice ? 80 : 14, border: B, borderRadius: 10, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-secondary)" }} />
                {currentPrice && (
                  <button type="button" onClick={() => setPrice(String(currentPrice))}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: "var(--color-text-info)", color: "#fff", opacity: Number(price) === currentPrice ? 0.4 : 1 }}>
                    현재가
                  </button>
                )}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                {intent === "buy" ? "이 가격에 수평선이 그려지고, 도달 시 알림을 받습니다." : intent === "sell" ? "이 가격에 도달하면 목표가 알림을 받습니다." : intent === "stop" ? "이 가격에 도달하면 손절 알림을 받습니다." : "차트에 수평선이 그려집니다. 현재가보다 낮으면 지지선, 높으면 저항선으로 분류됩니다."}
              </p>
            </div>
          )}

          {/* ── 이 선의 의도 ── */}
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>이 선의 의도</div>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>이 선을 매매에 어떻게 활용할지 선택하세요. 매수 기준선을 선택하면 포지션이 자동으로 만들어집니다.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: intent && intent !== "watch" ? 10 : 0 }}>
              {INTENTS.map(({ value, label, color }) => (
                <button key={value} onClick={() => { setIntent(value); if (value !== "watch" && openPositions.length > 0 && value !== "buy") setPosTarget(openPositions[0].id); else setPosTarget("new"); }}
                  style={{ padding: "6px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", fontWeight: intent === value ? 700 : 400, border: intent === value ? `2px solid ${color}` : B, background: intent === value ? color + "18" : "transparent", color: intent === value ? color : "var(--color-text-secondary)" }}>
                  {label}
                </button>
              ))}
            </div>

            {intent && intent !== "watch" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {intent === "buy" ? (
                  <div>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>어느 포지션?</span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => setPosTarget("new")} style={{ padding: "8px 12px", fontSize: 12, fontWeight: posTarget === "new" ? 700 : 400, borderRadius: 8, cursor: "pointer", border: posTarget === "new" ? "2px solid var(--color-text-primary)" : B, background: posTarget === "new" ? "var(--color-text-primary)" : "transparent", color: posTarget === "new" ? "var(--color-background-primary)" : "var(--color-text-secondary)" }}>새 포지션으로</button>
                      {openPositions.map((p, i) => (
                        <button key={p.id} onClick={() => setPosTarget(p.id)} style={{ padding: "8px 12px", fontSize: 12, fontWeight: posTarget === p.id ? 700 : 400, borderRadius: 8, cursor: "pointer", border: posTarget === p.id ? "2px solid var(--color-text-primary)" : B, background: posTarget === p.id ? "var(--color-text-primary)" : "transparent", color: posTarget === p.id ? "var(--color-background-primary)" : "var(--color-text-secondary)" }}>
                          포지션 #{i + 1} · {p.entry_price ? (isDomestic ? Number(p.entry_price).toLocaleString() : "$" + Number(p.entry_price).toLocaleString()) : "미입력"}
                        </button>
                      ))}
                    </div>
                    {/* 포지션 기록 */}
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>체결가 (선택)</span>
                      <div style={{ position: "relative" }}>
                        <input type="number" inputMode="decimal" value={entryPriceInput} onChange={(e) => setEntryPriceInput(e.target.value)} placeholder="실제 체결 가격"
                          style={{ width: "100%", fontSize: 13, padding: "9px 10px", paddingRight: currentPrice ? 70 : 10, border: B, borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-primary)" }} />
                        {currentPrice && (
                          <button type="button" onClick={() => setEntryPriceInput(String(currentPrice))}
                            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: "none", cursor: "pointer", background: "var(--color-text-info)", color: "#fff", opacity: Number(entryPriceInput) === currentPrice ? 0.4 : 1 }}>
                            현재가
                          </button>
                        )}
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--color-text-quaternary)" }}>수익률 계산의 기준이 됩니다</p>
                    </div>
                  </div>
                ) : openPositions.length > 0 ? (
                  <div>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>어느 포지션에 추가?</span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {openPositions.map((p, i) => (
                        <button key={p.id} onClick={() => setPosTarget(p.id)} style={{ padding: "8px 12px", fontSize: 12, fontWeight: posTarget === p.id ? 700 : 400, borderRadius: 8, cursor: "pointer", border: posTarget === p.id ? "2px solid var(--color-text-primary)" : B, background: posTarget === p.id ? "var(--color-text-primary)" : "transparent", color: posTarget === p.id ? "var(--color-background-primary)" : "var(--color-text-secondary)" }}>
                          포지션 #{i + 1} · {p.entry_price ? (isDomestic ? Number(p.entry_price).toLocaleString() : "$" + Number(p.entry_price).toLocaleString()) : "미입력"}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0, padding: "6px 0" }}>열린 포지션이 없어 선만 저장됩니다</p>
                )}
              </div>
            )}
          </div>

          {/* 이름 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>이름 (선택)</label>
            <input type="text" placeholder={isTrend ? "예: 1월 추세선" : "예: 목표가, 손절가…"} value={lineName} onChange={(e) => setLineName(e.target.value)}
              style={{ width: "100%", fontSize: 14, padding: "11px 14px", border: B, borderRadius: 10, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-secondary)" }} />
            {!isTrend && (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {["평단가", "목표가", "손절가"].map((name) => (
                  <button key={name} type="button" onClick={() => setLineName(name)}
                    style={{ padding: "4px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer", border: lineName === name ? "1.5px solid var(--color-text-info)" : `1px solid var(--color-border-primary)`, background: lineName === name ? "rgba(59,130,246,0.1)" : "var(--color-background-secondary)", color: lineName === name ? "var(--color-text-info)" : "var(--color-text-secondary)", fontWeight: lineName === name ? 600 : 400 }}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 색상 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>색상</label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {COLOR_PRESETS.map((c) => (
                <div key={c} onClick={() => setSelectedColor(c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: selectedColor === c ? "3px solid var(--color-text-primary)" : "3px solid transparent", cursor: "pointer", boxSizing: "border-box", outline: selectedColor === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </div>

          {/* 알림 민감도 */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>알림 민감도</label>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{SENSITIVITY_LABELS[sensitivityIdx]}</span>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--color-text-tertiary)" }}>현재가가 이 선에 얼마나 가까워지면 알림을 보낼지 설정합니다.</p>
            <input type="range" min={0} max={4} value={sensitivityIdx} onChange={(e) => setSensitivityIdx(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--color-text-info)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>정밀 ±0.3%</span>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>여유 ±1.5%</span>
            </div>
          </div>

          {/* 저장 */}
          <button onClick={handleSave} disabled={!canSave || saving}
            style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700, background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: 12, cursor: "pointer", opacity: !canSave || saving ? 0.4 : 1 }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
