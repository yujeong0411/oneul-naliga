import { useState } from "react";
import { useNavigate } from "react-router-dom";

const mockStocks = [
  { id: 1, name: "삼성전자", code: "005930", market: "KR", price: 72400, change: 1.26, lineCount: 2, distanceToBound: { type: "저항선", value: 1.8 } },
  { id: 2, name: "카카오", code: "035720", market: "KR", price: 38150, change: -0.78, lineCount: 1, distanceToBound: { type: "지지선", value: -0.4 } },
  { id: 3, name: "NAVER", code: "035420", market: "KR", price: 189500, change: 0.53, lineCount: 3, distanceToBound: { type: "저항선", value: 3.2 } },
  { id: 4, name: "Apple", code: "AAPL", market: "US", price: 224.5, change: -0.43, lineCount: 2, distanceToBound: { type: "지지선", value: -0.9 } },
];

const mockAlerts = [
  { id: 1, stock: "카카오", msg: "지지선 근접", distance: "-0.4%", type: "loss", time: "오늘 14:32" },
  { id: 2, stock: "삼성전자", msg: "저항선 돌파", distance: null, type: "attack", time: "오늘 09:17" },
  { id: 3, stock: "NAVER", msg: "저항선 근접", distance: "+0.3%", type: "loss", time: "어제 15:50" },
];

const NAV_ITEMS = ["홈", "차트", "알림 로그", "설정"];
const B = "var(--border-tertiary)";

export default function Home() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeNav, setActiveNav] = useState("홈");

  const filtered = mockStocks.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-secondary)", display: "flex", flexDirection: "column" }}>

      {/* ── Top Navbar (full-width, sticky) ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "var(--color-background-primary)",
        borderBottom: B,
        padding: "0 32px",
        height: 54,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>MyLine</span>
        <nav style={{ display: "flex", gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const active = item === activeNav;
            return (
              <span
                key={item}
                onClick={() => setActiveNav(item)}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: active ? 500 : 400,
                  color: active ? "var(--color-text-info)" : "var(--color-text-secondary)",
                  background: active ? "var(--color-background-info)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                {item}
              </span>
            );
          })}
        </nav>
        <div style={{ width: 80 }} /> {/* spacer to balance brand */}
      </header>

      {/* ── Page Content ── */}
      <main style={{ flex: 1, maxWidth: 1280, width: "100%", margin: "0 auto", padding: "28px 32px", boxSizing: "border-box" }}>

        {/* Page title + search row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.4px" }}>관심 종목</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>등록된 선을 기준으로 실시간 거리를 추적합니다.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="종목명 또는 코드 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                fontSize: 13, padding: "8px 14px", border: B, borderRadius: 8,
                background: "var(--color-background-primary)", outline: "none",
                color: "var(--color-text-primary)", width: 220,
              }}
            />
            <button style={{
              padding: "8px 16px", fontSize: 13, fontWeight: 500,
              background: "var(--color-text-info)", color: "white",
              border: "none", borderRadius: 8, cursor: "pointer",
            }}>
              + 종목 추가
            </button>
          </div>
        </div>

        {/* Stats cards row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "감시 중인 종목", value: mockStocks.length, unit: "개", color: "var(--color-text-primary)" },
            { label: "설정된 선", value: mockStocks.reduce((a, s) => a + s.lineCount, 0), unit: "개", color: "var(--color-text-primary)" },
            { label: "오늘 알림", value: mockAlerts.filter(a => a.time.startsWith("오늘")).length, unit: "건", color: "var(--color-text-success)" },
          ].map((card) => (
            <div key={card.label} style={{ background: "var(--color-background-primary)", borderRadius: 12, padding: "18px 22px", border: B }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.4px" }}>{card.label}</p>
              <p style={{ margin: 0, fontSize: 30, fontWeight: 600, color: card.color, letterSpacing: "-0.5px" }}>
                {card.value}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>{card.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Main 2-col layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>

          {/* ─ Watchlist Table ─ */}
          <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 130px 120px 40px",
              padding: "10px 20px",
              borderBottom: B,
              background: "var(--color-background-secondary)",
            }}>
              {["종목", "현재가", "선까지 거리", ""].map((h) => (
                <span key={h} style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {filtered.length === 0 ? (
              <p style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>검색 결과가 없습니다.</p>
            ) : filtered.map((stock, i) => (
              <div
                key={stock.id}
                onClick={() => navigate(`/chart/${stock.code}`)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 130px 120px 40px",
                  alignItems: "center",
                  padding: "16px 20px",
                  borderBottom: i < filtered.length - 1 ? B : "none",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--color-background-secondary)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              >
                {/* 종목 */}
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {stock.name}
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", fontWeight: 400, marginLeft: 6 }}>{stock.code}</span>
                    <span style={{ fontSize: 10, marginLeft: 6, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-secondary)", color: "var(--color-text-tertiary)" }}>{stock.market}</span>
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>선 {stock.lineCount}개 설정됨</p>
                </div>

                {/* 현재가 */}
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                    {stock.market === "US" ? `$${stock.price}` : stock.price.toLocaleString()}
                  </p>
                  <p style={{ margin: "3px 0 0", fontSize: 12, fontWeight: 500, color: stock.change >= 0 ? "var(--color-text-success)" : "var(--color-text-danger)" }}>
                    {stock.change >= 0 ? "+" : ""}{stock.change}%
                  </p>
                </div>

                {/* 선까지 거리 */}
                <div>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>{stock.distanceToBound.type}까지</p>
                  <p style={{ margin: "3px 0 0", fontSize: 13, fontWeight: 600,
                    color: Math.abs(stock.distanceToBound.value) < 1
                      ? "var(--color-text-danger)"
                      : stock.distanceToBound.value < 0
                        ? "var(--color-text-success)"
                        : "var(--color-text-warning)",
                  }}>
                    {stock.distanceToBound.value > 0 ? "+" : ""}{stock.distanceToBound.value}%
                  </p>
                </div>

                {/* Arrow */}
                <span style={{ fontSize: 16, color: "var(--color-text-tertiary)", textAlign: "right" }}>›</span>
              </div>
            ))}
          </div>

          {/* ─ Right sidebar: Alerts ─ */}
          <div style={{ background: "var(--color-background-primary)", borderRadius: 12, border: B, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: B, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>최근 알림</span>
              <span style={{ fontSize: 12, color: "var(--color-text-info)", cursor: "pointer" }}>전체 보기</span>
            </div>
            {mockAlerts.map((alert, i) => (
              <div
                key={alert.id}
                style={{
                  padding: "14px 18px",
                  borderBottom: i < mockAlerts.length - 1 ? B : "none",
                  display: "flex", flexDirection: "column", gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: alert.type === "loss" ? "var(--color-border-danger)" : "var(--color-border-success)", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{alert.stock}</span>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 20, fontWeight: 500,
                    background: alert.type === "loss" ? "var(--color-background-danger)" : "var(--color-background-success)",
                    color: alert.type === "loss" ? "var(--color-text-danger)" : "var(--color-text-success)",
                  }}>
                    {alert.type === "loss" ? "로스 지점" : "공격 지점"}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)", paddingLeft: 15 }}>
                  {alert.msg}
                  {alert.distance && (
                    <span style={{ color: alert.type === "loss" ? "var(--color-text-danger)" : "var(--color-text-success)", fontWeight: 500, marginLeft: 4 }}>
                      {alert.distance}
                    </span>
                  )}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)", paddingLeft: 15 }}>{alert.time}</p>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
