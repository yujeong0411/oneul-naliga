import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotification(userId) {
  const [permission, setPermission] = useState(Notification.permission);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // 현재 구독 상태 확인
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => setSubscribed(!!sub))
    );
  }, []);

  const subscribe = async () => {
    setLoading(true);
    try {
      // 알림 권한 요청
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      // VAPID 공개키 가져오기
      const vapidRes = await fetch(`${API_URL}/api/alerts/push/vapid-public-key`);
      if (!vapidRes.ok) throw new Error(`VAPID 키 조회 실패 (${vapidRes.status})`);
      const { public_key } = await vapidRes.json();
      if (!public_key) throw new Error("VAPID 공개키 없음");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });

      const { endpoint, keys } = sub.toJSON();
      await fetch(`${API_URL}/api/alerts/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth, user_id: userId }),
      });

      setSubscribed(true);
    } catch (e) {
      console.error("[push] 구독 실패:", e);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API_URL}/api/alerts/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      console.error("[push] 구독 해제 실패:", e);
    } finally {
      setLoading(false);
    }
  };

  const testPush = () =>
    fetch(`${API_URL}/api/alerts/push/test?user_id=${userId || ""}`, { method: "POST" });

  const supported = "serviceWorker" in navigator && "PushManager" in window;

  return { supported, permission, subscribed, loading, subscribe, unsubscribe, testPush };
}
