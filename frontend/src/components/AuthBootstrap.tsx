import { useEffect, useState, type ReactNode } from "react";
import { initializeAuthSession } from "../services/api";
import {
  getAccessToken,
  getStoredUser,
  hasRefreshSessionHint,
  recoverUserFromAccessToken,
} from "../utils/authStorage";

function isLoginRoute(): boolean {
  const currentRoute = window.location.hash.replace(/^#/, "") || "/";
  return /^\/login(?:\/|$)/.test(currentRoute);
}

/**
 * Do not block the whole SPA when a valid browser session is already cached.
 * The session refresh still runs in the background. We only keep the old
 * blocking behaviour when there is a refresh-session hint but no access token
 * yet, because in that case PrivateRoute cannot safely decide the user role.
 */
function canRenderImmediately(): boolean {
  if (isLoginRoute()) return true;

  const accessToken = getAccessToken();
  if (!accessToken) return false;

  const storedUser = getStoredUser() || recoverUserFromAccessToken();
  return Boolean(storedUser);
}

export default function AuthBootstrap({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(() => {
    if (canRenderImmediately()) return true;

    // No previous session: let /login render immediately.
    // A refresh-only session still needs the bootstrap before protected routes.
    return !hasRefreshSessionHint() || isLoginRoute();
  });

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
    return <div className="app-loading" role="status">Đang khôi phục phiên đăng nhập…</div>;
  }

  return <>{children}</>;
}
