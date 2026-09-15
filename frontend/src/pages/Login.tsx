import { useEffect, useState } from "react";
import "./Login.css";

const LOGIN_LOGO_URL = "/KTC-WebClip-Icon-400.png";
const LOGIN_LOGO_FALLBACK_URL = "https://raw.githubusercontent.com/Nan1233/worker-management-system/main/frontend/public/KTC-WebClip-Icon-400.png";

export default function Login() {
  const [loginLogoSrc, setLoginLogoSrc] = useState(LOGIN_LOGO_URL);

  useEffect(() => {
    const logo = document.querySelector<HTMLImageElement>(".login-logo");
    if (logo) logo.src = `${LOGIN_LOGO_URL}?v=${Date.now()}`;
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
      </main>
    </div>
  );
}
