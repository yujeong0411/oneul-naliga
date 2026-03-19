import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getWatchlist, removeStock } from "../api/stocks";

const B = "1px solid var(--color-border-tertiary)";

function Toggle({ on, onToggle }) {
  return (
    <div onClick={onToggle} style={{
      width: 44, height: 26, borderRadius: 13, cursor: "pointer",
      background: on ? "var(--color-text-success)" : "var(--color-border-primary)",
      position: "relative", transition: "background 0.2s", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: 10,
        background: "white", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </div>
  );
}

function SectionLabel({ label }) {
  return (
    <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "var(--color-text-tertiary)", letterSpacing: "0.3px" }}>
      {label}
    </p>
  );
}

function Row({ label, sub, right, onClick, danger }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px", borderBottom: B, cursor: onClick ? "pointer" : "default",
    }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: danger ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>{label}</p>
        {sub && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{ background: "var(--color-background-primary)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-card)", marginBottom: 20 }}>
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();

  // 다크모드
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // 텔레그램 테스트
  const [tgTesting, setTgTesting] = useState(false);
  const [tgResult, setTgResult] = useState(null);

  const testTelegram = async () => {
    setTgTesting(true);
    setTgResult(null);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${API_URL}/api/alerts/test-telegram`, { method: "POST" });
      const data = await res.json();
      setTgResult(data.ok ? "ok" : "fail");
    } catch {
      setTgResult("fail");
    } finally {
      setTgTesting(false);
    }
  };

  // 관심종목
  const [watchlist, setWatchlist] = useState([]);
  const [showWatchlist, setShowWatchlist] = useState(false);

  useEffect(() => {
    if (showWatchlist) {
      getWatchlist().then(setWatchlist).catch(() => {});
    }
  }, [showWatchlist]);

  const handleRemove = async (code) => {
    await removeStock(code).catch(() => {});
    setWatchlist((prev) => prev.filter((s) => s.code !== code));
  };

  const pad = "0 20px";

  return (
    <div style={{ paddingBottom: 40, maxWidth: 480, margin: "0 auto" }}>

      {/* 프로필 */}
      <div style={{ padding: "32px 20px 24px", textAlign: "center" }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%", margin: "0 auto 12px",
          background: "var(--color-background-tertiary)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, color: "var(--color-text-tertiary)",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <path d="M12 3a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        </div>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>게스트</p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>로그인하면 데이터가 동기화됩니다</p>
      </div>

      <div style={{ padding: pad }}>

        {/* 알림 설정 */}
        <SectionLabel label="알림" />
        <Card>
          <Row
            label="텔레그램 알림"
            sub="선 도달 시 알림 발송"
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {tgResult === "ok" && <span style={{ fontSize: 11, color: "var(--color-text-success)", fontWeight: 600 }}>성공</span>}
                {tgResult === "fail" && <span style={{ fontSize: 11, color: "var(--color-text-danger)", fontWeight: 600 }}>실패</span>}
                <button
                  onClick={testTelegram}
                  disabled={tgTesting}
                  style={{
                    padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 8,
                    border: "none", background: "var(--color-background-tertiary)",
                    color: "var(--color-text-primary)", cursor: "pointer",
                    opacity: tgTesting ? 0.5 : 1,
                  }}
                >
                  {tgTesting ? "전송 중..." : "테스트"}
                </button>
              </div>
            }
          />
        </Card>

        {/* 테마 */}
        <SectionLabel label="화면" />
        <Card>
          <Row
            label="다크 모드"
            right={<Toggle on={darkMode} onToggle={() => setDarkMode((v) => !v)} />}
          />
        </Card>

        {/* 관심종목 관리 */}
        <SectionLabel label="관심종목" />
        <Card>
          <Row
            label="관심종목 관리"
            sub={`${watchlist.length > 0 ? watchlist.length + "개 등록됨" : "목록 보기"}`}
            onClick={() => setShowWatchlist((v) => !v)}
            right={
              <span style={{ fontSize: 16, color: "var(--color-text-tertiary)" }}>
                {showWatchlist ? "▲" : "▼"}
              </span>
            }
          />
          {showWatchlist && watchlist.map((s) => (
            <div key={s.code} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px", borderBottom: B,
              background: "var(--color-background-secondary)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{s.name}</span>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{s.code}</span>
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                  background: s.market === "해외" ? "var(--color-background-info)" : "var(--color-background-success)",
                  color: s.market === "해외" ? "var(--color-text-info)" : "var(--color-text-success)",
                }}>
                  {s.market === "해외" ? "US" : "KR"}
                </span>
              </div>
              <button
                onClick={() => handleRemove(s.code)}
                style={{
                  border: "none", background: "none", cursor: "pointer",
                  fontSize: 12, color: "var(--color-text-danger)", fontWeight: 600, padding: "4px 8px",
                }}
              >
                삭제
              </button>
            </div>
          ))}
          {showWatchlist && watchlist.length === 0 && (
            <p style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
              등록된 관심종목이 없습니다
            </p>
          )}
        </Card>

        {/* 앱 정보 */}
        <SectionLabel label="정보" />
        <Card>
          <Row label="앱 이름" right={<span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>오늘 날이가</span>} />
          <Row label="버전" right={<span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>0.1.0</span>} />
        </Card>

        {/* 계정 */}
        <SectionLabel label="계정" />
        <Card>
          <Row label="로그인 / 회원가입" onClick={() => {}} right={
            <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>›</span>
          } />
          <Row label="로그아웃" danger onClick={() => {}} />
        </Card>

      </div>
    </div>
  );
}
