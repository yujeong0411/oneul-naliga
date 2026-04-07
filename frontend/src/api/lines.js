const API_URL = import.meta.env.VITE_API_URL || "";
const BASE = `${API_URL}/api`;

export const getLines = (stockCode, userId) => {
  const params = userId ? `?user_id=${userId}` : "";
  return fetch(`${BASE}/lines/${stockCode}${params}`).then((r) => r.json());
};

export const getAllLines = (userId) =>
  fetch(`${BASE}/lines/?user_id=${userId}`).then((r) => r.json());

export const createLine = (body) =>
  fetch(`${BASE}/lines/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const updateLine = (id, body) =>
  fetch(`${BASE}/lines/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const deleteLine = (id) =>
  fetch(`${BASE}/lines/${id}`, { method: "DELETE" }).then((r) => r.json());

export const getLineStats = (id) =>
  fetch(`${BASE}/lines/${id}/stats`).then((r) => r.json());
