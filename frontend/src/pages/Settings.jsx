import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getWatchlist, removeStock } from "../api/stocks";
import { useAuth } from "../context/AuthContext";
import { useDarkMode } from "../hooks/useDarkMode";
import { usePushNotification } from "../hooks/usePushNotification";

const B = "1px solid var(--color-border-tertiary)";

function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--color-background-primary)",
      borderRadius: 14, overflow: "hidden",
      boxShadow: "var(--shadow-card)",
      marginBottom: 12,
      ...style,
    }}>
      {children}
    </div>
  );
}

function Row({ label, sub, right, onClick, danger, noBorder }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px",
      borderBottom: noBorder ? "none" : B,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: danger ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>{label}</p>
        {sub && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function SectionLabel({ label }) {
  return (
    <p style={{ margin: "20px 0 8px", fontSize: 12, fontWeight: 700, color: "var(--color-text-tertiary)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
      {label}
    </p>
  );
}

export default function Settings() {
  const { user, loginWithKakao, logout } = useAuth();
  const [dark, toggleDark] = useDarkMode();
  const { supported: pushSupported, subscribed, loading: pushLoading, subscribe, unsubscribe, testPush } = usePushNotification(user?.id);

  // 관심종목
  const [watchlist, setWatchlist] = useState([]);
  const [showWatchlist, setShowWatchlist] = useState(false);

  useEffect(() => {
    if (showWatchlist) {
      getWatchlist(user?.id).then(setWatchlist).catch(() => {});
    }
  }, [showWatchlist, user?.id]);

  const handleRemove = async (code) => {
    await removeStock(code, user?.id).catch(() => {});
    setWatchlist((prev) => prev.filter((s) => s.code !== code));
  };

  const pad = "0 20px";

  return (
    <div style={{ paddingBottom: 60, maxWidth: 480, margin: "0 auto" }}>

      {/* 상단 타이틀 */}
      <div style={{ padding: "28px 20px 12px" }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}>
          설정
        </h2>
      </div>

      {/* 프로필 카드 */}
      <div style={{ padding: "0 20px 4px" }}>
        <Card>
          <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 14 }}>
            {/* 아바타 */}
            <div style={{
              width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
              background: "var(--color-background-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="프로필" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-tertiary)" }}>
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <path d="M12 3a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              )}
            </div>

            {/* 이름 / 이메일 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user ? (user.user_metadata?.full_name || user.email || "사용자") : "게스트"}
              </p>
              {user && (
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email || "카카오 로그인"}
                </p>
              )}
            </div>

            {/* 로그인/로그아웃 버튼 */}
            {user ? (
              <button onClick={logout} style={{
                padding: "8px 16px", borderRadius: 10,
                border: "1px solid var(--color-border-primary)",
                background: "transparent", color: "var(--color-text-secondary)",
                fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
              }}>
                로그아웃
              </button>
            ) : (
              <button onClick={loginWithKakao} style={{
                padding: "8px 16px", borderRadius: 10, border: "none",
                background: "#FEE500", color: "#191919",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M9 1.5C4.86 1.5 1.5 4.186 1.5 7.5c0 2.088 1.236 3.924 3.096 5.004l-.792 2.952a.188.188 0 00.288.204l3.456-2.268C7.686 13.458 8.34 13.5 9 13.5c4.14 0 7.5-2.686 7.5-6S13.14 1.5 9 1.5z" fill="#191919"/>
                </svg>
                카카오 로그인
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* 나머지 섹션 */}
      <div style={{ padding: pad }}>

        {/* 관심종목 관리 */}
        <SectionLabel label="관심종목" />
        <Card>
          <Row
            label="관심종목 관리"
            sub={watchlist.length > 0 ? `${watchlist.length}개 등록됨` : "목록 보기"}
            onClick={() => setShowWatchlist((v) => !v)}
            noBorder={!showWatchlist || watchlist.length === 0}
            right={
              <span style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
                {showWatchlist ? "▲" : "▼"}
              </span>
            }
          />
          {showWatchlist && watchlist.map((s, i) => (
            <div key={s.code} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "11px 16px",
              borderBottom: i < watchlist.length - 1 ? B : "none",
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
              <button onClick={() => handleRemove(s.code)} style={{
                border: "none", background: "none", cursor: "pointer",
                fontSize: 12, color: "var(--color-text-danger)", fontWeight: 600, padding: "4px 8px",
              }}>
                삭제
              </button>
            </div>
          ))}
          {showWatchlist && watchlist.length === 0 && (
            <p style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
              등록된 관심종목이 없습니다
            </p>
          )}
        </Card>

        {/* 화면 */}
        <SectionLabel label="화면" />
        <Card>
          <Row
            label="다크 모드"
            noBorder
            right={
              <div onClick={toggleDark} style={{
                width: 44, height: 26, borderRadius: 13, cursor: "pointer",
                background: dark ? "#3a9e62" : "var(--color-border-secondary)",
                position: "relative", transition: "background 0.2s", flexShrink: 0,
              }}>
                <div style={{
                  position: "absolute", top: 3, left: dark ? 21 : 3,
                  width: 20, height: 20, borderRadius: 10,
                  background: "white", transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                }} />
              </div>
            }
          />
        </Card>

        {/* 알림 */}
        <SectionLabel label="알림" />
        <Card>
          {pushSupported ? (
            <Row
              label="브라우저 푸시 알림"
              sub={subscribed ? "선에 근접하면 알림을 보냅니다" : "알림을 허용하면 선 근접 시 알려드립니다"}
              noBorder={!subscribed}
              right={
                <div onClick={pushLoading ? undefined : (subscribed ? unsubscribe : subscribe)} style={{
                  width: 44, height: 26, borderRadius: 13, cursor: pushLoading ? "default" : "pointer",
                  background: subscribed ? "#3a9e62" : "var(--color-border-secondary)",
                  position: "relative", transition: "background 0.2s", flexShrink: 0, opacity: pushLoading ? 0.5 : 1,
                }}>
                  <div style={{
                    position: "absolute", top: 3, left: subscribed ? 21 : 3,
                    width: 20, height: 20, borderRadius: 10,
                    background: "white", transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  }} />
                </div>
              }
            />
          ) : (
            <Row label="브라우저 푸시 알림" sub="이 브라우저는 푸시 알림을 지원하지 않습니다" noBorder right={null} />
          )}
          {subscribed && (
            <Row
              label="테스트 알림 보내기"
              noBorder
              onClick={testPush}
              right={<span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>›</span>}
            />
          )}
        </Card>

        {/* 앱 정보 */}
        <SectionLabel label="정보" />
        <Card>
          <Row label="앱 이름" right={<span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>오늘 날이가</span>} />
          <Row label="버전" noBorder right={<span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>0.1.0</span>} />
        </Card>

      </div>
    </div>
  );
}
