import { useEffect, useState, type ReactNode } from "react";
import { initializeAuthSession } from "../services/api";

export default function AuthBootstrap({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    let active = true;
    void initializeAuthSession().catch(() => undefined).finally(() => {
      if (active) {
        setAuthReady(true);
        window.dispatchEvent(new CustomEvent("ktc:auth-ready"));
      }
    });
    return () => { active = false; };
  }, []);

  if (!authReady) {
    return (
      <div className="app-loading" role="status" aria-live="polite" aria-label="Đang chuẩn bị hệ thống">
        <div className="app-loading__content">
          <span className="app-loading__mark" aria-hidden="true">K</span>
          <strong>KTC Production Management</strong>
          <span>Đang chuẩn bị hệ thống...</span>
          <span className="app-loading__dots" aria-hidden="true"><i /><i /><i /></span>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
