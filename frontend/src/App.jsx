import { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthCallback from "./pages/AuthCallback";
import Login from "./pages/Login";
import Home from "./pages/Home";
import ChartDetail from "./pages/ChartDetail";
import IndexDetail from "./pages/IndexDetail";
import DomesticIndexDetail from "./pages/DomesticIndexDetail";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Watchlist from "./pages/Watchlist";
import SplashScreen from "./components/SplashScreen";
import { useAlertCount } from "./hooks/useAlertCount";
import { getIndices, getFX } from "./api/stocks";
import { prefetchCache } from "./prefetchCache";
import SearchOverlay from "./components/SearchOverlay";
import { useDarkMode } from "./hooks/useDarkMode";

function useBreakpoint() {
  const get = () => window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "pc";
  const [bp, setBp] = useState(get);
  useEffect(() => {
    const h = () => setBp(get());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return bp;
}

function Icon({ d, d2, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

const NAV = [
  {
    id: "home", label: "홈", path: "/",
    d: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z", d2: "M9 22V12h6v10",
  },
  {
    id: "alert", label: "알림", path: "/alerts",
    d: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  },
  {
    id: "settings", label: "설정", path: "/settings",
    d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    d2: "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

// ── 모바일: 상단 헤더 (로고 + 아이콘들) ──

function HeartIcon({ active, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function useScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function MobileHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const alertCount = useAlertCount();
  const { user } = useAuth();
  const [showSearch, setShowSearch] = useState(false);
  const scrolled = useScrolled();

  if (location.pathname.startsWith("/chart/")) return null;

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const isWatchlist = location.pathname === "/watchlist";

  return (
    <>
    <header style={{
      position: "sticky", top: 0, zIndex: 20,
      background: scrolled ? "var(--header-bg)" : "transparent",
      borderBottom: scrolled ? "1px solid var(--header-border)" : "none",
      transition: "background 0.2s ease, border-color 0.2s ease",
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      <div style={{ height: 52, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
          <img src="/logo.png" alt="logo" style={{ width: 30, height: 30, borderRadius: 8 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* 검색 */}
          <button onClick={() => setShowSearch(true)} style={{ border: "none", background: "none", cursor: "pointer", padding: 6, lineHeight: 0, color: "var(--color-text-tertiary)" }}>
            <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" size={20} />
          </button>
          {/* 관심종목 (하트) */}
          <button onClick={() => navigate("/watchlist")} style={{
            border: "none", background: isWatchlist ? "var(--color-background-tertiary)" : "none",
            cursor: "pointer", padding: 6, borderRadius: 8, lineHeight: 0,
            color: isWatchlist ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          }}>
            <HeartIcon active={isWatchlist} size={20} />
          </button>
          {/* 알림 */}
          <button onClick={() => navigate("/alerts")} style={{
            border: "none", background: location.pathname === "/alerts" ? "var(--color-background-tertiary)" : "none",
            cursor: "pointer", padding: 6, borderRadius: 8, lineHeight: 0,
            color: location.pathname === "/alerts" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            position: "relative",
          }}>
            <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" size={20} />
            {alertCount > 0 && (
              <span style={{
                position: "absolute", top: 2, right: 2,
                minWidth: 14, height: 14, borderRadius: 7,
                background: "var(--color-text-danger)", color: "#fff",
                fontSize: 9, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 3px",
              }}>
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </button>
          {/* 프로필 */}
          <button onClick={() => navigate("/settings")} style={{
            border: "none", background: location.pathname === "/settings" ? "var(--color-background-tertiary)" : "none",
            cursor: "pointer", padding: avatarUrl ? 2 : 6, borderRadius: 8, lineHeight: 0,
            color: location.pathname === "/settings" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="profile" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", display: "block" }} />
              : <Icon d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" d2="M12 3a4 4 0 100 8 4 4 0 000-8z" size={20} />
            }
          </button>
        </div>
      </div>
    </header>

    {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
    </>
  );
}

// ── 모바일: 하단 탭바 (스크롤 내리면 숨김, 올리면 나타남) ──

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 60) {
        setVisible(false); // 스크롤 다운 → 숨김
      } else {
        setVisible(true);  // 스크롤 업 → 나타남
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (location.pathname.startsWith("/chart/")) return null;

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: "var(--header-bg)",
      boxShadow: "0 -1px 0 var(--header-border)",
      display: "flex",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      zIndex: 100,
      transform: visible ? "translateY(0)" : "translateY(100%)",
      transition: "transform 0.3s ease",
    }}>
      {NAV.map((item) => {
        const active = location.pathname === item.path;
        return (
          <button key={item.id} onClick={() => navigate(item.path)} style={{
            flex: 1, border: "none", background: "none",
            padding: "10px 0 8px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            cursor: "pointer",
            color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          }}>
            <Icon d={item.d} d2={item.d2} size={20} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── PC/태블릿: 미니멀 상단 네비 ──

function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [showSearch, setShowSearch] = useState(false);
  const scrolled = useScrolled();

  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const isWatchlist = location.pathname === "/watchlist";

  return (
    <>
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      background: scrolled ? "var(--header-bg)" : "transparent",
      borderBottom: scrolled ? "1px solid var(--header-border)" : "none",
      transition: "background 0.2s ease, border-color 0.2s ease",
      height: 52,
      padding: "0 32px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => navigate("/")}>
        <img src="/logo.png" alt="logo" style={{ width: 26, height: 26, borderRadius: 7 }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>오늘 날이가</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* 검색 */}
        <button onClick={() => setShowSearch(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: "transparent", color: "var(--color-text-tertiary)", fontSize: 13, cursor: "pointer" }}>
          <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" size={16} />
          검색
        </button>

        {/* 관심종목 (하트) */}
        <button onClick={() => navigate("/watchlist")} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 8, border: "none",
          background: isWatchlist ? "var(--color-background-tertiary)" : "transparent",
          fontSize: 13, fontWeight: isWatchlist ? 600 : 400,
          cursor: "pointer",
          color: isWatchlist ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        }}>
          <HeartIcon active={isWatchlist} size={16} />
          관심종목
        </button>

        {NAV.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button key={item.id} onClick={() => navigate(item.path)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              border: "none",
              background: active ? "var(--color-background-tertiary)" : "transparent",
              color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
              fontSize: 13, fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}>
              <Icon d={item.d} d2={item.d2} size={16} />
              {item.label}
            </button>
          );
        })}

        {/* 프로필 */}
        <button onClick={() => navigate("/settings")} style={{
          display: "flex", alignItems: "center",
          padding: avatarUrl ? "4px" : "6px 14px", gap: 6, borderRadius: 8,
          border: "none",
          background: location.pathname === "/settings" ? "var(--color-background-tertiary)" : "transparent",
          color: "var(--color-text-tertiary)", cursor: "pointer",
        }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="profile" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", display: "block" }} />
            : <Icon d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" d2="M12 3a4 4 0 100 8 4 4 0 000-8z" size={16} />
          }
        </button>
      </div>
    </header>
    {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
    </>
  );
}

// ── 레이아웃 ──

function AppLayout() {
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const { user } = useAuth();

  // 로그인 안 된 경우 (/auth/callback 은 허용)
  const path = window.location.pathname;
  if (!user && path !== "/auth/callback") return <Login />;

  return (
    <div style={{ minHeight: "100vh" }}>
      {isMobile ? <MobileHeader /> : <TopNav />}
      <div style={{ maxWidth: isMobile ? 480 : "100%", margin: "0 auto" }}>
        <Routes>
          <Route path="/"              element={<Home />} />
          <Route path="/chart/:code"   element={<ChartDetail />} />
          <Route path="/index/:id"        element={<IndexDetail />} />
          <Route path="/domestic/:id"     element={<DomesticIndexDetail />} />
          <Route path="/watchlist"     element={<Watchlist />} />
          <Route path="/alerts"        element={<Alerts />} />
          <Route path="/settings"      element={<Settings />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </div>
    </div>
  );
}

function AppWithSplash() {
  const { loading: authLoading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  // 스플래시 중 홈 데이터 프리페치
  useEffect(() => {
    Promise.all([
      getIndices().catch(() => ({ data: [], errors: [] })),
      getFX().catch(() => []),
    ]).then(([indicesResult, fxData]) => {
      prefetchCache.marketData = { indicesResult, fxData };
    });
  }, []);

  return (
    <>
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} ready={!authLoading} />}
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </>
  );
}

export default function App() {
  // 저장된 테마 적용
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  }, []);

  return (
    <AuthProvider>
      <AppWithSplash />
    </AuthProvider>
  );
}
