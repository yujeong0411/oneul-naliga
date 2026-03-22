import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getNews, loadKeywords, saveKeywords } from "../api/news";

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
import { getRanking, getOverseasRanking, getIndices, getFX } from "../api/stocks";
import { prefetchCache } from "../prefetchCache";
import { MARKET_ITEMS, loadMarketSettings, saveMarketSettings } from "../config/marketItems";
import { useAuth } from "../context/AuthContext";

const RANKING_TABS = [
  { type: "view",        label: "조회" },
  { type: "volume",      label: "거래량" },
  { type: "amount",      label: "거래대금" },
  { type: "surge",       label: "거래급증" },
  { type: "rise",        label: "상승" },
  { type: "fall",        label: "하락" },
  { type: "foreign",     label: "외인" },
  { type: "institution", label: "기관" },
  { type: "etf",         label: "ETF" },
];

const OVERSEAS_TABS = [
  { type: "rise",      label: "상승" },
  { type: "fall",      label: "하락" },
  { type: "volume",    label: "거래량" },
  { type: "amount",    label: "거래대금" },
  { type: "marketcap", label: "시총" },
];

const EXCHANGES = [
  { value: "ALL", label: "전체" },
  { value: "NAS", label: "나스닥" },
  { value: "NYS", label: "뉴욕" },
  { value: "AMS", label: "아멕스" },
];

const B = "1px solid var(--color-border-tertiary)";

function ChangeText({ change, style }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 500, color: change >= 0 ? "var(--color-rise)" : "var(--color-fall)", ...style }}>
      {change >= 0 ? "+" : ""}{change}%
    </span>
  );
}

function SectionTitle({ title, action, onAction, actionActive }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.4px" }}>{title}</span>
      {action && (
        <button onClick={onAction} style={{ border: "none", background: actionActive ? "var(--color-text-primary)" : "var(--color-background-tertiary)", cursor: "pointer", fontSize: 12, color: actionActive ? "var(--color-background-primary)" : "var(--color-text-secondary)", fontWeight: 600, padding: "5px 12px", borderRadius: 8, transition: "background 0.15s, color 0.15s" }}>
          {action}
        </button>
      )}
    </div>
  );
}

// 랭킹 아이템 행
function RankItem({ item, i, onClick, isOverseas }) {
  const changeColor = (pct) => {
    if (!pct) return "var(--color-text-tertiary)";
    return String(pct).startsWith("-") ? "var(--color-fall)" : "var(--color-rise)";
  };
  const priceFmt = (price) => {
    if (price == null || price === 0) return "—";
    return isOverseas ? `$${Number(price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : price.toLocaleString() + "원";
  };
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: B, cursor: "pointer", gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: i < 3 ? "var(--color-text-primary)" : "var(--color-text-tertiary)", minWidth: 20, textAlign: "center" }}>
        {item.rank}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</p>
        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>{item.code}</p>
      </div>
      <div style={{ textAlign: "right" }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{priceFmt(item.price)}</p>
        {item.change_pct && (() => {
          const isUp = !String(item.change_pct).startsWith("-");
          const amt = (item.change_amt != null && item.change_amt !== 0)
            ? item.change_amt
            : (item.price ? Math.abs(item.price * parseFloat(item.change_pct) / 100) : null);
          const amtStr = amt
            ? (isOverseas ? Math.abs(amt).toFixed(2) : Math.round(Math.abs(amt)).toLocaleString())
            : null;
          return (
            <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: changeColor(item.change_pct) }}>
              {isUp ? "▲" : "▼"}{amtStr ? `${amtStr} ` : ""}({item.change_pct}%)
            </p>
          );
        })()}
        {item.extra && (
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>{item.extra}</p>
        )}
      </div>
    </div>
  );
}

// 인기 종목 섹션 (국내 / 해외 탭)
function PopularSection({ isMobile, isPC, navigate, onMaintenance }) {
  const [market, setMarket] = useState(() => localStorage.getItem("popular_market") || "domestic");
  const [activeTab, setActiveTab] = useState("view");
  const [overseasTab, setOverseasTab] = useState("rise");
  const [exchange, setExchange] = useState("ALL");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // 국내 랭킹
  useEffect(() => {
    if (market !== "domestic") return;
    setLoading(true); setExpanded(false);
    getRanking(activeTab)
      .then(setItems)
      .catch((e) => { if (e.maintenance) onMaintenance?.(); setItems([]); })
      .finally(() => setLoading(false));
  }, [market, activeTab]);

  // 해외 랭킹
  useEffect(() => {
    if (market !== "overseas") return;
    setLoading(true); setExpanded(false);
    getOverseasRanking(overseasTab, exchange)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [market, overseasTab, exchange]);

  const pad = isMobile ? "0 20px" : isPC ? "0" : "0 24px";
  const padH = isMobile ? "0 20px 10px" : isPC ? "0 0 10px" : "0 24px 10px";

  return (
    <section style={{ paddingTop: 20 }}>
      <div style={{ padding: pad, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.4px" }}>주식 순위</span>
        <button onClick={() => { setMarket((v) => { const next = v === "domestic" ? "overseas" : "domestic"; localStorage.setItem("popular_market", next); return next; }); setItems([]); }}
          style={{
            padding: "6px 0", fontSize: 12, borderRadius: 20, border: "none",
            fontWeight: 700, cursor: "pointer",
            background: "none", display: "flex", alignItems: "center", gap: 0,
          }}>
          <span style={{
            padding: "5px 12px", borderRadius: "20px 0 0 20px",
            background: market === "domestic" ? "var(--color-text-primary)" : "var(--color-background-tertiary)",
            color: market === "domestic" ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
          }}>국내</span>
          <span style={{
            padding: "5px 12px", borderRadius: "0 20px 20px 0",
            background: market === "overseas" ? "var(--color-text-primary)" : "var(--color-background-tertiary)",
            color: market === "overseas" ? "var(--color-background-primary)" : "var(--color-text-tertiary)",
          }}>해외</span>
        </button>
      </div>

      {/* 세부 탭 */}
      {market === "domestic" ? (
        <div className="hide-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto", padding: padH }}>
          {RANKING_TABS.map(({ type, label }) => (
            <button key={type} onClick={() => setActiveTab(type)}
              style={{
                flexShrink: 0, padding: "6px 14px", fontSize: 12, borderRadius: 20, border: "none",
                fontWeight: activeTab === type ? 600 : 400, cursor: "pointer",
                background: activeTab === type ? "var(--color-text-primary)" : "var(--color-background-tertiary)",
                color: activeTab === type ? "var(--color-background-primary)" : "var(--color-text-secondary)",
              }}>{label}</button>
          ))}
        </div>
      ) : (
        <div style={{ padding: padH }}>
          <div className="hide-scrollbar" style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>
            {OVERSEAS_TABS.map(({ type, label }) => (
              <button key={type} onClick={() => setOverseasTab(type)}
                style={{
                  flexShrink: 0, padding: "6px 14px", fontSize: 12, borderRadius: 20, border: "none",
                  fontWeight: overseasTab === type ? 600 : 400, cursor: "pointer",
                  background: overseasTab === type ? "var(--color-text-primary)" : "var(--color-background-tertiary)",
                  color: overseasTab === type ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                }}>{label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {EXCHANGES.map(({ value, label }) => (
              <button key={value} onClick={() => setExchange(value)}
                style={{
                  padding: "4px 12px", fontSize: 11, borderRadius: 8, border: "1px solid",
                  borderColor: exchange === value ? "var(--color-text-primary)" : "var(--color-border-tertiary)",
                  fontWeight: exchange === value ? 700 : 400, cursor: "pointer",
                  background: "transparent",
                  color: exchange === value ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
                }}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* 리스트 */}
      <div style={{ background: "var(--color-background-primary)", borderRadius: 16, overflow: "hidden", margin: isMobile ? "0 20px" : isPC ? "0" : "0 24px", boxShadow: "var(--shadow-card)" }}>
        {loading ? (
          <p style={{ padding: "28px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>불러오는 중...</p>
        ) : items.length === 0 ? (
          <p style={{ padding: "28px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>데이터 없음</p>
        ) : (
          <>
            {(expanded ? items : items.slice(0, 5)).map((item, i) => (
              <RankItem key={item.code + i} item={item} i={i} isOverseas={market === "overseas"}
                onClick={() => navigate(`/chart/${item.code}`, { state: { name: item.name, market: market === "overseas" ? "US" : "KOSPI", exchange: item.exchange } })}
              />
            ))}
            {items.length > 5 && (
              <button onClick={() => setExpanded((v) => !v)}
                style={{ width: "100%", padding: "12px 0", fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", borderTop: B }}>
                {expanded ? "▲ 접기" : `▼ 더보기 (총 ${items.length}개)`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────

function MaintenanceModal({ errors, onClose }) {
  const hasKiwoom = errors.includes("kiwoom");
  const hasKis    = errors.includes("kis");
  const both      = hasKiwoom && hasKis;

  const title = both ? "서비스 점검 중"
              : hasKiwoom ? "국내주식 연결 불가"
              : "해외주식 연결 불가";

  const desc = both
    ? "현재 서버 점검 중으로\n국내·해외 주식 데이터가 표시되지 않을 수 있습니다."
    : hasKiwoom
    ? "현재 서버 점검 중으로\n국내 주식 및 국내 지수 데이터가 표시되지 않을 수 있습니다."
    : "현재 서버 점검 중으로\n해외 주식 데이터가 표시되지 않을 수 있습니다.";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "var(--color-background-primary)",
        borderRadius: 20, padding: "32px 28px",
        maxWidth: 340, width: "100%",
        textAlign: "center",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800, color: "var(--color-text-primary)" }}>
          {title}
        </h2>
        <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
          {desc}
        </p>
        <button onClick={onClose} style={{
          width: "100%", height: 46, borderRadius: 12, border: "none",
          background: "var(--color-background-tertiary)",
          color: "var(--color-text-primary)", fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}>
          확인
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const bp = useBreakpoint();
  const isMobile = bp === "mobile";
  const isPC     = bp === "pc";
  const { user } = useAuth();
  const [apiErrors, setApiErrors] = useState([]);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsKeywords, setNewsKeywords] = useState(loadKeywords);
  const [showKeywordEdit, setShowKeywordEdit] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const keywordPanelRef = useRef(null);
  const [showAllNews, setShowAllNews] = useState(false);
  const todayKey = `maintenance_dismissed_${new Date().toISOString().slice(0, 10)}`;
  const alreadyDismissed = localStorage.getItem(todayKey) === "1";

  useEffect(() => {
    if (!showKeywordEdit) return;
    const handler = (e) => {
      if (keywordPanelRef.current && !keywordPanelRef.current.contains(e.target)) {
        setShowKeywordEdit(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [showKeywordEdit]);
  const [marketData,     setMarketData]     = useState({});
  const [marketSettings, setMarketSettings] = useState(loadMarketSettings);
  const [showMarketEdit, setShowMarketEdit] = useState(false);
  const marketSheetRef = useRef(null);
  const marketStartY = useRef(0);
  const onMarketTouchStart = (e) => { marketStartY.current = e.touches[0].clientY; };
  const onMarketTouchMove = (e) => {
    const dy = e.touches[0].clientY - marketStartY.current;
    if (dy > 0 && marketSheetRef.current) {
      marketSheetRef.current.style.transition = "none";
      marketSheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onMarketTouchEnd = (e) => {
    const dy = e.changedTouches[0].clientY - marketStartY.current;
    if (dy > 100) { setShowMarketEdit(false); }
    else if (marketSheetRef.current) {
      marketSheetRef.current.style.transition = "transform 0.3s ease";
      marketSheetRef.current.style.transform = "translateY(0)";
    }
  };

  // 지수 + 환율 로드 → 통합 marketData (프리페치 캐시 우선)
  useEffect(() => {
    const apply = (indicesResult, fxData) => {
      const { data: indicesData, errors } = indicesResult;
      if (errors.length > 0 && !alreadyDismissed) setApiErrors(errors);
      const merged = {};
      indicesData.forEach((idx) => {
        merged[idx.name] = { value: idx.value, change_pct: idx.change_pct, pred_pre: idx.pred_pre ?? null };
      });
      fxData.forEach((item) => {
        const currency = item.pair.split("/")[0];
        merged[currency] = { value: item.value, unit: item.unit, change_pct: item.change_pct || null };
      });
      setMarketData(merged);
    };

    if (prefetchCache.marketData) {
      const { indicesResult, fxData } = prefetchCache.marketData;
      apply(indicesResult, fxData);
      prefetchCache.marketData = null;
    } else {
      Promise.all([
        getIndices().catch(() => ({ data: [], errors: [] })),
        getFX().catch(() => []),
      ]).then(([indicesResult, fxData]) => apply(indicesResult, fxData));
    }
  }, []);

  useEffect(() => {
    setNewsLoading(true);
    getNews(newsKeywords)
      .then((data) => setNews(data.news || []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, [newsKeywords]);


  return (
    <div style={{ maxWidth: isPC ? 1200 : "100%", margin: "0 auto", padding: isPC ? "0 40px 40px" : "0 0 40px" }}>
      {apiErrors.length > 0 && <MaintenanceModal errors={apiErrors} onClose={() => { localStorage.setItem(todayKey, "1"); setApiErrors([]); }} />}

      {/* ── 2열 그리드 (PC) / 단열 (모바일) ── */}
      <div style={isPC ? { paddingTop: 24 } : {}}>

        {/* ── 왼쪽 컬럼: 시장 지수 · 환율 · 인기 종목 (+ 모바일엔 관심종목도) ── */}
        <div>
          {/* 마켓 (지수 + 환율 통합) */}
          <section style={{ paddingTop: isMobile ? 16 : isPC ? 0 : 20 }}>
            <div style={{ padding: isMobile ? "0 20px" : isPC ? "0" : "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.4px" }}>마켓</span>
              <button onClick={() => setShowMarketEdit(true)} style={{ border: "none", background: "var(--color-background-tertiary)", cursor: "pointer", padding: "5px 10px", borderRadius: 8, lineHeight: 0, color: "var(--color-text-tertiary)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            <div className="hide-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", padding: isMobile ? "0 20px 4px" : isPC ? "0 0 4px" : "0 24px 4px" }}>
              {MARKET_ITEMS.filter((item) => marketSettings[item.id]).map((item) => {
                const data = marketData[item.id];
                const changePct = data?.change_pct ? parseFloat(data.change_pct) : null;
                const isUp = changePct !== null && changePct >= 0;
                const clickable = ["SP500", "NASDAQ", "DOW", "KOSPI", "KOSDAQ"].includes(item.id);
                return (
                  <div key={item.id}
                    onClick={() => {
                      if (!clickable) return;
                      if (item.id === "KOSPI" || item.id === "KOSDAQ") navigate(`/domestic/${item.id}`);
                      else navigate(`/index/${item.id}`);
                    }}
                    style={{
                      flexShrink: 0, minWidth: 110,
                      background: "var(--color-background-primary)",
                      borderRadius: 14, padding: "14px 16px",
                      boxShadow: "var(--shadow-card)",
                      cursor: clickable ? "pointer" : "default",
                    }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)" }}>
                      {item.label}
                      {data?.unit > 1 && <span style={{ fontSize: 9, opacity: 0.6 }}> /100</span>}
                      {clickable && <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 3 }}>›</span>}
                    </p>
                    <p style={{ margin: "6px 0 2px", fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.5px" }}>
                      {data ? data.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "—"}
                    </p>
                    {changePct !== null
                      ? (() => {
                          const amt = data?.pred_pre;
                          const amtStr = amt != null && amt !== 0
                            ? (amt >= 1 ? Number(amt).toFixed(2) : Number(amt).toFixed(4))
                            : null;
                          return (
                            <span style={{ fontSize: 11, fontWeight: 600, color: isUp ? "var(--color-rise)" : "var(--color-fall)" }}>
                              {isUp ? "▲" : "▼"}{amtStr ? `${amtStr} ` : ""}({isUp ? "+" : ""}{changePct.toFixed(2)}%)
                            </span>
                          );
                        })()
                      : <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>&nbsp;</span>
                    }
                  </div>
                );
              })}
            </div>
          </section>

          {/* 인기 종목 */}
          <PopularSection isMobile={isMobile} isPC={isPC} navigate={navigate} onMaintenance={() => { if (!alreadyDismissed) setApiErrors((prev) => prev.includes("kiwoom") ? prev : [...prev, "kiwoom"]); }} />

          {/* 뉴스 */}
          <section style={{ padding: isMobile ? "20px 20px 0" : isPC ? "20px 0 0" : "20px 24px 0" }}>
            <div ref={keywordPanelRef}>
            <SectionTitle title="금융 뉴스" action="키워드 설정" onAction={() => setShowKeywordEdit((v) => !v)} actionActive={showKeywordEdit} />

            {/* 키워드 편집 패널 */}
            {showKeywordEdit && (
              <div style={{ background: "var(--color-background-primary)", borderRadius: 12, padding: "14px 16px", marginBottom: 10, boxShadow: "var(--shadow-card)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {newsKeywords.map((kw) => (
                    <span key={kw} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: "var(--color-background-tertiary)", borderRadius: 20,
                      padding: "4px 10px", fontSize: 12, color: "var(--color-text-primary)",
                    }}>
                      {kw}
                      <button onClick={() => {
                        const next = newsKeywords.filter((k) => k !== kw);
                        setNewsKeywords(next);
                        saveKeywords(next);
                      }} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1, color: "var(--color-text-tertiary)" }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && keywordInput.trim() && !newsKeywords.includes(keywordInput.trim())) {
                        const next = [...newsKeywords, keywordInput.trim()];
                        setNewsKeywords(next);
                        saveKeywords(next);
                        setKeywordInput("");
                      }
                    }}
                    placeholder="키워드 입력 후 Enter"
                    style={{
                      flex: 1, padding: "7px 12px", fontSize: 13, borderRadius: 8,
                      border: "1px solid var(--color-border-tertiary)",
                      background: "var(--color-background-secondary)",
                      color: "var(--color-text-primary)", outline: "none",
                    }}
                  />
                  <button onClick={() => {
                    if (keywordInput.trim() && !newsKeywords.includes(keywordInput.trim())) {
                      const next = [...newsKeywords, keywordInput.trim()];
                      setNewsKeywords(next);
                      saveKeywords(next);
                      setKeywordInput("");
                    }
                  }} style={{
                    padding: "7px 14px", fontSize: 13, borderRadius: 8,
                    border: "none", background: "var(--color-text-primary)",
                    color: "var(--color-background-primary)", cursor: "pointer", fontWeight: 600,
                  }}>추가</button>
                </div>
              </div>
            )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {newsLoading ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)" }}>뉴스 불러오는 중...</p>
              ) : news.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)" }}>뉴스를 불러올 수 없습니다.</p>
              ) : (
                <>
                  {(showAllNews ? news : news.slice(0, 3)).map((item, i) => (
                    <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                      <div style={{
                        background: "var(--color-background-primary)",
                        borderRadius: 12, padding: "12px 16px",
                        boxShadow: "var(--shadow-card)",
                      }}>
                        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.4 }}
                          dangerouslySetInnerHTML={{ __html: item.title }} />
                        {item.description && (
                          <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.4,
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                            dangerouslySetInnerHTML={{ __html: item.description }} />
                        )}
                        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                          {new Date(item.pubDate).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </a>
                  ))}
                  {news.length > 3 && (
                    <button onClick={() => setShowAllNews((v) => !v)} style={{
                      width: "100%", padding: "10px", fontSize: 12, fontWeight: 600,
                      border: "1px solid var(--color-border-tertiary)", borderRadius: 12,
                      background: "var(--color-background-primary)", color: "var(--color-text-secondary)",
                      cursor: "pointer", boxShadow: "var(--shadow-card)",
                    }}>
                      {showAllNews ? "접기 ▲" : `더보기 (${news.length - 3}개) ▼`}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

        </div>


      </div>

      {/* 마켓 편집 시트 */}
      {showMarketEdit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={() => setShowMarketEdit(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }} />
          <div ref={marketSheetRef} style={{ position: "relative", background: "var(--color-background-primary)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "70vh", overflowY: "auto", padding: "0 0 env(safe-area-inset-bottom, 0px)" }}>
            <div
              onTouchStart={onMarketTouchStart}
              onTouchMove={onMarketTouchMove}
              onTouchEnd={onMarketTouchEnd}
              style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", cursor: "grab" }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
            </div>
            <div style={{ padding: "8px 20px 12px" }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>마켓 표시 설정</span>
            </div>
            {[
              { label: "지수", ids: ["KOSPI", "KOSDAQ", "SP500", "NASDAQ", "DOW"] },
              { label: "환율", ids: ["USD", "JPY", "EUR", "CNY", "GBP"] },
            ].map(({ label: groupLabel, ids }) => (
              <div key={groupLabel}>
                <p style={{ margin: 0, padding: "8px 20px", fontSize: 11, fontWeight: 700, color: "var(--color-text-tertiary)", background: "var(--color-background-secondary)" }}>
                  {groupLabel}
                </p>
                {ids.map((id) => {
                  const item = MARKET_ITEMS.find((m) => m.id === id);
                  if (!item) return null;
                  const on = !!marketSettings[id];
                  return (
                    <div key={id} onClick={() => {
                      setMarketSettings((prev) => {
                        const next = { ...prev, [id]: !prev[id] };
                        saveMarketSettings(next);
                        return next;
                      });
                    }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: B, cursor: "pointer" }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{item.label}</span>
                      <div style={{ width: 44, height: 26, borderRadius: 13, background: on ? "#3a9e62" : "var(--color-border-secondary)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <div style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: 10, background: "white", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
