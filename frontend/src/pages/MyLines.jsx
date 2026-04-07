import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAllLines } from "../api/lines";
import { getPrice } from "../api/stocks";
import { useAuth } from "../context/AuthContext";
import { useStockNames } from "../hooks/useStockNames";

const B = "1px solid var(--color-border-tertiary)";

export default function MyLines() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lines, setLines] = useState([]);
  const [stockCodes, setStockCodes] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);

  const { nameMap, exchangeMap } = useStockNames(user?.id, stockCodes);

  useEffect(() => {
    if (!user) return;
    getAllLines(user.id)
      .then((l) => {
        const arr = Array.isArray(l) ? l : [];
        setLines(arr);
        const codes = [...new Set(arr.map((x) => x.stock_code))];
        setStockCodes(codes);
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [user]);

  // 종목별 현재가 로드
  useEffect(() => {
    if (stockCodes.length === 0) return;
    stockCodes.forEach((code) => {
      const isDomestic = /^\d{6}$/.test(code);
      const market = isDomestic ? "KOSPI" : "US";
      const exchange = isDomestic ? undefined : (exchangeMap[code] || "NAS");
      getPrice(market, code, exchange)
        .then((res) => setPrices((prev) => ({ ...prev, [code]: res })))
        .catch(() => {});
    });
  }, [stockCodes, exchangeMap]);

  // 종목별 그룹핑 (최근 선 기준 내림차순)
  const grouped = {};
  lines.forEach((l) => {
    if (!grouped[l.stock_code]) grouped[l.stock_code] = [];
    grouped[l.stock_code].push(l);
  });
  // 각 그룹 내 선을 created_at 내림차순 정렬
  Object.values(grouped).forEach((arr) =>
    arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  );
  // 그룹 순서: 가장 최근 선 기준 내림차순
  const sortedCodes = Object.keys(grouped).sort(
    (a, b) => new Date(grouped[b][0].created_at) - new Date(grouped[a][0].created_at)
  );

  const priceFmt = (code, value) => {
    const isDomestic = /^\d{6}$/.test(code);
    if (value == null) return "—";
    return isDomestic
      ? Number(value).toLocaleString() + "원"
      : "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const distancePct = (currentPrice, linePrice) => {
    if (!currentPrice || !linePrice) return null;
    return ((currentPrice - linePrice) / linePrice) * 100;
  };

  return (
    <div style={{ paddingBottom: 80, maxWidth: 480, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "var(--color-text-primary)", fontSize: 20 }}
          >
            ←
          </button>
          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--color-text-primary)" }}>내 선 목록</span>
        </div>
        {lines.length > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-tertiary)" }}>{lines.length}개</span>
        )}
      </div>

      {/* 본문 */}
      {loading ? (
        <p style={{ padding: "60px 20px", textAlign: "center", fontSize: 13, color: "var(--color-text-tertiary)" }}>불러오는 중...</p>
      ) : lines.length === 0 ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <p style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "var(--color-text-secondary)" }}>
            아직 그어놓은 선이 없어요
          </p>
          <button
            onClick={() => navigate("/")}
            style={{
              padding: "10px 24px", fontSize: 13, fontWeight: 600, borderRadius: 10,
              border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer",
            }}
          >
            차트에서 선 그어보기
          </button>
        </div>
      ) : (
        <div style={{ padding: "0 20px" }}>
          {sortedCodes.map((code) => {
            const isDomestic = /^\d{6}$/.test(code);
            const stockName = nameMap[code] || code;
            const exchange = exchangeMap[code];
            const priceData = prices[code];
            const currentPrice = priceData?.price ?? null;
            const changePct = priceData?.change_pct != null ? parseFloat(priceData.change_pct) : null;
            const navState = { name: stockName, market: isDomestic ? "KOSPI" : "US", exchange };

            return (
              <div key={code} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    background: "var(--color-background-primary)",
                    borderRadius: 14,
                    overflow: "hidden",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  {/* 종목 헤더 */}
                  <div
                    onClick={() => navigate(`/chart/${code}`, { state: navState })}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 16px", cursor: "pointer", borderBottom: B,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
                        {stockName}
                      </span>
                      <span style={{
                        padding: "2px 5px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                        background: isDomestic ? "var(--color-background-success)" : "var(--color-background-info)",
                        color: isDomestic ? "var(--color-text-success)" : "var(--color-text-info)",
                      }}>
                        {isDomestic ? "KR" : "US"}
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {priceFmt(code, currentPrice)}
                      </span>
                      {changePct !== null && (
                        <span style={{
                          marginLeft: 6, fontSize: 11, fontWeight: 600,
                          color: changePct >= 0 ? "var(--color-rise)" : "var(--color-fall)",
                        }}>
                          {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 선 목록 */}
                  {grouped[code].map((line, i) => {
                    const isHorizontal = line.line_type === "horizontal";
                    const dist = isHorizontal ? distancePct(currentPrice, line.price) : null;

                    return (
                      <div
                        key={line.id}
                        onClick={() => navigate(`/chart/${code}`, { state: navState })}
                        className="row-hover"
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "12px 16px", cursor: "pointer",
                          borderBottom: i < grouped[code].length - 1 ? B : "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 14, color: "var(--color-text-tertiary)", fontWeight: 600, flexShrink: 0 }}>
                            {isHorizontal ? "━" : "╱"}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {line.name || (isHorizontal ? "수평선" : "추세선")}
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                              {isHorizontal ? priceFmt(code, line.price) : "추세선"}
                            </p>
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          {isHorizontal && dist !== null ? (
                            <span style={{
                              fontSize: 12, fontWeight: 600,
                              color: dist >= 0 ? "var(--color-rise)" : "var(--color-fall)",
                            }}>
                              {dist >= 0 ? "+" : ""}{dist.toFixed(2)}%
                            </span>
                          ) : isHorizontal ? (
                            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>—</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
