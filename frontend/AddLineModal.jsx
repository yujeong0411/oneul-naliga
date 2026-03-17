import { useState } from "react";

export default function AddLineModal({ onClose, onSave }) {
  const [tab, setTab] = useState("trend"); // 'trend' | 'horizontal'
  const [lineName, setLineName] = useState("");
  const [signalType, setSignalType] = useState("loss");
  const [price, setPrice] = useState("");

  // trend tab: simulate point 1 already selected
  const point1 = { date: "2026.01.13", price: "76,200" };
  const [point2Selected, setPoint2Selected] = useState(false);

  const handleSave = () => {
    const line = {
      name: lineName || (tab === "trend" ? "추세선" : "수평선"),
      type: tab,
      signalType,
      color: signalType === "loss" ? "#ef4444" : "#10b981",
      targetPrice: tab === "horizontal" ? Number(price) : 74800,
      distance: 0,
      points: tab === "trend" ? `고점① ${point1.date}` : null,
    };
    onSave(line);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <span className="text-sm font-bold text-gray-100">선 추가</span>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {/* Tabs */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 mb-5">
            <button
              onClick={() => setTab("trend")}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                tab === "trend"
                  ? "bg-amber-500 text-gray-950"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200"
              }`}
            >
              추세선 (두 점 클릭)
            </button>
            <button
              onClick={() => setTab("horizontal")}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
                tab === "horizontal"
                  ? "bg-amber-500 text-gray-950"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200"
              }`}
            >
              수평선 (가격 입력)
            </button>
          </div>

          {/* Trend tab */}
          {tab === "trend" && (
            <div>
              <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
                <p className="text-xs text-gray-500 mb-3">차트에서 두 점을 순서대로 클릭하세요.</p>
                <div className="flex flex-col gap-2">
                  {/* Point 1 - selected */}
                  <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-[10px] font-bold text-amber-400">
                        1
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-200">고점 ①</p>
                        <p className="text-[10px] text-gray-500">
                          {point1.date} | {point1.price}원
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-bold">
                      선택됨
                    </span>
                  </div>

                  <div className="text-center text-gray-700 text-xs">↓</div>

                  {/* Point 2 - waiting or selected */}
                  <button
                    onClick={() => setPoint2Selected(!point2Selected)}
                    className={`w-full rounded-lg p-3 flex items-center gap-3 transition-colors ${
                      point2Selected
                        ? "bg-gray-800 border border-gray-700"
                        : "border-2 border-dashed border-gray-700 hover:border-amber-500/50"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-400">
                      2
                    </div>
                    {point2Selected ? (
                      <div className="text-left">
                        <p className="text-xs font-bold text-gray-200">고점 ②</p>
                        <p className="text-[10px] text-gray-500">2026.01.24 | 78,900원</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">차트에서 두 번째 고점을 클릭하세요</p>
                    )}
                    {point2Selected && (
                      <span className="ml-auto text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded font-bold">
                        선택됨
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Horizontal tab */}
          {tab === "horizontal" && (
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-2">
                지지/저항 가격 (원)
              </label>
              <input
                type="number"
                placeholder="예: 70000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm font-bold text-gray-100 placeholder-gray-700 focus:outline-none focus:border-amber-500 transition-colors mb-4"
              />
            </div>
          )}

          {/* Line name */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-2">선 이름</label>
            <input
              type="text"
              placeholder={tab === "trend" ? "예: 1월 고점 저항선" : "예: 1월 저점 지지선"}
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-700 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Signal type */}
          <div className="mb-6">
            <label className="block text-xs text-gray-500 mb-2">신호 종류</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSignalType("loss")}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors ${
                  signalType === "loss"
                    ? "bg-red-500/20 border-red-500 text-red-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                로스 지점
              </button>
              <button
                onClick={() => setSignalType("attack")}
                className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors ${
                  signalType === "attack"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                공격 지점
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-bold rounded-lg transition-colors"
            >
              선 저장하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
