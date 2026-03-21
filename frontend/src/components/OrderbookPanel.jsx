import { useState, useEffect, useMemo } from "react";
import { getOrderbook } from "../api/stocks";
import { useOrderbook } from "../hooks/useOrderbook";

const B = "var(--border-tertiary)";

/**
 * 호가창 패널
 * - REST로 초기 호가 로드
 * - WebSocket으로 실시간 업데이트
 * - 잔량이 큰 가격대 하이라이트 (평균 3배 이상)
 */
export default function OrderbookPanel({ market, code, exchange = "NAS", onSaveSupportResistance }) {
  const isDomestic = /^\d{6}$/.test(code);

  // REST 초기 데이터
  const [initialData, setInitialData] = useState(null);

  useEffect(() => {
    getOrderbook(market, code, isDomestic ? undefined : exchange)
      .then((data) => setInitialData(data))
      .catch(() => {});
  }, [market, code, exchange]);

  // WebSocket 실시간 데이터
  const live = useOrderbook(code, exchange);
  const marketClosed = live.marketClosed;

  // 실시간 데이터가 있으면 사용, 없으면 REST 데이터
  const asks = live.asks.length > 0 ? live.asks : initialData?.asks || [];
  const bids = live.bids.length > 0 ? live.bids : initialData?.bids || [];
  const totalAskQty = live.total_ask_qty || initialData?.total_ask_qty || 0;
  const totalBidQty = live.total_bid_qty || initialData?.total_bid_qty || 0;

  // SR: WebSocket 실시간 우선, 없으면 REST 데이터로 계산
  const restSR = useMemo(() => {
    const restAsks = initialData?.asks || [];
    const restBids = initialData?.bids || [];
    const all = [...restAsks, ...restBids];
    if (all.length === 0) return [];
    const avg = all.reduce((s, e) => s + e.quantity, 0) / all.length;
    const threshold = avg * 3;
    return all
      .filter((e) => e.quantity >= threshold && e.price > 0)
      .map((e) => ({
        price: e.price,
        quantity: e.quantity,
        type: restAsks.some((a) => a.price === e.price) ? "resistance" : "support",
        ratio: (e.quantity / avg).toFixed(1),
      }));
  }, [initialData]);

  const supportResistance = live.supportResistance?.length > 0 ? live.supportResistance : restSR;

  if (asks.length === 0 && bids.length === 0) {
    return (
      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        {marketClosed ? (
          <>
            <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "var(--color-text-secondary)" }}>장 마감</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>실시간 호가는 평일 08:30 ~ 15:40에 제공됩니다</p>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)" }}>호가 데이터를 불러오는 중...</p>
        )}
      </div>
    );
  }

  // 전체 잔량 중 최대값 (바 너비 계산용)
  const allEntries = [...asks, ...bids];
  const maxQty = Math.max(...allEntries.map((e) => e.quantity), 1);
  const avgQty = allEntries.reduce((s, e) => s + e.quantity, 0) / (allEntries.length || 1);
  const threshold = avgQty * 3;

  // 총잔량 비율
  const totalQty = totalAskQty + totalBidQty;
  const bidRatio = totalQty > 0 ? (totalBidQty / totalQty) * 100 : 50;

  return (
    <div style={{ fontSize: 12 }}>
      {/* 매도/매수 비율 바 */}
      <div style={{ padding: "10px 16px", borderBottom: B }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#5b8def", fontSize: 11, fontWeight: 600 }}>
            매도 {totalAskQty.toLocaleString()}
          </span>
          <span style={{ color: "#ef5b5b", fontSize: 11, fontWeight: 600 }}>
            매수 {totalBidQty.toLocaleString()}
          </span>
        </div>
        <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--color-background-secondary)" }}>
          <div style={{ width: `${100 - bidRatio}%`, background: "#5b8def", transition: "width 0.3s" }} />
          <div style={{ width: `${bidRatio}%`, background: "#ef5b5b", transition: "width 0.3s" }} />
        </div>
      </div>

      {/* 호가 헤더 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", padding: "6px 16px", borderBottom: B, color: "var(--color-text-tertiary)", fontSize: 10, fontWeight: 600 }}>
        <span>잔량</span>
        <span style={{ textAlign: "center" }}>호가</span>
        <span style={{ textAlign: "right" }}>잔량</span>
      </div>

      {/* 매도호가 (위에서 아래로: 높은 가격 → 낮은 가격) */}
      {asks.map((ask, i) => {
        const isHeavy = ask.quantity >= threshold;
        const srLevel = supportResistance.find((sr) => sr.price === ask.price);
        return (
          <div
            key={`ask-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 1fr",
              padding: "5px 16px",
              borderBottom: `1px solid var(--color-background-secondary)`,
              background: isHeavy ? "rgba(91, 141, 239, 0.08)" : "transparent",
              position: "relative",
            }}
          >
            {/* 매도 잔량 바 (오→왼) */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <div
                style={{
                  position: "absolute", right: 0, top: 0, bottom: 0,
                  width: `${(ask.quantity / maxQty) * 100}%`,
                  background: "rgba(91, 141, 239, 0.15)",
                  borderRadius: "2px 0 0 2px",
                }}
              />
              <span style={{ position: "relative", color: "#5b8def", fontWeight: isHeavy ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
                {ask.quantity.toLocaleString()}
              </span>
            </div>

            {/* 호가 */}
            <span style={{
              textAlign: "center",
              color: "#5b8def",
              fontWeight: isHeavy ? 700 : 500,
              fontVariantNumeric: "tabular-nums",
            }}>
              {ask.price.toLocaleString()}
            </span>

            {/* 빈칸 + 저항선 표시 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              {srLevel && (
                <button
                  onClick={() => onSaveSupportResistance?.({
                    price: ask.price,
                    quantity: ask.quantity,
                    type: "resistance",
                    ratio: srLevel.ratio,
                  })}
                  style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 10,
                    background: "rgba(91, 141, 239, 0.15)", color: "#5b8def",
                    border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  저항 {srLevel.ratio}x
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* 매수호가 (위에서 아래로: 높은 가격 → 낮은 가격) */}
      {bids.map((bid, i) => {
        const isHeavy = bid.quantity >= threshold;
        const srLevel = supportResistance.find((sr) => sr.price === bid.price);
        return (
          <div
            key={`bid-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 1fr",
              padding: "5px 16px",
              borderBottom: `1px solid var(--color-background-secondary)`,
              background: isHeavy ? "rgba(239, 91, 91, 0.08)" : "transparent",
              position: "relative",
            }}
          >
            {/* 빈칸 + 지지선 표시 */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {srLevel && (
                <button
                  onClick={() => onSaveSupportResistance?.({
                    price: bid.price,
                    quantity: bid.quantity,
                    type: "support",
                    ratio: srLevel.ratio,
                  })}
                  style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: 10,
                    background: "rgba(239, 91, 91, 0.15)", color: "#ef5b5b",
                    border: "none", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >
                  지지 {srLevel.ratio}x
                </button>
              )}
            </div>

            {/* 호가 */}
            <span style={{
              textAlign: "center",
              color: "#ef5b5b",
              fontWeight: isHeavy ? 700 : 500,
              fontVariantNumeric: "tabular-nums",
            }}>
              {bid.price.toLocaleString()}
            </span>

            {/* 매수 잔량 바 (왼→오) */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              <div
                style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${(bid.quantity / maxQty) * 100}%`,
                  background: "rgba(239, 91, 91, 0.15)",
                  borderRadius: "0 2px 2px 0",
                }}
              />
              <span style={{ position: "relative", color: "#ef5b5b", fontWeight: isHeavy ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>
                {bid.quantity.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}

    </div>
  );
}
