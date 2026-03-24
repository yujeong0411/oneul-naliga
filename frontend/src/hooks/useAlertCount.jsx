import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "";

const AlertCountContext = createContext({ count: 0, refresh: () => {} });

export function AlertCountProvider({ children }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    const params = new URLSearchParams({ limit: 200 });
    if (user?.id) params.set("user_id", user.id);
    fetch(`${API_URL}/api/alerts/?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const since = Date.now() - 24 * 60 * 60 * 1000;
        const recent = data.filter((a) => new Date(a.created_at).getTime() > since);
        setCount(recent.length);
      })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <AlertCountContext.Provider value={{ count, refresh }}>
      {children}
    </AlertCountContext.Provider>
  );
}

export function useAlertCount() {
  const { count } = useContext(AlertCountContext);
  return count;
}

export function useAlertRefresh() {
  const { refresh } = useContext(AlertCountContext);
  return refresh;
}
