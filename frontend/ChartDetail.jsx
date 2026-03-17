import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AddLineModal from "../components/AddLineModal";

const mockLines = [
  {
    id: 1,
    name: "저항 추세선",
    type: "trend",
    signalType: "loss",
    color: "#ef4444",
    targetPrice: 74800,
    distance: 3.3,
    points: "고점① 1/13 → 고점② 1/24",
  },
  {
    id: 2,
    name: "수평 지지선",
    type: "horizontal",
    signalType: "attack",
    color: "#3b82f6",
    targetPrice: 70000,
    distance: -3.3,
    points: null,
  },
];

const TIMEFRAMES = ["일봉", "주봉", "월봉", "60분", "30분"];

export default function ChartDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState("일봉");
  const [drawMode, setDrawMode] = useState(false);
  const [lines, setLines] = useState(mockLines);
  const [showModal, setShowModal] = useState(false);
  const [sensitivity, setSensitivity] = useState(2);
  const [alertOn, setAlertOn] = useState(true);

  const stockName = code === "005930" ? "삼성전자" : code;
  const currentPrice = 72400;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="text-xs text-gray-500 hover:text-amber-400 transition-colors"
            >
              ← 홈
            </button>
            <span className="text-gray-700">|</span>
            <span className="text-sm font-bold text-gray-100">{stockName}</span>
            <span className="text-xs text-gray-600">{code}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-gray-100">
              {currentPrice.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-emerald-400">+900 (+1.26%)</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-[1fr_260px] gap-5">
          {/* Left: Chart */}
          <div>
            {/* Timeframe tabs */}
            <div className="flex gap-1.5 mb-3">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    timeframe === tf
                      ? "bg-amber-500 text-gray-950 font-bold"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Chart area */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              {/* Mode toggle */}
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs text-gray-600">
                  {drawMode ? "차트에서 고점을 클릭하세요 (첫 번째 점)..." : "클릭으로 고점/저점 선택 → 선 생성"}
                </span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setDrawMode(false)}
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      !drawMode ? "bg-amber-500 text-gray-950 font-bold" : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    보기
                  </button>
                  <button
                    onClick={() => setDrawMode(true)}
                    className={`text-xs px-3 py-1 rounded transition-colors ${
                      drawMode ? "bg-amber-500 text-gray-950 font-bold" : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    선 긋기
                  </button>
                </div>
              </div>

              {/* SVG Chart */}
              <svg
                viewBox="0 0 580 280"
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-auto block"
                style={{ cursor: drawMode ? "crosshair" : "default" }}
              >
                {/* Grid */}
                {[25, 75, 125, 175, 225].map((y) => (
                  <line key={y} x1="55" y1={y} x2="575" y2={y} stroke="#1f2937" strokeWidth="0.5" strokeDasharray="3,3" />
                ))}

                {/* Y labels */}
                {[["76,000", 30], ["74,000", 80], ["72,000", 130], ["70,000", 180], ["68,000", 230]].map(([label, y]) => (
                  <text key={y} x="8" y={y} fontSize="9" fill="#4b5563">{label}</text>
                ))}

                {/* Candles */}
                {[
                  [65,185,155,168,17,true],[85,178,148,158,20,true],[105,165,140,148,17,true],
                  [125,148,172,150,15,false],[145,155,130,138,17,true],[165,112,80,90,22,true],
                  [185,102,125,105,15,false],[205,118,142,120,18,false],[225,132,108,115,17,true],
                  [245,118,138,120,15,false],[265,125,100,108,17,true],[285,88,60,68,20,true],
                  [305,78,102,80,18,false],[325,95,118,98,16,false],[345,110,88,95,15,true],
                  [365,100,122,103,15,false],[385,112,90,98,14,true],[405,105,82,88,17,true],
                  [425,90,112,92,17,false],[445,105,82,88,17,true],[465,92,115,95,15,false],
                  [485,118,95,102,16,true],
                ].map(([x, wickTop, wickBot, rectY, rectH, up]) => (
                  <g key={x}>
                    <line x1={x} y1={wickTop} x2={x} y2={wickBot} stroke={up ? "#10b981" : "#ef4444"} strokeWidth="1" />
                    <rect x={x-4} y={rectY} width="8" height={rectH} fill={up ? "#10b981" : "#ef4444"} rx="1" />
                  </g>
                ))}

                {/* Resistance trend line */}
                <line x1="165" y1="86" x2="520" y2="55" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5,3" />
                <circle cx="165" cy="86" r="4" fill="#ef4444" opacity="0.9" />
                <circle cx="285" cy="64" r="4" fill="#ef4444" opacity="0.9" />
                <text x="155" y="78" fontSize="8" fill="#ef4444">고점①</text>
                <text x="275" y="57" fontSize="8" fill="#ef4444">고점②</text>
                <rect x="425" y="44" width="92" height="15" rx="3" fill="#1f2937" />
                <text x="471" y="55" fontSize="8" fill="#ef4444" textAnchor="middle">저항선 ≈74,800</text>

                {/* Support horizontal line */}
                <line x1="55" y1="175" x2="575" y2="175" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="5,3" />
                <rect x="425" y="163" width="92" height="15" rx="3" fill="#1f2937" />
                <text x="471" y="173" fontSize="8" fill="#3b82f6" textAnchor="middle">지지선 = 70,000</text>

                {/* Current price */}
                <line x1="55" y1="118" x2="490" y2="118" stroke="#6b7280" strokeWidth="0.8" strokeDasharray="2,2" />
                <rect x="490" y="110" width="62" height="15" rx="3" fill="#374151" />
                <text x="521" y="121" fontSize="8" fill="#d1d5db" textAnchor="middle">현재 72,400</text>

                {/* X labels */}
                {[[65,"1/6"],[165,"1/13"],[285,"1/24"],[385,"2/3"],[485,"2/14"]].map(([x, label]) => (
                  <text key={x} x={x} y="265" fontSize="8" fill="#4b5563" textAnchor="middle">{label}</text>
                ))}
              </svg>

              {/* Legend */}
              <div className="flex gap-5 mt-3 pt-3 border-t border-gray-800">
                {lines.map((line) => (
                  <div key={line.id} className="flex items-center gap-2">
                    <svg width="20" height="4">
                      <line x1="0" y1="2" x2="20" y2="2" stroke={line.color} strokeWidth="1.5" strokeDasharray="4,2" />
                    </svg>
                    <span className="text-[10px] text-gray-500">{line.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Panel */}
          <div className="flex flex-col gap-4">
            {/* Lines list */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-400 tracking-widest uppercase">내 선</span>
                <button
                  onClick={() => setShowModal(true)}
                  className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
                >
                  + 추가
                </button>
              </div>
              {lines.map((line, i) => (
                <div
                  key={line.id}
                  className={`p-4 ${i < lines.length - 1 ? "border-b border-gray-800/50" : ""}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-0.5" style={{ background: line.color }} />
                      <span className="text-xs font-bold text-gray-200">{line.name}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        line.signalType === "loss"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {line.signalType === "loss" ? "로스" : "공격"}
                    </span>
                  </div>
                  {line.points && (
                    <p className="text-[10px] text-gray-600 mb-1">{line.points}</p>
                  )}
                  <p className="text-[10px] text-gray-500">
                    선 가격:{" "}
                    <span style={{ color: line.color }} className="font-bold">
                      {line.targetPrice.toLocaleString()}
                    </span>
                  </p>
                  <p className="text-[10px] text-gray-500">
                    거리:{" "}
                    <span
                      className={`font-bold ${line.distance > 0 ? "text-red-400" : "text-emerald-400"}`}
                    >
                      {line.distance > 0 ? "+" : ""}{line.distance}%
                    </span>
                  </p>
                </div>
              ))}
            </div>

            {/* Alert settings */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <p className="text-xs font-bold text-gray-400 tracking-widest uppercase mb-4">알림 설정</p>
              <div className="mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-gray-500">민감도</span>
                  <span className="text-xs font-bold text-amber-400">
                    ±{[0.3, 0.5, 0.7, 1.0, 1.5][sensitivity - 1]}%
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-700">정밀</span>
                  <span className="text-[10px] text-gray-700">여유</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-gray-800">
                <span className="text-xs text-gray-500">텔레그램 알림</span>
                <button
                  onClick={() => setAlertOn(!alertOn)}
                  className={`w-10 h-5 rounded-full relative transition-colors ${
                    alertOn ? "bg-amber-500" : "bg-gray-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${
                      alertOn ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Draw button */}
            <button
              onClick={() => setShowModal(true)}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold rounded-lg transition-colors tracking-widest uppercase"
            >
              차트에서 선 긋기 시작
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <AddLineModal onClose={() => setShowModal(false)} onSave={(line) => {
          setLines([...lines, { ...line, id: Date.now() }]);
          setShowModal(false);
        }} />
      )}
    </div>
  );
}
