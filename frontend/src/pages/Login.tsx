import { useEffect, useState } from "react";
import "./Login.css";

const LOGIN_LOGO_URL = "https://ktc-frontend.nan978971.workers.dev/KTC-WebClip-Icon-400.png";
const LOGIN_LOGO_FALLBACK_URL = "/KTC-WebClip-Icon-400.png";

export default function Login() {
  const [loginLogoSrc, setLoginLogoSrc] = useState(LOGIN_LOGO_URL);

  useEffect(() => {
    // Electron can retain an older renderer cache even after the hosted frontend
    // has been redeployed. A cache-busting query makes the real KTC logo resolve
    // as a fresh resource without changing the image itself.
    setLoginLogoSrc(`${LOGIN_LOGO_URL}?v=${Date.now()}`);
  }, []);

  return (
    <div className="login-page">
      <div className="login-bg-shape login-bg-shape-left" />
      <div className="login-bg-shape login-bg-shape-right" />

      <main className="login-card">
        <div className="login-logo-wrap">
          <img
            src={loginLogoSrc}
            onError={() => {
              if (loginLogoSrc !== LOGIN_LOGO_FALLBACK_URL) {
                setLoginLogoSrc(LOGIN_LOGO_FALLBACK_URL);
              }
            }}
            alt="KTC HANOI"
            className="login-logo"
            width="192"
            height="192"
            decoding="async"
          />
        </div>

        <h1>Chào mừng bạn!</h1>
        <p className="login-subtitle">Hệ thống quản lý sản xuất KTC HANOI</p>

        {/* Existing login form/content remains below. */}
      </main>
    </div>
  );
}
