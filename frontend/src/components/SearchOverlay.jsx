import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { searchStocks } from "../api/stocks";

const STORAGE_KEY = "recent_searches";

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 10)));
}

export default function SearchOverlay({ onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [recent, setRecent] = useState(getRecent);
  const timerRef = useRef(null);

  const handleInput = (val) => {
    setQuery(val);
    clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(() => {
      searchStocks(val).then(setResults).catch(() => setResults([]));
    }, 250);
  };

  const handleSelect = (stock) => {
    // 최근 검색에 추가
    const updated = [stock, ...recent.filter((r) => r.code !== stock.code)].slice(0, 10);
    setRecent(updated);
    saveRecent(updated);

    onClose();
    navigate(`/chart/${stock.code}`, {
      state: {
        name: stock.name,
        market: stock.market === "해외" ? "US" : "KOSPI",
        exchange: stock.exchange || "NAS",
      },
    });
  };

  const handleRemoveRecent = (code, e) => {
    e.stopPropagation();
    const updated = recent.filter((r) => r.code !== code);
    setRecent(updated);
    saveRecent(updated);
  };

  const handleClearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  const showRecent = !query.trim() && recent.length > 0;
  const showResults = query.trim() && results.length > 0;
  const showEmpty = query.trim() && results.length === 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--color-background-primary)" }}>
      {/* 검색 바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--color-border-tertiary)" }}>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", padding: 4, fontSize: 18, color: "var(--color-text-secondary)", lineHeight: 1, flexShrink: 0 }}>
          ←
        </button>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="종목명 또는 코드 검색"
            style={{
              width: "100%", padding: "10px 36px 10px 14px", fontSize: 15,
              border: "none", outline: "none",
              background: "var(--color-background-secondary)", borderRadius: 10,
              color: "var(--color-text-primary)", boxSizing: "border-box",
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); }}
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                border: "none", background: "var(--color-text-tertiary)", color: "#fff",
                width: 18, height: 18, borderRadius: "50%", fontSize: 11,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                lineHeight: 1, padding: 0,
              }}
            >×</button>
          )}
        </div>
      </div>

      <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 60px)" }}>

        {/* 최근 검색 */}
        {showRecent && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 8px" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>최근 검색</span>
              <button onClick={handleClearRecent} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                전체 삭제
              </button>
            </div>
            {recent.map((s) => (
              <div
                key={s.code}
                onClick={() => handleSelect(s)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", cursor: "pointer" }}
                className="row-hover"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                  </svg>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{s.code}</span>
                </div>
                <button
                  onClick={(e) => handleRemoveRecent(s.code, e)}
                  style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "var(--color-text-tertiary)", padding: "0 4px" }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* 검색 결과 */}
        {showResults && results.map((s) => (
          <div
            key={s.code}
            onClick={() => handleSelect(s)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--color-border-tertiary)", cursor: "pointer" }}
            className="row-hover"
          >
            <div>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>{s.name}</span>
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

        {/* 결과 없음 */}
        {showEmpty && (
          <p style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
            검색 결과가 없습니다
          </p>
        )}

        {/* 초기 상태 (최근 검색도 없을 때) */}
        {!query.trim() && recent.length === 0 && (
          <p style={{ padding: "40px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>
            종목명 또는 코드를 입력하세요
          </p>
        )}
      </div>
    </div>
  );
}
