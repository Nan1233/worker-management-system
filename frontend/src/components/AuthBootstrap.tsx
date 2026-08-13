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
      <main className="auth-bootstrap-loading" role="status" aria-live="polite" aria-busy="true">
        <div className="auth-bootstrap-loading__content">
          <span className="auth-bootstrap-loading__mark" aria-hidden="true">K</span>
          <div className="auth-bootstrap-loading__copy">
            <strong>KTC Production Management</strong>
            <span>Đang chuẩn bị hệ thống...</span>
          </div>
          <span className="auth-bootstrap-loading__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
