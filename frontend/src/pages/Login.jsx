import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { loginWithKakao } = useAuth();
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowButton(true), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="splash-bg login-container">
      <div className="login-box">
        <img src="/logo.png" alt="로고" className="login-logo" />
        <h1 className="login-title">오늘 날이가</h1>
        <p className="login-subtitle">오늘 하루도 건승하세요!</p>

        <div className="login-features" style={{
          display: "flex", flexDirection: "column", gap: 10,
          margin: "20px 0 16px", padding: "16px 18px",
          borderRadius: 12, backdropFilter: "blur(6px)",
        }}>
          {[
            { icon: null, replace: true, label: "차트에 지지선·저항선 직접 그리기" },
            { icon: "M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3C7.7 6.2 6 8.4 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9", label: "주가가 선에 닿으면 푸시 알림" },
            { icon: "M22 12h-4l-3 9L9 3l-3 9H2", label: "터치 반등 확률 자동 계산" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg className="login-features-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                {item.replace
                  ? <>
                      <line x1="4" y1="20" x2="10" y2="8" />
                      <line x1="10" y1="8" x2="16" y2="16" />
                      <line x1="16" y1="16" x2="20" y2="6" />
                      <line x1="2" y1="14" x2="22" y2="14" strokeDasharray="3 3" />
                    </>
                  : <path d={item.icon} />
                }
              </svg>
              <span className="login-features-text" style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <div className="login-btn-wrap" style={{
          opacity: showButton ? 1 : 0,
          transform: showButton ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}>
          <button
            onClick={loginWithKakao}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", height: 52, borderRadius: 12, border: "none",
              background: "#FEE500", color: "#191919",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              lineHeight: 1,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flexShrink: 0 }}>
              <path d="M11 2C6.03 2 2 5.358 2 9.5c0 2.685 1.71 5.045 4.3 6.394l-.87 3.243a.25.25 0 00.383.272L9.99 17.1c.33.048.667.073 1.01.073 4.97 0 9-3.358 9-7.5S15.97 2 11 2z" fill="#191919"/>
            </svg>
            카카오로 시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
