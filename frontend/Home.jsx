import { useState } from "react";
import { useNavigate } from "react-router-dom";

const mockStocks = [
  {
    id: 1,
    name: "삼성전자",
    code: "005930",
    market: "국내",
    price: 72400,
    change: 1.26,
    lineCount: 2,
    distanceToBound: { type: "저항선", value: 1.8 },
  },
  {
    id: 2,
    name: "카카오",
    code: "035720",
    market: "국내",
    price: 38150,
    change: -0.78,
    lineCount: 1,
    distanceToBound: { type: "지지선", value: -0.4 },
  },
  {
    id: 3,
    name: "NAVER",
    code: "035420",
    market: "국내",
    price: 189500,
    change: 0.53,
    lineCount: 3,
    distanceToBound: { type: "저항선", value: 3.2 },
  },
  {
    id: 4,
    name: "Apple",
    code: "AAPL",
    market: "해외",
    price: 224.5,
    change: -0.43,
    lineCount: 2,
    distanceToBound: { type: "지지선", value: -0.9 },
  },
];

const mockAlerts = [
  {
    id: 1,
    stock: "카카오",
    msg: "지지선 근접",
    distance: "-0.4%",
    type: "loss",
    time: "오늘 14:32",
  },
  {
    id: 2,
    stock: "삼성전자",
    msg: "저항선 돌파",
    distance: null,
    type: "attack",
    time: "오늘 09:17",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = mockStocks.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-amber-400 font-bold tracking-widest text-sm">
            오늘날이가
          </span>
          <div className="flex gap-6 text-xs text-gray-400">
            <span className="text-amber-400 border-b border-amber-400 pb-0.5">홈</span>
            <span className="hover:text-gray-200 cursor-pointer transition-colors">차트</span>
            <span className="hover:text-gray-200 cursor-pointer transition-colors">알림</span>
            <span className="hover:text-gray-200 cursor-pointer transition-colors">설정</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: "감시 중인 종목", value: mockStocks.length, color: "text-gray-100" },
            { label: "설정된 선", value: mockStocks.reduce((a, s) => a + s.lineCount, 0), color: "text-gray-100" },
            { label: "오늘 알림", value: mockAlerts.length, color: "text-amber-400" },
          ].map((card) => (
            <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2">{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            placeholder="종목명 또는 코드 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
          <button className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold rounded-lg transition-colors">
            + 추가
          </button>
        </div>

        {/* Watchlist */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 tracking-widest uppercase">관심 종목</span>
            <span className="text-xs text-gray-600">{filtered.length}개</span>
          </div>
          {filtered.map((stock, i) => (
            <div
              key={stock.id}
              onClick={() => navigate(`/chart/${stock.code}`)}
              className={`flex items-center px-4 py-4 cursor-pointer hover:bg-gray-800/50 transition-colors ${
                i < filtered.length - 1 ? "border-b border-gray-800/50" : ""
              }`}
            >
              {/* Market badge + name */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      stock.market === "국내"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-purple-500/20 text-purple-400"
                    }`}
                  >
                    {stock.market}
                  </span>
                  <span className="text-sm font-bold text-gray-100">{stock.name}</span>
                  <span className="text-xs text-gray-600">{stock.code}</span>
                </div>
                <span className="text-xs text-gray-600">선 {stock.lineCount}개 설정됨</span>
              </div>

              {/* Price */}
              <div className="text-right mr-6">
                <p className="text-sm font-bold text-gray-100">
                  {stock.market === "해외" ? `$${stock.price}` : `${stock.price.toLocaleString()}원`}
                </p>
                <p className={`text-xs font-bold ${stock.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {stock.change >= 0 ? "+" : ""}{stock.change}%
                </p>
              </div>

              {/* Distance to line */}
              <div className="text-right min-w-[80px]">
                <p className="text-[10px] text-gray-600">{stock.distanceToBound.type}까지</p>
                <p
                  className={`text-sm font-bold ${
                    Math.abs(stock.distanceToBound.value) < 1
                      ? "text-red-400"
                      : stock.distanceToBound.value < 0
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {stock.distanceToBound.value > 0 ? "+" : ""}{stock.distanceToBound.value}%
                </p>
              </div>

              <span className="ml-4 text-gray-700">›</span>
            </div>
          ))}
        </div>

        {/* Recent alerts */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 tracking-widest uppercase">최근 알림</span>
            <span className="text-xs text-amber-500 cursor-pointer hover:text-amber-400">전체 보기</span>
          </div>
          {mockAlerts.map((alert, i) => (
            <div
              key={alert.id}
              className={`flex items-center px-4 py-3.5 gap-3 ${
                i < mockAlerts.length - 1 ? "border-b border-gray-800/50" : ""
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  alert.type === "loss" ? "bg-red-500" : "bg-emerald-500"
                }`}
              />
              <div className="flex-1">
                <p className="text-sm text-gray-200">
                  {alert.stock} — {alert.msg}
                  {alert.distance && (
                    <span className={`ml-1 text-xs ${alert.type === "loss" ? "text-red-400" : "text-emerald-400"}`}>
                      ({alert.distance})
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">{alert.time}</p>
              </div>
              <span
                className={`text-[10px] px-2 py-1 rounded font-bold ${
                  alert.type === "loss"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-emerald-500/20 text-emerald-400"
                }`}
              >
                {alert.type === "loss" ? "로스 지점" : "공격 지점"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
