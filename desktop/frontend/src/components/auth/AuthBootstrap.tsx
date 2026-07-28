import { useEffect, useState } from "react";
import { initializeAuthSession } from "../../services/api";

export default function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => { let active = true; void initializeAuthSession().finally(() => { if (active) { setAuthReady(true); window.dispatchEvent(new CustomEvent("ktc:auth-ready")); } }); return () => { active = false; }; }, []);
  if (!authReady) return <div className="route-loading">Đang khôi phục phiên đăng nhập...</div>;
  return <>{children}</>;
}
