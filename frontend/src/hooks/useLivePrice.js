import { useState, useEffect, useRef } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

const isDomestic = (code) => /^\d{6}$/.test(code);

/**
 * 실시간 가격 훅 (국내: Kiwoom WS, 미국: KIS WS)
 * @param {string[]} codes - 종목 코드 배열 (국내 6자리)
 * @returns {Object} prices - { [code]: { price, change_pct } }
 */
export function useLivePrices(codes) {
  const [prices, setPrices] = useState({});
  const wsRef = useRef(null);

  useEffect(() => {
    if (!codes || codes.length === 0) return;

    const domesticCodes = codes.filter(isDomestic);
    if (domesticCodes.length === 0) return;

    const url = `${WS_URL}/ws/prices?codes=${domesticCodes.join(",")}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.code && data.price != null) {
          setPrices((prev) => ({
            ...prev,
            [data.code]: { price: data.price, change_pct: data.change_pct },
          }));
        }
      } catch {}
    };

    ws.onerror = () => {};

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [codes.join(",")]); // eslint-disable-line

  return prices;
}

/**
 * 단일 종목 실시간 가격 훅
 * @param {string} code - 종목 코드
 * @param {string} [exchange] - 해외 종목 거래소 코드 (NAS, NYS, AMS 등)
 * @returns {{ price: number|null, change_pct: string|null }}
 */
export function useLivePrice(code, exchange = "NAS") {
  const [liveData, setLiveData] = useState({ price: null, change_pct: null });
  const wsRef = useRef(null);

  const domestic = isDomestic(code);

  useEffect(() => {
    if (!code) return;

    let url;
    if (domestic) {
      url = `${WS_URL}/ws/prices?codes=${code}`;
    } else {
      url = `${WS_URL}/ws/us_prices?codes=${exchange}:${code}`;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.code === code && data.price != null) {
          setLiveData({ price: data.price, change_pct: data.change_pct });
        }
      } catch {}
    };

    ws.onerror = () => {};

    return () => {
      ws.close();
      wsRef.current = null;
      setLiveData({ price: null, change_pct: null });
    };
  }, [code, exchange]); // eslint-disable-line

  return liveData;
}
