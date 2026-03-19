import { useEffect, useState } from "react";

export default function SplashScreen({ onComplete }) {
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setHiding(true), 1400);
    const t2 = setTimeout(() => onComplete(), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "linear-gradient(160deg, #eef8f4 0%, #f2f0f9 50%, #fdf1ef 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      opacity: hiding ? 0 : 1,
      transition: "opacity 0.5s ease",
      pointerEvents: hiding ? "none" : "all",
    }}>
      <div style={{ animation: "splashIn 0.4s ease forwards", textAlign: "center" }}>
        <img
          src="/logo.png"
          alt="오늘 날이가"
          style={{
            width: 72, height: 72,
            borderRadius: 18,
            display: "block", margin: "0 auto 16px",
          }}
        />
        <h1 style={{
          margin: 0, fontSize: 24, fontWeight: 800,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.5px",
        }}>
          오늘 날이가
        </h1>
        <p style={{
          margin: "6px 0 0", fontSize: 12,
          color: "var(--color-text-tertiary)",
          fontWeight: 400,
        }}>
          오늘 하루도 건승하세요!
        </p>
      </div>
    </div>
  );
}
