import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { login } from "../services/authService";
import { beginLoginTransition, finishLoginTransition } from "../services/api";
import { clearAuthSession, clearCurrentTabAuthSession } from "../utils/authStorage";
import type { User, UserRole } from "../types/auth";

type AccessType = "worker" | "management";

interface LoginResultShape {
    user?: User;
    data?: { user?: User };
}

const CROSS_TAB_LOGIN_MARKER_KEY = "ktcCrossTabAuthInvalidated";
const REMEMBERED_CODE_KEY = "ktc_login_code";

const homeByRole: Record<UserRole, string> = {
    admin: "/admin",
    manager: "/manager",
    lead: "/lead",
    worker: "/worker"
};

const normalizeWorkerLoginCode = (value: string): string => {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return trimmed;
    const stripped = trimmed.replace(/^0+(?=\d)/, "");
    return stripped || "0";
};

function Login() {
    const navigate = useNavigate();
    const initializedRef = useRef(false);
    const [username, setUsername] = useState(() => localStorage.getItem(REMEMBERED_CODE_KEY) || "");
    const [password, setPassword] = useState("");
    const [accessType, setAccessType] = useState<AccessType>("worker");
    const [rememberAccount, setRememberAccount] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const passiveCrossTabRedirect = sessionStorage.getItem(CROSS_TAB_LOGIN_MARKER_KEY) === "1";
        sessionStorage.removeItem(CROSS_TAB_LOGIN_MARKER_KEY);

        if (passiveCrossTabRedirect) {
            clearCurrentTabAuthSession();
        } else {
            beginLoginTransition();
            clearAuthSession({ bumpEpoch: false });
            finishLoginTransition();
        }

        sessionStorage.removeItem("redirectAfterLogin");

        if (/\/login\/?$/.test(window.location.pathname)) {
            const canonicalUrl = `${window.location.origin}/#${window.location.hash.replace(/^#/, "") || "/login"}`;
            window.history.replaceState(null, "", canonicalUrl);
        }
    }, []);

    const completeLogin = async () => {
        const rawUsername = username.trim();

        if (!rawUsername) {
            setError("Vui lòng nhập mã nhân viên.");
            return;
        }

        if (accessType === "management" && !password) {
            setError("Vui lòng nhập mật khẩu quản lý.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const loginUsername = accessType === "worker"
                ? normalizeWorkerLoginCode(rawUsername)
                : rawUsername;

            const result = await login(loginUsername, accessType, password) as unknown as LoginResultShape;
            const user = result?.user || result?.data?.user;

            if (!user?.role) {
                throw new Error("Đăng nhập thành công nhưng máy chủ không trả về thông tin tài khoản.");
            }

            if (rememberAccount) {
                localStorage.setItem(REMEMBERED_CODE_KEY, rawUsername);
            } else {
                localStorage.removeItem(REMEMBERED_CODE_KEY);
            }

            const redirectAfterLogin = sessionStorage.getItem("redirectAfterLogin");
            sessionStorage.removeItem("redirectAfterLogin");

            navigate(
                redirectAfterLogin && redirectAfterLogin !== "/login"
                    ? redirectAfterLogin
                    : homeByRole[user.role] || "/",
                { replace: true }
            );
        } catch (err: unknown) {
            beginLoginTransition();
            clearAuthSession({ bumpEpoch: false });
            finishLoginTransition();

            if (axios.isAxiosError(err)) {
                const responseData = err.response?.data as { message?: string; error?: string } | undefined;
                setError(responseData?.message || responseData?.error || "Mã nhân viên hoặc thông tin đăng nhập không hợp lệ.");
            } else {
                setError(err instanceof Error ? err.message : "Không thể đăng nhập. Vui lòng thử lại.");
            }
        } finally {
            setLoading(false);
        }
    };

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void completeLogin();
    };

    const switchAccessType = (type: AccessType) => {
        setAccessType(type);
        setPassword("");
        setError("");
    };

    return (
        <main className="login-page">
            <div className="login-decoration login-decoration-top" aria-hidden="true" />
            <div className="login-decoration login-decoration-left" aria-hidden="true" />
            <div className="login-decoration login-decoration-bottom" aria-hidden="true" />
            <div className="login-dots login-dots-top" aria-hidden="true" />
            <div className="login-dots login-dots-bottom" aria-hidden="true" />

            <section className="login-card" aria-label="Đăng nhập hệ thống KTC">
                <div className="login-brand">
                    <img src="/ktc-hanoi-logo.jpg" alt="KTC HANOI" className="login-logo" />
                </div>

                <header className="login-heading">
                    <h1>Chào mừng bạn!</h1>
                    <p>Đăng nhập để tiếp tục công việc</p>
                </header>

                <form className="login-form" onSubmit={submit}>
                    <div className="login-field">
                        <label htmlFor="login-username">{accessType === "worker" ? "Mã công nhân" : "Mã nhân viên"}</label>
                        <div className="login-input-wrap">
                            <span className="login-input-icon" aria-hidden="true">♙</span>
                            <input
                                id="login-username"
                                type="text"
                                inputMode="text"
                                autoComplete="username"
                                placeholder="Nhập mã công nhân"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                disabled={loading}
                                autoFocus
                                maxLength={20}
                            />
                        </div>
                    </div>

                    {accessType === "management" && (
                        <div className="login-field">
                            <label htmlFor="login-password">Mật khẩu</label>
                            <div className="login-input-wrap">
                                <span className="login-input-icon" aria-hidden="true">●</span>
                                <input
                                    id="login-password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder="Nhập mật khẩu"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword((current) => !current)}
                                    disabled={loading}
                                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                >
                                    {showPassword ? "Ẩn" : "Hiện"}
                                </button>
                            </div>
                        </div>
                    )}

                    <label className="remember-checkbox">
                        <input
                            type="checkbox"
                            checked={rememberAccount}
                            onChange={(event) => setRememberAccount(event.target.checked)}
                            disabled={loading}
                        />
                        <span>Ghi nhớ mã nhân viên trên thiết bị</span>
                    </label>

                    {error && <div className="login-error" role="alert">{error}</div>}

                    <button type="submit" className="login-submit" disabled={loading}>
                        {loading ? (
                            <><span className="login-spinner" /> Đang đăng nhập...</>
                        ) : (
                            <>Đăng nhập <span aria-hidden="true">→</span></>
                        )}
                    </button>

                    <button
                        type="button"
                        className="login-access-switch"
                        onClick={() => switchAccessType(accessType === "worker" ? "management" : "worker")}
                        disabled={loading}
                    >
                        {accessType === "worker" ? "Đăng nhập quản lý" : "Đăng nhập công nhân"}
                    </button>
                </form>

                <footer className="login-footer">
                    <strong>KTC (HANOI) CO., LTD</strong>
                    <span>Production Management System</span>
                    <i aria-hidden="true" />
                    <span>v1.0.0</span>
                </footer>
            </section>
        </main>
    );
}

export default Login;
