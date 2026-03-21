import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLivePrices } from "../hooks/useLivePrice";

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
import { getWatchlist, addStock, removeStock, getPrice, detectMarket, searchStocks, getRanking, getOverseasRanking, getIndices, getFX } from "../api/stocks";
import { MARKET_ITEMS, loadMarketSettings, saveMarketSettings } from "../config/marketItems";
import { getLines } from "../api/lines";
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

function SectionTitle({ title, action, onAction }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text-primary)", letterSpacing: "-0.4px" }}>{title}</span>
      {action && (
        <button onClick={onAction} style={{ border: "none", background: "var(--color-background-tertiary)", cursor: "pointer", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 600, padding: "5px 12px", borderRadius: 8 }}>
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
        {item.change_pct && (
          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: changeColor(item.change_pct) }}>{item.change_pct}%</p>
        )}
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

// 종목 추가 바텀시트 (검색 자동완성)
function AddStockSheet({ onClose, onAdd }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState([]);
  const [selected, setSelected] = useState(null); // { code, name, market }
  const [loading,  setLoading]  = useState(false);
  const timerRef = useRef(null);
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
    if (dy > 100) { onClose(); }
    else if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 0.3s ease";
      sheetRef.current.style.transform = "translateY(0)";
    }
  };

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setSelected(null);
    clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchStocks(val);
        setResults(data);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
  };

  const handleSelect = (stock) => {
    setSelected(stock);
    setQuery(`${stock.name} (${stock.code})`);
    setResults([]);
  };

  const handleAdd = () => {
    if (!selected) return;
    onAdd(selected);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }} />
      <div
        ref={sheetRef}
        style={{
          position: "relative", background: "var(--color-background-primary)",
          borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480,
          padding: "0 0 env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", cursor: "grab" }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
        </div>
        <div style={{ padding: "8px 20px 24px" }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>종목 추가</span>
          </div>

          {/* 검색 입력 */}
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              value={query}
              onChange={handleInput}
              placeholder="종목명 또는 코드 검색 (예: 삼성, AAPL)"
              style={{
                width: "100%", padding: "12px 14px", fontSize: 15,
                border: B, borderRadius: 10, outline: "none",
                boxSizing: "border-box",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-primary)",
              }}
            />
            {loading && (
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                검색 중...
              </span>
            )}
          </div>

          {/* 검색 결과 목록 */}
          {results.length > 0 && (
            <div style={{ marginTop: 8, background: "var(--color-background-secondary)", borderRadius: 10, border: B, overflow: "hidden" }}>
              {results.map((s, i) => (
                <div key={s.code} onClick={() => handleSelect(s)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderBottom: i < results.length - 1 ? B : "none",
                    cursor: "pointer",
                  }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{s.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-text-tertiary)" }}>{s.code}</span>
                  </div>
                  <span style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600,
                    background: s.market === "해외" ? "var(--color-background-info)" : "var(--color-background-success)",
                    color: s.market === "해외" ? "var(--color-text-info)" : "var(--color-text-success)",
                  }}>
                    {s.market === "해외" ? "US" : "KR"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 선택된 종목 확인 */}
          {selected && (
            <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--color-background-secondary)", borderRadius: 10, border: B, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>{selected.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-text-tertiary)" }}>{selected.code}</span>
              </div>
              <span style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600,
                background: selected.market === "해외" ? "var(--color-background-info)" : "var(--color-background-success)",
                color: selected.market === "해외" ? "var(--color-text-info)" : "var(--color-text-success)",
              }}>
                {selected.market === "해외" ? "US" : "KR"}
              </span>
            </div>
          )}

          <button onClick={handleAdd} disabled={!selected}
            style={{
              width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700,
              background: "var(--color-text-primary)", color: "var(--color-background-primary)",
              border: "none", borderRadius: 12, cursor: selected ? "pointer" : "default",
              marginTop: 16, opacity: selected ? 1 : 0.4,
            }}>
            추가하기
          </button>
        </div>
      </div>
    </div>
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
  const todayKey = `maintenance_dismissed_${new Date().toISOString().slice(0, 10)}`;
  const alreadyDismissed = localStorage.getItem(todayKey) === "1";
  const [watchlist,   setWatchlist]   = useState([]);
  const [stockMeta,   setStockMeta]   = useState({});
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [loadingList,  setLoadingList]  = useState(true);
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
  const watchlistCodes = useMemo(() => watchlist.map((s) => s.code), [watchlist]);
  const livePrices = useLivePrices(watchlistCodes);

  // 지수 + 환율 로드 → 통합 marketData
  useEffect(() => {
    Promise.all([
      getIndices().catch(() => ({ data: [], errors: [] })),
      getFX().catch(() => []),
    ]).then(([indicesResult, fxData]) => {
      const { data: indicesData, errors } = indicesResult;
      if (errors.length > 0 && !alreadyDismissed) setApiErrors(errors);
      const merged = {};
      indicesData.forEach((idx) => {
        merged[idx.name] = { value: idx.value, change_pct: idx.change_pct };
      });
      fxData.forEach((item) => {
        const currency = item.pair.split("/")[0];
        merged[currency] = { value: item.value, unit: item.unit, change_pct: item.change_pct || null };
      });
      setMarketData(merged);
    });
  }, []);

  // 관심종목 로드
  useEffect(() => {
    getWatchlist(user?.id)
      .then((stocks) => {
        setWatchlist(stocks);
        // 각 종목 라인 정보 병렬 로드
        stocks.forEach((s) => loadStockMeta(s.code, s.exchange || "NAS"));
      })
      .catch(() => setWatchlist([]))
      .finally(() => setLoadingList(false));
  }, [user?.id]);

  const loadStockMeta = async (code, exchange = "NAS") => {
    const market = detectMarket(code);
    const [priceData, lines] = await Promise.all([
      getPrice(market, code, exchange).catch(() => null),
      getLines(code, user?.id).catch(() => []),
    ]);

    // 가장 가까운 선 계산
    const price = priceData?.price ?? null;
    let nearest = null;
    if (price && lines.length > 0) {
      const withDist = lines
        .filter((l) => l.line_type === "horizontal" && l.price)
        .map((l) => ({ ...l, dist: ((price - l.price) / l.price) * 100 }));
      if (withDist.length > 0) {
        const closest = withDist.reduce((a, b) => Math.abs(a.dist) < Math.abs(b.dist) ? a : b);
        nearest = { type: closest.signal_type === "loss" ? "지지선" : "저항선", dist: Number(closest.dist.toFixed(2)) };
      }
    }

    setStockMeta((prev) => ({
      ...prev,
      [code]: { price, lineCount: lines.length, nearest },
    }));
  };

  const handleAddStock = async (body) => {
    try {
      const saved = await addStock({ ...body, user_id: user?.id });
      setWatchlist((prev) => [...prev, saved]);
      loadStockMeta(saved.code);
    } catch (e) {
      if (e?.message?.includes("409")) alert("이미 등록된 종목입니다.");
    }
    setShowAddSheet(false);
  };

  const handleRemoveStock = async (code, e) => {
    e.stopPropagation();
    await removeStock(code, user?.id).catch(() => {});
    setWatchlist((prev) => prev.filter((s) => s.code !== code));
    setStockMeta((prev) => { const n = { ...prev }; delete n[code]; return n; });
  };

  // 관심종목 공통 렌더러
  const WatchlistContent = ({ liveData = {} }) => (
    <div style={{ background: "var(--color-background-primary)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      {loadingList ? (
        <p style={{ padding: "32px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>불러오는 중...</p>
      ) : watchlist.length === 0 ? (
        <div style={{ padding: "36px 20px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)" }}>관심 종목을 추가해보세요.</p>
          <button onClick={() => setShowAddSheet(true)}
            style={{ marginTop: 12, padding: "9px 20px", fontSize: 13, fontWeight: 600, background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: 10, cursor: "pointer" }}>
            + 종목 추가
          </button>
        </div>
      ) : (
        watchlist.map((stock, i) => {
          const meta    = stockMeta[stock.code];
          const isDom   = /^\d{6}$/.test(stock.code);
          const live    = liveData[stock.code];
          const price   = live?.price ?? meta?.price;
          const changePct = live?.change_pct ?? null;
          const nearest = meta?.nearest;
          return (
            <div key={stock.id ?? stock.code} onClick={() => navigate(`/chart/${stock.code}`, { state: { name: stock.name, market: stock.market === "해외" ? "US" : "KOSPI", exchange: stock.exchange || "NAS" } })}
              className="row-hover"
              style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 12, borderBottom: i < watchlist.length - 1 ? B : "none", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>{stock.name}</span>
                  <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, fontWeight: 600, background: stock.market === "해외" ? "var(--color-background-info)" : "var(--color-background-success)", color: stock.market === "해외" ? "var(--color-text-info)" : "var(--color-text-success)" }}>
                    {stock.market === "해외" ? "US" : "KR"}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {stock.code} · 선 {meta?.lineCount ?? 0}개
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                {price != null ? (
                  <>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {isDom ? price.toLocaleString() + "원" : "$" + price.toLocaleString()}
                    </p>
                    {changePct && (
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: changePct.startsWith("-") ? "var(--color-fall)" : "var(--color-rise)" }}>
                        {changePct}%
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>—</p>
                )}
              </div>
              {nearest && (
                <div style={{ textAlign: "right", minWidth: 52 }}>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: "var(--color-text-tertiary)" }}>{nearest.type}</p>
                  <span style={{ fontSize: 13, fontWeight: 700, color: Math.abs(nearest.dist) < 1 ? "var(--color-text-danger)" : nearest.dist < 0 ? "var(--color-text-success)" : "var(--color-text-warning)" }}>
                    {nearest.dist > 0 ? "+" : ""}{nearest.dist}%
                  </span>
                </div>
              )}
              <button onClick={(e) => handleRemoveStock(stock.code, e)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "var(--color-text-tertiary)", padding: "0 2px", flexShrink: 0 }}>×</button>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: isPC ? 1200 : "100%", margin: "0 auto", padding: isPC ? "0 40px 40px" : "0 0 40px" }}>
      {apiErrors.length > 0 && <MaintenanceModal errors={apiErrors} onClose={() => { localStorage.setItem(todayKey, "1"); setApiErrors([]); }} />}

      {/* ── 2열 그리드 (PC) / 단열 (모바일) ── */}
      <div style={isPC ? { display: "grid", gridTemplateColumns: "1fr 380px", gap: 32, paddingTop: 24 } : {}}>

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
                const clickable = ["SP500", "NASDAQ", "DOW"].includes(item.id);
                return (
                  <div key={item.id}
                    onClick={() => clickable && navigate(`/index/${item.id}`)}
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
                      ? <span style={{ fontSize: 11, fontWeight: 600, color: isUp ? "var(--color-rise)" : "var(--color-fall)" }}>
                          {isUp ? "+" : ""}{changePct.toFixed(2)}%
                        </span>
                      : <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>&nbsp;</span>
                    }
                  </div>
                );
              })}
            </div>
          </section>

          {/* 인기 종목 */}
          <PopularSection isMobile={isMobile} isPC={isPC} navigate={navigate} onMaintenance={() => { if (!alreadyDismissed) setApiErrors((prev) => prev.includes("kiwoom") ? prev : [...prev, "kiwoom"]); }} />

          {/* 모바일·태블릿: 관심종목 */}
          {!isPC && (
            <section style={{ padding: isMobile ? "20px 20px 0" : "20px 24px 0" }}>
              <SectionTitle title="관심 종목" action="+ 추가" onAction={() => setShowAddSheet(true)} />
              <WatchlistContent liveData={livePrices} />
            </section>
          )}
        </div>

        {/* ── 오른쪽 컬럼: 관심 종목 (PC 전용, sticky) ── */}
        {isPC && (
          <div style={{ position: "sticky", top: 76, alignSelf: "start" }}>
            <SectionTitle title="관심 종목" action="+ 추가" onAction={() => setShowAddSheet(true)} />
            <WatchlistContent liveData={livePrices} />
          </div>
        )}

      </div>

      {showAddSheet && (
        <AddStockSheet onClose={() => setShowAddSheet(false)} onAdd={handleAddStock} />
      )}

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
