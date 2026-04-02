const API_URL = import.meta.env.VITE_API_URL || "";

const DEFAULT_QUERIES = ["코스피"];
const STORAGE_KEY = "news_keywords";

export const loadKeywords = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_QUERIES;
  } catch {
    return DEFAULT_QUERIES;
  }
};

export const saveKeywords = (keywords) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keywords));
};

export const getNews = (keywords) => {
  const qs = (keywords || DEFAULT_QUERIES).join(",");
  return fetch(`${API_URL}/api/news?queries=${encodeURIComponent(qs)}`).then((r) => r.json());
};
