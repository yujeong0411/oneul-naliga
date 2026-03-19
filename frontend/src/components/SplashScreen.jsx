import { useEffect, useState } from "react";

export default function SplashScreen({ onComplete }) {
  const [hiding, setHiding] = useState(false);
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const t1 = setTimeout(() => setHiding(true), 1400);
    const t2 = setTimeout(() => onComplete(), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div className="splash-bg" style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", flexDirection: "column",
      alignItems: "center",
      opacity: hiding ? 0 : 1,
      transition: "opacity 0.5s ease",
      pointerEvents: hiding ? "none" : "all",
    }}>
      {/* 상단: 텍스트 영역 */}
      <div style={{
        flex: 1,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        animation: "splashIn 0.4s ease forwards",
        textAlign: "center",
        paddingBottom: isMobile ? "4vh" : 0,
      }}>
        <h1 style={{
          margin: 0, fontSize: 34, fontWeight: 800,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.5px",
        }}>
          오늘 날이가
        </h1>
        <p style={{
          margin: "12px 0 0", fontSize: 18,
          color: "var(--color-text-tertiary)",
          fontWeight: 400,
        }}>
          오늘 하루도 건승하세요!
        </p>
      </div>

      {/* 하단: splash_logo 이미지 (모바일만) */}
      {isMobile && (
        <div style={{
          height: "52vh",
          width: "100%",
          flexShrink: 0,
          overflow: "hidden",
        }}>
          <img
            src="/splash_logo.png"
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
              display: "block",
              maskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
            }}
          />
        </div>
      )}
    </div>
  );
}
