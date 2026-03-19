import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAlerts, deleteAlert } from "../api/alerts";

function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60)    return "방금";
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // "all" | "attack" | "loss"

  useEffect(() => {
    getAlerts(null, 200)
      .then((data) => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    await deleteAlert(id).catch(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleClearAll = async () => {
    await Promise.all(alerts.map((a) => deleteAlert(a.id).catch(() => {})));
    setAlerts([]);
  };

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.signal_type === filter);

  // 날짜별 그룹
  const grouped = {};
  filtered.forEach((a) => {
    const key = formatDate(a.created_at);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  return (
    <div style={{ paddingBottom: 40, maxWidth: 480, margin: "0 auto" }}>

      {/* 헤더 */}
      <div style={{ padding: "24px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}>알림</span>
          {alerts.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{
                border: "none", background: "var(--color-background-danger)",
                cursor: "pointer", fontSize: 12, color: "var(--color-text-danger)",
                fontWeight: 600, padding: "6px 12px", borderRadius: 8,
              }}
            >
              전체 삭제
            </button>
          )}
        </div>

        {/* 필터 탭 */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "all", label: "전체" },
            { key: "attack", label: "공격" },
            { key: "loss", label: "로스" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: "6px 14px", fontSize: 12, borderRadius: 20, border: "none",
                fontWeight: filter === key ? 600 : 400, cursor: "pointer",
                background: filter === key ? "var(--color-text-primary)" : "var(--color-background-tertiary)",
                color: filter === key ? "#fff" : "var(--color-text-secondary)",
              }}
            >
              {label}
              {key === "all" && alerts.length > 0 && ` (${alerts.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      {loading ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{
            width: 32, height: 32, border: "3px solid var(--color-border-tertiary)",
            borderTopColor: "var(--color-text-primary)", borderRadius: "50%",
            margin: "0 auto 12px",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)" }}>불러오는 중...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px",
            background: "var(--color-background-tertiary)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>알림이 없습니다</p>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
            선에 가격이 근접하면<br />여기에 알림이 표시됩니다
          </p>
        </div>
      ) : (
        <div style={{ padding: "0 20px" }}>
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} style={{ marginBottom: 16 }}>
              {/* 날짜 라벨 */}
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)" }}>
                {date}
              </p>

              {/* 카드 */}
              <div style={{ background: "var(--color-background-primary)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
                {items.map((alert, i) => {
                  const isAttack = alert.signal_type === "attack";
                  const isDomestic = /^\d{6}$/.test(alert.stock_code);
                  const fmt = (p) => isDomestic ? p?.toLocaleString() + "원" : "$" + p?.toLocaleString();

                  return (
                    <div key={alert.id} style={{
                      padding: "14px 16px",
                      borderBottom: i < items.length - 1 ? "1px solid var(--color-border-tertiary)" : "none",
                      display: "flex", alignItems: "flex-start", gap: 12,
                    }}>
                      {/* 아이콘 */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                        background: isAttack ? "var(--color-background-success)" : "var(--color-background-danger)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke={isAttack ? "var(--color-text-success)" : "var(--color-text-danger)"}
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {isAttack
                            ? <path d="M7 17l9.2-9.2M17 17V7H7" />
                            : <path d="M17 7l-9.2 9.2M7 7v10h10" />
                          }
                        </svg>
                      </div>

                      {/* 내용 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
                            {alert.stock_code}
                          </span>
                          <span style={{
                            fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                            background: isAttack ? "var(--color-background-success)" : "var(--color-background-danger)",
                            color: isAttack ? "var(--color-text-success)" : "var(--color-text-danger)",
                          }}>
                            {isAttack ? "공격" : "로스"}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          <span>현재가 <b style={{ color: "var(--color-text-primary)" }}>{fmt(alert.current_price)}</b></span>
                          <span>거리 <b style={{
                            color: isAttack ? "var(--color-text-success)" : "var(--color-text-danger)",
                          }}>{alert.distance_pct?.toFixed(2)}%</b></span>
                        </div>

                        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                          {timeAgo(alert.created_at)}
                        </p>
                      </div>

                      {/* 액션 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => navigate(`/chart/${alert.stock_code}`)}
                          style={{
                            border: "none", background: "var(--color-background-tertiary)",
                            cursor: "pointer", fontSize: 10, fontWeight: 600,
                            color: "var(--color-text-secondary)", padding: "4px 8px", borderRadius: 6,
                          }}
                        >
                          차트
                        </button>
                        <button
                          onClick={() => handleDelete(alert.id)}
                          style={{
                            border: "none", background: "none",
                            cursor: "pointer", fontSize: 14, color: "var(--color-text-tertiary)",
                            padding: "2px 8px",
                          }}
                        >×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
