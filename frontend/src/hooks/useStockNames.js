import { useState, useEffect } from "react";
import { getWatchlist, searchStocks } from "../api/stocks";

// 모듈 레벨 캐시 — 같은 세션 내 중복 호출 방지
let _wlPromise = null;
let _wlUserId = null;
const _searchCache = {}; // code → name

function fetchWatchlistCached(userId) {
  if (_wlUserId === userId && _wlPromise) return _wlPromise;
  _wlUserId = userId;
  _wlPromise = getWatchlist(userId)
    .then((data) => (Array.isArray(data) ? data : []))
    .catch(() => []);
  return _wlPromise;
}

/**
 * 종목 코드 → 이름 매핑 훅 (watchlist 캐시 + searchStocks fallback)
 * @param {string} userId
 * @param {string[]} codes - 이름이 필요한 종목 코드 배열
 * @returns {{ nameMap, exchangeMap, watchlist, ready }}
 */
export function useStockNames(userId, codes) {
  const [nameMap, setNameMap] = useState({});
  const [exchangeMap, setExchangeMap] = useState({});
  const [watchlist, setWatchlist] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const wl = await fetchWatchlistCached(userId);
      if (cancelled) return;
      setWatchlist(wl);

      const nm = {};
      const em = {};
      wl.forEach((s) => {
        nm[s.code] = s.name;
        if (s.exchange) em[s.code] = s.exchange;
      });

      // 이전 검색 캐시 적용
      for (const [code, name] of Object.entries(_searchCache)) {
        if (!nm[code]) nm[code] = name;
      }

      // watchlist + 캐시에도 없는 코드만 검색
      const unique = codes ? [...new Set(codes)] : [];
      const missing = unique.filter((c) => !nm[c]);

      if (missing.length > 0) {
        await Promise.all(
          missing.map((code) =>
            searchStocks(code)
              .then((results) => {
                const match = Array.isArray(results)
                  ? results.find((r) => r.code === code)
                  : null;
                if (match) {
                  nm[code] = match.name;
                  _searchCache[code] = match.name;
                }
              })
              .catch(() => {})
          )
        );
      }

      if (cancelled) return;
      setNameMap({ ...nm });
      setExchangeMap({ ...em });
      setReady(true);
    })();

    return () => { cancelled = true; };
  }, [userId, codes?.join(",")]);

  return { nameMap, exchangeMap, watchlist, ready };
}
