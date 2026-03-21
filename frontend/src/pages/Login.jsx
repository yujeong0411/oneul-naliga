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
