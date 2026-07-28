import { useEffect, useState, type ReactNode } from "react";
import { initializeAuthSession } from "../services/api";

export default function AuthBootstrap({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let active = true;
    void initializeAuthSession().finally(() => {
      if (active) setAuthReady(true);
    });
    return () => { active = false; };
  }, []);

  if (!authReady) {
    return <div className="app-loading" role="status">Đang khôi phục phiên đăng nhập…</div>;
  }
  return <>{children}</>;
}
