import { useState, useEffect, useRef } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

const isDomestic = (code) => /^\d{6}$/.test(code);

/**
 * 실시간 호가 훅
 * @param {string} code - 종목 코드
 * @param {string} [exchange] - 해외 종목 거래소 코드 (NAS, NYS, AMS 등)
 * @returns {{ asks, bids, total_ask_qty, total_bid_qty, supportResistance, marketClosed }}
 */
export function useOrderbook(code, exchange = "NAS") {
  const [orderbook, setOrderbook] = useState({
    asks: [],
    bids: [],
    total_ask_qty: 0,
    total_bid_qty: 0,
  });
  const [supportResistance, setSupportResistance] = useState([]);
  const [marketClosed, setMarketClosed] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!code) return;

    let url;
    if (isDomestic(code)) {
      url = `${WS_URL}/ws/orderbook?codes=${code}`;
    } else {
      url = `${WS_URL}/ws/us_orderbook?codes=${exchange}:${code}`;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // 장외시간 알림 (국내 전용)
        if (data.market_closed) {
          setMarketClosed(true);
          return;
        }

        if (data.code !== code) return;

        const ob = {
          asks: data.asks || [],
          bids: data.bids || [],
          total_ask_qty: data.total_ask_qty || 0,
          total_bid_qty: data.total_bid_qty || 0,
        };
        setOrderbook(ob);
        setMarketClosed(false);

        // 잔량 분석: 평균의 3배 이상인 가격대 탐지
        const allEntries = [...ob.asks, ...ob.bids];
        if (allEntries.length > 0) {
          const avgQty = allEntries.reduce((s, e) => s + e.quantity, 0) / allEntries.length;
          const threshold = avgQty * 3;

          const levels = allEntries
            .filter((e) => e.quantity >= threshold && e.price > 0)
            .map((e) => ({
              price: e.price,
              quantity: e.quantity,
              type: ob.asks.some((a) => a.price === e.price) ? "resistance" : "support",
              ratio: (e.quantity / avgQty).toFixed(1),
            }));

          setSupportResistance(levels);
        } else {
          setSupportResistance([]);
        }
      } catch {}
    };

    ws.onerror = () => {};

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [code, exchange]); // eslint-disable-line

  return { ...orderbook, supportResistance, marketClosed };
}
