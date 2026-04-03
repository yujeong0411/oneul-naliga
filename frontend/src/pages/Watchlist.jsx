import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getWatchlist, addStock, removeStock, getPrice, detectMarket, searchStocks } from "../api/stocks";
import { getLines } from "../api/lines";
import { useLivePrices } from "../hooks/useLivePrice";
import { useAuth } from "../context/AuthContext";

const B = "1px solid var(--color-border-tertiary)";

function HeartIcon({ filled, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "#ec4899" : "none"}
      stroke={filled ? "#ec4899" : "currentColor"}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function AddStockSheet({ onClose, onAdd }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }} />
      <div ref={sheetRef} style={{ position: "relative", background: "var(--color-background-primary)", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "0 0 env(safe-area-inset-bottom, 0px)" }}>
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px", cursor: "grab" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
        </div>
        <div style={{ padding: "8px 20px 24px" }}>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}>종목 추가</span>
          </div>
          <div style={{ position: "relative" }}>
            <input autoFocus value={query} onChange={handleInput}
              placeholder="종목명 또는 코드 검색 (예: 삼성, AAPL)"
              style={{ width: "100%", padding: "12px 14px", fontSize: 15, border: B, borderRadius: 10, outline: "none", boxSizing: "border-box", background: "var(--color-background-secondary)", color: "var(--color-text-primary)" }}
            />
            {loading && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--color-text-tertiary)" }}>검색 중...</span>}
          </div>
          {results.length > 0 && (
            <div style={{ marginTop: 8, background: "var(--color-background-secondary)", borderRadius: 10, border: B, overflow: "hidden" }}>
              {results.map((s, i) => (
                <div key={s.code} onClick={() => handleSelect(s)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: i < results.length - 1 ? B : "none", cursor: "pointer" }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>{s.name}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-text-tertiary)" }}>{s.code}</span>
                  </div>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, background: s.market === "해외" ? "var(--color-background-info)" : "var(--color-background-success)", color: s.market === "해외" ? "var(--color-text-info)" : "var(--color-text-success)" }}>
                    {s.market === "해외" ? "US" : "KR"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--color-background-secondary)", borderRadius: 10, border: B, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>{selected.name}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-text-tertiary)" }}>{selected.code}</span>
              </div>
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, fontWeight: 600, background: selected.market === "해외" ? "var(--color-background-info)" : "var(--color-background-success)", color: selected.market === "해외" ? "var(--color-text-info)" : "var(--color-text-success)" }}>
                {selected.market === "해외" ? "US" : "KR"}
              </span>
            </div>
          )}
          <button onClick={() => selected && onAdd(selected)} disabled={!selected}
            style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 700, background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: 12, cursor: selected ? "pointer" : "default", marginTop: 16, opacity: selected ? 1 : 0.4 }}>
            추가하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState([]);
  const [stockMeta, setStockMeta] = useState({});
  const [loadingList, setLoadingList] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);

  const watchlistCodes = useMemo(() => watchlist.map((s) => s.code), [watchlist]);
  const livePrices = useLivePrices(watchlistCodes);

  useEffect(() => {
    getWatchlist(user?.id)
      .then((stocks) => {
        setWatchlist(stocks);
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
    const price = priceData?.price ?? null;
    const changePctMeta = priceData?.change_pct ?? null;
    const changeAmtMeta = priceData?.change_amt ?? null;
    let nearest = null;
    if (price && lines.length > 0) {
      const avgLine = lines.find((l) => l.line_type === "horizontal" && l.price && l.name === "평단가");
      if (avgLine) {
        const dist = ((price - avgLine.price) / avgLine.price) * 100;
        nearest = { type: "평단가", dist: Number(dist.toFixed(2)) };
      }
    }
    setStockMeta((prev) => ({ ...prev, [code]: { price, change_pct: changePctMeta, change_amt: changeAmtMeta, lineCount: lines.length, nearest } }));
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

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", paddingBottom: 80 }}>
      {/* 헤더 */}
      <div style={{ padding: "20px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
<button onClick={() => setShowAddSheet(true)}
          style={{ padding: "7px 14px", fontSize: 18, fontWeight: 400, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", border: "none", borderRadius: 10, cursor: "pointer", lineHeight: 1 }}>
          +
        </button>
      </div>

      {/* 목록 */}
      <div style={{ margin: "0 16px", background: "var(--color-background-primary)", borderRadius: 16, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        {loadingList ? (
          <p style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>불러오는 중...</p>
        ) : watchlist.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <HeartIcon filled={false} size={36} />
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--color-text-tertiary)" }}>관심 종목을 추가해보세요.</p>
          </div>
        ) : (
          watchlist.map((stock, i) => {
            const meta = stockMeta[stock.code];
            const isDom = /^\d{6}$/.test(stock.code);
            const live = livePrices[stock.code];
            const price = live?.price ?? meta?.price;
            const changePct = live?.change_pct ?? meta?.change_pct ?? null;
            const changeAmt = meta?.change_amt ?? null;
            const nearest = meta?.nearest;
            return (
              <div key={stock.id ?? stock.code}
                onClick={() => navigate(`/chart/${stock.code}`, { state: { name: stock.name, market: stock.market === "해외" ? "US" : "KOSPI", exchange: stock.exchange || "NAS" } })}
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
                      {changePct && (() => {
                        const isUp = !changePct.startsWith("-");
                        const amt = (changeAmt != null && changeAmt !== 0)
                          ? changeAmt
                          : (price ? Math.abs(price * parseFloat(changePct) / 100) : null);
                        const amtStr = amt
                          ? (isDom ? Math.round(amt).toLocaleString() : amt.toFixed(2))
                          : null;
                        return (
                          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: isUp ? "var(--color-rise)" : "var(--color-fall)" }}>
                            {isUp ? "▲" : "▼"}{amtStr ? `${amtStr} ` : ""}({changePct}%)
                          </p>
                        );
                      })()}
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>—</p>
                  )}
                </div>
                {nearest && (
                  <div style={{ textAlign: "right", minWidth: 52 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 10, color: "var(--color-text-tertiary)" }}>{nearest.type}</p>
                    <span style={{ fontSize: 13, fontWeight: 700, color: nearest.dist >= 0 ? "var(--color-text-danger)" : "var(--color-text-info)" }}>
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

      {showAddSheet && <AddStockSheet onClose={() => setShowAddSheet(false)} onAdd={handleAddStock} />}
    </div>
  );
}
