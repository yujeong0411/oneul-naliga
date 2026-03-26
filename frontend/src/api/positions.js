const API_URL = import.meta.env.VITE_API_URL || "";
const BASE = `${API_URL}/api`;

export const getPositions = (stockCode, userId) => {
  const params = new URLSearchParams();
  if (stockCode) params.set("stock_code", stockCode);
  if (userId) params.set("user_id", userId);
  return fetch(`${BASE}/positions/?${params}`).then((r) => r.json());
};

export const createPosition = (body) =>
  fetch(`${BASE}/positions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const updatePosition = (id, body) =>
  fetch(`${BASE}/positions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const deletePosition = (id) =>
  fetch(`${BASE}/positions/${id}`, { method: "DELETE" }).then((r) => r.json());
