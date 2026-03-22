import { useEffect, useRef, useState } from "react";

const MIN_MS = 2000;

export default function SplashScreen({ onComplete, ready }) {
  const [hiding, setHiding] = useState(false);
  const [progress, setProgress] = useState(0);
  const minShown = useRef(false);
  const startRef = useRef(Date.now());
  const rafRef = useRef(null);

  // 로딩바 애니메이션 (0 → 100 over MIN_MS, 이후 멈춤)
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / MIN_MS) * 100, 100);
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // 최소 2초 후 && auth ready → 페이드아웃, 최대 5초 안전망
  useEffect(() => {
    const t1 = setTimeout(() => {
      minShown.current = true;
      if (ready) setHiding(true);
    }, MIN_MS);
    const t2 = setTimeout(() => setHiding(true), 5000);
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
        marginBottom: "8vh",
      }}>
        <img
          src="/logo.png"
          alt="로고"
          style={{ width: 72, height: 72, marginBottom: 20, borderRadius: 18 }}
        />
        <h1 style={{
          margin: 0, fontSize: 26, fontWeight: 800,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.5px",
        }}>
          오늘 날이가
        </h1>
        <p style={{
          margin: "10px 0 0", fontSize: 16,
          color: "var(--color-text-secondary)",
          fontWeight: 400,
        }}>
          오늘 하루도 건승하세요!
        </p>

        {/* 로딩바 */}
        <div style={{
          marginTop: 32, width: 160, height: 3,
          borderRadius: 99, background: "var(--color-border-primary)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 99,
            background: "linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)",
            width: `${progress}%`,
            transition: "width 0.05s linear",
          }} />
        </div>
      </div>
    </div>
  );
}
