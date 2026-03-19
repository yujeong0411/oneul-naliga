import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";

export function useAlertCount() {
  const [count, setCount] = useState(0);

  const refresh = () => {
    fetch(`${API_URL}/api/alerts/?limit=200`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        // 최근 24시간 알림 개수
        const since = Date.now() - 24 * 60 * 60 * 1000;
        const recent = data.filter((a) => new Date(a.created_at).getTime() > since);
        setCount(recent.length);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000); // 1분마다 갱신
    return () => clearInterval(interval);
  }, []);

  return count;
}
