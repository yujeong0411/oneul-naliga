import { useState, useRef, useEffect } from "react";
import { getLineStats } from "../api/lines";
import { createPosition, updatePosition } from "../api/positions";

const B = "var(--border-tertiary)";
const N_CANDLES = { "월봉": 3, "주봉": 4, "일봉": 5, "60분": 6, "30분": 8, "15분": 8, "10분": 10, "5분": 12, "3분": 20, "1분": 30 };
const PERIOD_LABEL = { "월봉": "3개월 후", "주봉": "4주 후", "일봉": "5거래일 후", "60분": "6시간 후", "30분": "4시간 후", "15분": "2시간 후", "10분": "100분 후", "5분": "1시간 후", "3분": "1시간 후", "1분": "30분 후" };
const SENSITIVITY_LABELS = ["±0.3%", "±0.5%", "±0.7%", "±1.0%", "±1.5%"];
const SENSITIVITY_VALUES = [0.3, 0.5, 0.7, 1.0, 1.5];
const COLOR_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

const INTENTS = [
  { value: "buy", label: "매수 기준선", color: "#22c55e" },
  { value: "sell", label: "매도 기준선", color: "#3b82f6" },
  { value: "stop", label: "손절 기준선", color: "#ef4444" },
  { value: "watch", label: "관찰용", color: "#6b7280" },
];

export default function EditLineSheet({ line, onClose, onSave, currentPrice, positions = [], stockCode, userId, onPositionChanged }) {
  const [name, setName] = useState(line.name || "");
  const [selectedColor, setSelectedColor] = useState(line.color || "#ef4444");
  const initialIdx = SENSITIVITY_VALUES.findIndex((v) => v === line.sensitivity) ?? 1;
  const [sensitivityIdx, setSensitivityIdx] = useState(initialIdx >= 0 ? initialIdx : 1);
  const [price, setPrice] = useState(line.line_type === "horizontal" ? line.price : null);
  const [y1, setY1] = useState(line.y1 ?? "");
  const [y2, setY2] = useState(line.y2 ?? "");
  const [stats, setStats] = useState(null);

  // 의도 + 포지션
  const [intent, setIntent] = useState(line.intent || null);
  const [intentPrice, setIntentPrice] = useState(line.price ? String(line.price) : "");
  const [entryPriceInput, setEntryPriceInput] = useState("");
  const [posTarget, setPosTarget] = useState("new"); // "new" | position id
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (line.id) getLineStats(line.id).then(setStats).catch(() => {});
  }, [line.id]);

  // 이 선이 이미 연결된 포지션 찾기 (position_lines 기반)
  const linkedPosition = positions.find((p) =>
    (p.position_lines || []).some((pl) => pl.line?.id === line.id)
  );
  const linkedPL = linkedPosition
    ? (linkedPosition.position_lines || []).find((pl) => pl.line?.id === line.id)
    : null;
  const linkedRole = linkedPL
    ? { entry: "매수 기준선", tp: "매도 기준선", sl: "손절 기준선" }[linkedPL.role]
    : null;

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
    setSaving(true);
    try {
      // 1. 선 업데이트
      const updates = {
        name: name || line.name,
        color: selectedColor,
        sensitivity: SENSITIVITY_VALUES[sensitivityIdx],
        intent: intent,
      };
      if (line.line_type === "horizontal" && price != null) {
        updates.price = Number(price);
        if (currentPrice) updates.signal_type = Number(price) <= currentPrice ? "loss" : "attack";
      }
      if (line.line_type === "trend") {
        const newY1 = Number(y1); const newY2 = Number(y2);
        if (y1 !== "" && !isNaN(newY1)) updates.y1 = newY1;
        if (y2 !== "" && !isNaN(newY2)) updates.y2 = newY2;
        if (updates.y1 != null || updates.y2 != null) {
          const finalY1 = updates.y1 ?? line.y1; const finalY2 = updates.y2 ?? line.y2;
          if (line.x1 && line.x2) { const dt = line.x2 - line.x1; if (dt !== 0) { updates.slope = (finalY2 - finalY1) / dt; updates.intercept = finalY1 - updates.slope * line.x1; } }
        }
      }
      onSave(line.id, updates);

      // 2. 포지션 자동 생성/연결 (의도가 buy/sell/stop일 때)
      if (intent && intent !== "watch" && !linkedPosition) {
        const priceVal = Number(intentPrice) || Number(price) || line.price;
        const entryVal = entryPriceInput ? Number(entryPriceInput) : null;
        if (intent === "buy") {
          const body = { stock_code: stockCode, user_id: userId, entry_line_ids: [line.id] };
          if (entryVal) body.entry_price = entryVal;
          if (posTarget === "new") {
            await createPosition(body);
          } else {
            await updatePosition(posTarget, { add_lines: [{ line_id: line.id, role: "entry" }], ...(entryVal ? { entry_price: entryVal } : {}) });
          }
        } else if (intent === "sell") {
          if (posTarget) await updatePosition(posTarget, { add_lines: [{ line_id: line.id, role: "tp" }], tp_price: priceVal || null });
        } else if (intent === "stop") {
          if (posTarget) await updatePosition(posTarget, { add_lines: [{ line_id: line.id, role: "sl" }], sl_price: priceVal || null });
        }
        onPositionChanged?.();
      }
    } catch (e) {
      console.error("저장 실패:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!linkedPosition || !linkedPL) return;
    const isEntryLine = linkedPL.role === "entry";
    const entryCount = (linkedPosition.position_lines || []).filter(pl => pl.role === "entry").length;

    if (isEntryLine && entryCount <= 1) {
      // 마지막 매수선 해제 → 포지션 삭제 확인
      if (!window.confirm("이 선을 연결 해제하면 포지션이 삭제됩니다. 계속할까요?")) return;
      const { deletePosition } = await import("../api/positions");
      await deletePosition(linkedPosition.id);
    } else {
      // 선 연결만 해제
      await updatePosition(linkedPosition.id, { remove_lines: [line.id] });
    }
    onSave(line.id, { intent: null });
    onPositionChanged?.();
  };

  const target = line.line_type === "horizontal" ? line.price : line.y2;
  const isDomestic = /^\d{6}$/.test(stockCode || "");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }} />
      <div ref={sheetRef} style={{ position: "relative", background: "var(--color-background-primary)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "85vh", overflow: "auto", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {/* 핸들 */}
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", cursor: "grab" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
        </div>

        {/* 헤더 — 이름 직접 수정 */}
        <div style={{ padding: "8px 20px 12px", borderBottom: B }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: selectedColor, flexShrink: 0 }} />
            <span style={{ position: "relative", display: "inline-block" }}>
              <span style={{ fontSize: 16, fontWeight: 700, visibility: "hidden", whiteSpace: "pre" }}>{name || "선 이름"}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="선 이름"
                style={{ position: "absolute", left: 0, top: 0, width: "100%", fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", border: "none", borderBottom: "1.5px dashed var(--color-border-primary)", outline: "none", background: "transparent", padding: 0 }} />
            </span>
            <span style={{ fontSize: 14, color: "var(--color-text-tertiary)", flexShrink: 0 }}>✎</span>
          </div>
          {target && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {line.line_type === "horizontal" ? "수평선" : "추세선"} · {target.toLocaleString()}
            </p>
          )}
        </div>

        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 터치 분석 (먼저) */}

          {/* 터치 통계 */}
          {stats && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>터치 분석</div>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>가격이 이 선에 닿으면 자동으로 기록되고, 이후 반등/돌파 여부를 판정하여 기대 수익률을 계산합니다.</p>
              {(() => {
                const nCandle = N_CANDLES[line.timeframe] || 5;
                const pendingText = stats.pending > 0 ? ` · 판정 대기 중 ${stats.pending}회 (${nCandle}캔들 후 자동 판정)` : "";

                if (!stats.touch_count && !stats.pending) {
                  return <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>아직 터치 기록이 없어요</div>;
                }

                if (stats.line_type === "trend") {
                  const total = (stats.maintain_count || 0) + (stats.break_count || 0);
                  return (
                    <>
                      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                        {total > 0 ? (<><span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{stats.touch_count}번</span> 터치 중 <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{stats.maintain_count}번</span> 유지{stats.expected_return != null && (<> · {PERIOD_LABEL[line.timeframe] || "이후"} 평균 <span style={{ fontWeight: 700, color: stats.expected_return >= 0 ? "#22c55e" : "#ef4444" }}>{stats.expected_return >= 0 ? "+" : ""}{stats.expected_return}%</span></>)}</>) : (<>{stats.touch_count}번 터치{pendingText}</>)}
                      </div>
                      {total > 0 && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>터치 {stats.touch_count}회 · 유지 {stats.maintain_count}회 · 이탈 {stats.break_count}회{pendingText}</div>}
                      <div style={{ fontSize: 10, color: "var(--color-text-quaternary)", marginTop: 4 }}>* 추세선 수익률은 참고용입니다</div>
                    </>
                  );
                }

                const total = (stats.bounce_count || 0) + (stats.break_count || 0);
                return (
                  <>
                    <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                      {total > 0 ? (<><span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{stats.touch_count}번</span> 터치 중 <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{stats.bounce_count}번</span> 반등{stats.expected_return != null && (<> · {PERIOD_LABEL[line.timeframe] || "이후"} 평균 <span style={{ fontWeight: 700, color: stats.expected_return >= 0 ? "#22c55e" : "#ef4444" }}>{stats.expected_return >= 0 ? "+" : ""}{stats.expected_return}%</span></>)}</>) : (<>{stats.touch_count}번 터치{pendingText}</>)}
                    </div>
                    {total > 0 && <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>터치 {stats.touch_count}회 · 반등 {stats.bounce_count}회 · 돌파 {stats.break_count}회 · 중립 {stats.neutral_count}회{pendingText}</div>}
                  </>
                );
              })()}
            </div>
          )}

          {/* 이 선의 의도 */}
          {(
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 4 }}>이 선의 의도</div>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>이 선을 매매에 어떻게 활용할지 선택하세요. 매수 기준선을 선택하면 매매 계획이 자동으로 만들어집니다.</p>

              {linkedPosition ? (
                /* 이미 연결된 상태 */
                <div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{linkedRole}</span>로 연결됨
                    {linkedPosition.entry_price > 0 && <span> · 매입 {isDomestic ? Number(linkedPosition.entry_price).toLocaleString() : "$" + Number(linkedPosition.entry_price).toLocaleString()}</span>}
                    <span style={{
                      marginLeft: 6, fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 10,
                      background: { open: "#3b82f622", closed: "#6b728022", tp_hit: "#22c55e22", sl_hit: "#ef444422" }[linkedPosition.status],
                      color: { open: "#3b82f6", closed: "#6b7280", tp_hit: "#22c55e", sl_hit: "#ef4444" }[linkedPosition.status],
                    }}>{{ open: "진행 중", closed: "종료", tp_hit: "목표 도달", sl_hit: "손절 도달" }[linkedPosition.status]}</span>
                  </div>
                  {/* 수익률 */}
                  {linkedPosition.entry_price > 0 && (() => {
                    const entry = linkedPosition.entry_price;
                    const exit = linkedPosition.exit_price;
                    const pct = exit > 0 ? ((exit - entry) / entry * 100) : currentPrice ? ((currentPrice - entry) / entry * 100) : null;
                    if (pct === null) return null;
                    return (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--color-background-primary)", borderRadius: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{exit > 0 ? "확정 수익률" : "미실현 수익률"}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: pct >= 0 ? "#22c55e" : "#ef4444" }}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>
                      </div>
                    );
                  })()}
                  <button onClick={handleUnlink} style={{ fontSize: 12, color: "var(--color-text-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>연결 해제</button>
                </div>
              ) : (
                /* 의도 선택 */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* 의도 버튼 */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {INTENTS.map(({ value, label, color }) => (
                      <button key={value} onClick={() => { setIntent(value); if (value !== "watch" && openPositions.length > 0 && value !== "buy") setPosTarget(openPositions[0].id); else setPosTarget("new"); }}
                        style={{
                          padding: "6px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
                          fontWeight: intent === value ? 700 : 400,
                          border: intent === value ? `2px solid ${color}` : B,
                          background: intent === value ? color + "18" : "transparent",
                          color: intent === value ? color : "var(--color-text-secondary)",
                        }}>{label}</button>
                    ))}
                  </div>

                  {/* 매수/매도/손절 선택 시 추가 UI */}
                  {intent && intent !== "watch" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* 가격 (자동 입력, 수정 가능) */}
                      <div>
                        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>
                          {{ buy: "매입가", sell: "목표가", stop: "손절가" }[intent]}
                        </span>
                        <input type="number" inputMode="decimal" value={intentPrice} onChange={(e) => setIntentPrice(e.target.value)}
                          style={{ width: "100%", fontSize: 13, padding: "9px 10px", border: B, borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-primary)" }} />
                      </div>

                      {/* 포지션 선택 */}
                      {intent === "buy" ? (
                        /* 매수: 새 포지션 또는 기존 포지션 */
                        <div>
                          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>어느 포지션?</span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => setPosTarget("new")} style={{
                              flex: 1, padding: "8px 0", fontSize: 12, fontWeight: posTarget === "new" ? 700 : 400, borderRadius: 8, cursor: "pointer",
                              border: posTarget === "new" ? "2px solid var(--color-text-primary)" : B,
                              background: posTarget === "new" ? "var(--color-text-primary)" : "transparent",
                              color: posTarget === "new" ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                            }}>새 포지션으로</button>
                            {openPositions.map((p) => (
                              <button key={p.id} onClick={() => setPosTarget(p.id)} style={{
                                flex: 1, padding: "8px 0", fontSize: 12, fontWeight: posTarget === p.id ? 700 : 400, borderRadius: 8, cursor: "pointer",
                                border: posTarget === p.id ? "2px solid var(--color-text-primary)" : B,
                                background: posTarget === p.id ? "var(--color-text-primary)" : "transparent",
                                color: posTarget === p.id ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                              }}>포지션 #{positions.indexOf(p) + 1}</button>
                            ))}
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>실제 매입가 (선택)</span>
                            <input type="number" inputMode="decimal" value={entryPriceInput} onChange={(e) => setEntryPriceInput(e.target.value)} placeholder="실제 매입가 입력 (선택)"
                              style={{ width: "100%", fontSize: 13, padding: "9px 10px", border: B, borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-primary)" }} />
                          </div>
                        </div>
                      ) : openPositions.length > 0 ? (
                        /* 매도/손절: 기존 포지션만 */
                        <div>
                          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>어느 포지션에 추가?</span>
                          <div style={{ display: "flex", gap: 6 }}>
                            {openPositions.map((p) => (
                              <button key={p.id} onClick={() => setPosTarget(p.id)} style={{
                                flex: 1, padding: "8px 0", fontSize: 12, fontWeight: posTarget === p.id ? 700 : 400, borderRadius: 8, cursor: "pointer",
                                border: posTarget === p.id ? "2px solid var(--color-text-primary)" : B,
                                background: posTarget === p.id ? "var(--color-text-primary)" : "transparent",
                                color: posTarget === p.id ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                              }}>포지션 #{positions.indexOf(p) + 1} · {p.entry_price ? (isDomestic ? Number(p.entry_price).toLocaleString() : "$" + Number(p.entry_price).toLocaleString()) : "미입력"}</button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* 매도/손절인데 포지션이 없음 */
                        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0, padding: "6px 0" }}>
                          먼저 매수 기준선을 설정해주세요
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 저장 */}
          {/* 가격 */}
          {line.line_type === "horizontal" && (
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>가격</label>
              <input type="number" inputMode="decimal" value={price ?? ""} onChange={(e) => { setPrice(e.target.value); setIntentPrice(e.target.value); }} placeholder="가격 입력"
                style={{ width: "100%", fontSize: 14, padding: "11px 14px", border: B, borderRadius: 10, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-secondary)" }} />
            </div>
          )}
          {line.line_type === "trend" && (
            <div>
              <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>가격</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ label: "P1", value: y1, setter: setY1 }, { label: "P2", value: y2, setter: setY2 }].map(({ label, value, setter }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#00e676", background: "rgba(0,230,118,0.12)", borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>{label}</span>
                    <input type="number" inputMode="decimal" value={value} onChange={(e) => setter(e.target.value)}
                      style={{ flex: 1, fontSize: 14, fontWeight: 600, padding: "8px 10px", border: B, borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "var(--color-background-secondary)" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

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
            <input type="range" min={0} max={4} value={sensitivityIdx} onChange={(e) => setSensitivityIdx(Number(e.target.value))} style={{ width: "100%", accentColor: "var(--color-text-info)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>정밀 ±0.3%</span>
              <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>여유 ±1.5%</span>
            </div>
          </div>

          {/* 저장 */}
          <button onClick={handleSave} disabled={saving || (intent && intent !== "watch" && intent !== "buy" && openPositions.length === 0)}
            style={{
              width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700,
              background: "var(--color-text-primary)", color: "var(--color-background-primary)",
              border: "none", borderRadius: 12, cursor: "pointer",
              opacity: saving || (intent && intent !== "watch" && intent !== "buy" && openPositions.length === 0) ? 0.4 : 1,
            }}>{saving ? "저장 중..." : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
