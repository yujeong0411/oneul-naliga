import { useEffect, useRef, useState } from "react";

export default function SplashScreen({ onComplete, ready }) {
  const [hiding, setHiding] = useState(false);
  const minShown = useRef(false);

  // 최소 800ms 후 && auth ready 되면 페이드아웃, 최대 3초 안전망
  useEffect(() => {
    const t1 = setTimeout(() => {
      minShown.current = true;
      if (ready) setHiding(true);
    }, 800);
    const t2 = setTimeout(() => setHiding(true), 3000); // 안전망
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (ready && minShown.current) setHiding(true);
  }, [ready]);

  useEffect(() => {
    if (!hiding) return;
    const t = setTimeout(() => onComplete(), 500);
    return () => clearTimeout(t);
  }, [hiding, onComplete]);

  return (
    <div className="splash-bg" style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      opacity: hiding ? 0 : 1,
      transition: "opacity 0.5s ease",
      pointerEvents: hiding ? "none" : "all",
    }}>
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center",
        animation: "splashIn 0.4s ease forwards",
        textAlign: "center",
        marginBottom: "15vh",
      }}>
        <img
          src="/logo.png"
          alt="로고"
          style={{ width: 72, height: 72, marginBottom: 20, borderRadius: 18 }}
        />
        <h1 style={{
          margin: 0, fontSize: 26, fontWeight: 800,
          color: "#111827",
          letterSpacing: "-0.5px",
        }}>
          오늘 날이가
        </h1>
        <p style={{
          margin: "10px 0 0", fontSize: 16,
          color: "#6b7280",
          fontWeight: 400,
        }}>
          오늘 하루도 건승하세요!
        </p>
      </div>
    </div>
  );
}
