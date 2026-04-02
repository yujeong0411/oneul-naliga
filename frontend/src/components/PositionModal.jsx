import { useState } from "react";
import { updatePosition, deletePosition } from "../api/positions";

const B = "var(--border-tertiary)";

export default function PositionModal({ position, currentPrice, onClose, onSaved }) {
  const [entryPrice, setEntryPrice] = useState(position?.entry_price ?? "");
  const [tpPrice, setTpPrice] = useState(position?.tp_price ?? "");
  const [slPrice, setSlPrice] = useState(position?.sl_price ?? "");
  const [exitPrice, setExitPrice] = useState(position?.exit_price ?? "");
  const [saving, setSaving] = useState(false);
  const isDomestic = /^\d{6}$/.test(position?.stock_code || "");

  const fmtPrice = (v) => {
    if (!v && v !== 0) return "-";
    return isDomestic ? Number(v).toLocaleString() + "원" : "$" + Number(v).toLocaleString();
  };

  const statusLabel = { open: "진행 중", closed: "종료", tp_hit: "목표 도달", sl_hit: "손절 도달" };
  const statusColor = { open: "#3b82f6", closed: "#6b7280", tp_hit: "#22c55e", sl_hit: "#ef4444" };

  // 수익률
  const entry = Number(entryPrice) || 0;
  const exit = Number(exitPrice) || 0;
  const pctReturn = entry > 0 && exit > 0
    ? ((exit - entry) / entry * 100)
    : entry > 0 && currentPrice
    ? ((currentPrice - entry) / entry * 100)
    : null;
  const returnLabel = entry > 0 && exit > 0 ? "확정 수익률" : "미실현 수익률";

  // tp/sl 도달
  const tpReached = tpPrice && currentPrice && currentPrice >= Number(tpPrice);
  const slReached = slPrice && currentPrice && currentPrice <= Number(slPrice);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {};
      if (entryPrice !== "" && Number(entryPrice) !== position?.entry_price) updates.entry_price = Number(entryPrice);
      if (tpPrice !== "" && Number(tpPrice) !== position?.tp_price) updates.tp_price = Number(tpPrice);
      if (slPrice !== "" && Number(slPrice) !== position?.sl_price) updates.sl_price = Number(slPrice);
      if (exitPrice !== "" && Number(exitPrice) !== position?.exit_price) {
        updates.exit_price = Number(exitPrice);
        updates.status = "closed";
      }
      if (Object.keys(updates).length > 0) await updatePosition(position.id, updates);
      onSaved();
      onClose();
    } catch (e) {
      console.error("포지션 저장 실패:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkLine = async (lineId) => {
    await updatePosition(position.id, { remove_lines: [lineId] });
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    await deletePosition(position.id);
    onSaved();
    onClose();
  };

  // position_lines를 role별로 그룹핑
  const grouped = { entry: [], tp: [], sl: [] };
  (position?.position_lines || []).forEach(pl => {
    if (pl.line && grouped[pl.role]) grouped[pl.role].push(pl);
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", background: "var(--color-background-primary)", borderRadius: 16, width: "100%", maxWidth: 400, maxHeight: "85vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>

        {/* 헤더 */}
        <div style={{ padding: "16px 20px", borderBottom: B, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>포지션 현황</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 10, background: (statusColor[position?.status] || "#6b7280") + "22", color: statusColor[position?.status] || "#6b7280" }}>
            {statusLabel[position?.status] || position?.status}
          </span>
        </div>

        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>매매 계획을 확인하고 수정할 수 있습니다. 실제 매도 후 매도가를 입력하면 확정 수익률이 기록됩니다.</p>

          {/* 연결된 선 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", display: "block", marginBottom: 8 }}>연결된 선</label>
            {[
              { label: "매수선", lines: grouped.entry },
              { label: "매도선", lines: grouped.tp },
              { label: "손절선", lines: grouped.sl },
            ].map(({ label, lines }) => (
              <div key={label} style={{ fontSize: 12, padding: "6px 0" }}>
                <span style={{ color: "var(--color-text-tertiary)" }}>{label}</span>
                {lines.length > 0 ? lines.map((pl) => (
                  <div key={pl.line.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingLeft: 8 }}>
                    <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                      {pl.line.name || (pl.line.signal_type === "loss" ? "지지선" : "저항선")} · {fmtPrice(pl.line.price)}
                    </span>
                    <button onClick={() => handleUnlinkLine(pl.line.id)} style={{ border: "none", background: "none", cursor: "pointer", padding: "2px", fontSize: 14, color: "var(--color-text-tertiary)", lineHeight: 1 }}>×</button>
                  </div>
                )) : (
                  <span style={{ color: "var(--color-text-quaternary)", marginLeft: 8 }}>미연결</span>
                )}
              </div>
            ))}
          </div>

          {/* 실제 거래 기록 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>거래 기록</label>
            <p style={{ margin: "0 0 8px", fontSize: 10, color: "var(--color-text-quaternary)" }}>실제 체결 가격을 입력하면 수익률이 계산됩니다</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "체결가 (매수)", value: entryPrice, setter: setEntryPrice, placeholder: "매수 체결가" },
                { label: "체결가 (매도)", value: exitPrice, setter: setExitPrice, placeholder: "매도 체결가" },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label} style={{ padding: "8px 10px", background: "var(--color-background-secondary)", borderRadius: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", display: "block", marginBottom: 4 }}>{label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" inputMode="decimal" value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder}
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "2px 0", border: "none", outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "transparent" }} />
                    {currentPrice > 0 && (
                      <button type="button" onClick={() => setter(String(currentPrice))}
                        style={{ padding: "2px 6px", fontSize: 9, fontWeight: 600, borderRadius: 4, border: "none", cursor: "pointer", background: "var(--color-text-info)", color: "#fff", whiteSpace: "nowrap", opacity: Number(value) === currentPrice ? 0.4 : 1 }}>
                        현재가
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 감시 설정 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", display: "block", marginBottom: 4 }}>감시 설정</label>
            <p style={{ margin: "0 0 8px", fontSize: 10, color: "var(--color-text-quaternary)" }}>도달 시 알림을 받습니다</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "목표가", value: tpPrice, setter: setTpPrice, reached: tpReached, reachedLabel: "도달", reachedColor: "#22c55e", placeholder: "익절 목표" },
                { label: "손절가", value: slPrice, setter: setSlPrice, reached: slReached, reachedLabel: "도달", reachedColor: "#ef4444", placeholder: "손절 기준" },
              ].map(({ label, value, setter, reached, reachedLabel, reachedColor, placeholder }) => (
                <div key={label} style={{ padding: "8px 10px", background: "var(--color-background-secondary)", borderRadius: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{label}</span>
                    {reached && <span style={{ fontSize: 10, color: reachedColor, fontWeight: 600 }}>{reachedLabel}</span>}
                  </div>
                  <input type="number" inputMode="decimal" value={value} onChange={(e) => setter(e.target.value)} placeholder={placeholder}
                    style={{ width: "100%", fontSize: 13, fontWeight: 600, padding: "2px 0", border: "none", outline: "none", boxSizing: "border-box", color: "var(--color-text-primary)", background: "transparent" }} />
                </div>
              ))}
            </div>
            {/* 역방향 설정 경고 */}
            {currentPrice > 0 && tpPrice && Number(tpPrice) > 0 && Number(tpPrice) <= currentPrice && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f97316", lineHeight: 1.4 }}>목표가가 현재가보다 낮아 즉시 도달 처리될 수 있습니다</p>
            )}
            {currentPrice > 0 && slPrice && Number(slPrice) > 0 && Number(slPrice) >= currentPrice && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f97316", lineHeight: 1.4 }}>손절가가 현재가보다 높아 즉시 손절 처리될 수 있습니다</p>
            )}
          </div>

          {/* 수익률 */}
          {pctReturn !== null && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{returnLabel}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: pctReturn >= 0 ? "#22c55e" : "#ef4444" }}>
                {pctReturn >= 0 ? "+" : ""}{pctReturn.toFixed(2)}%
              </span>
            </div>
          )}

          {/* 저장 */}
          <button onClick={handleSave} disabled={saving}
            style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700, background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: 12, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "저장 중..." : exitPrice && !position?.exit_price ? "매도가 저장 (포지션 청산)" : "저장"}
          </button>

          <button onClick={handleDelete}
            style={{ width: "100%", padding: "12px 0", fontSize: 13, fontWeight: 600, background: "none", color: "var(--color-text-tertiary)", border: "none", cursor: "pointer" }}>
            포지션 삭제
          </button>
        </div>
      </div>
    </div>
  );
}
