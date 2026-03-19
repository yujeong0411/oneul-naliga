const API_URL = import.meta.env.VITE_API_URL || "";
const BASE = `${API_URL}/api`;

export const getAlerts = (stockCode, limit = 50) => {
  const params = new URLSearchParams({ limit });
  if (stockCode) params.set("stock_code", stockCode);
  return fetch(`${BASE}/alerts/?${params}`).then((r) => r.json());
};

export const deleteAlert = (id) =>
  fetch(`${BASE}/alerts/${id}`, { method: "DELETE" }).then((r) => r.json());
