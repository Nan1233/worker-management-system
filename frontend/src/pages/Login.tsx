import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { login } from "../services/authService";
import { beginLoginTransition, finishLoginTransition } from "../services/api";
import { clearAuthSession, clearCurrentTabAuthSession } from "../utils/authStorage";
import type { User, UserRole } from "../types/auth";

type LoginStep = "employee-code" | "role-choice" | "management-password";
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
    const [step, setStep] = useState<LoginStep>("employee-code");
    const [accessType, setAccessType] = useState<AccessType | null>(null);
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

    const continueWithCode = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const code = username.trim();
        if (!code) {
            setError("Vui lòng nhập mã nhân viên.");
            return;
        }
        setError("");
        setAccessType(null);
        setStep("role-choice");
    };

    const chooseRole = (type: AccessType) => {
        setAccessType(type);
        setPassword("");
        setError("");
        // Worker uses the employee code already entered; do not show the code form again.
        if (type === "worker") {
            void completeLogin("worker");
            return;
        }
        setStep("management-password");
    };

    const completeLogin = async (type: AccessType) => {
        const rawUsername = username.trim();

        if (!rawUsername) {
            setError("Vui lòng nhập mã nhân viên.");
            setStep("employee-code");
            return;
        }

        if (type === "management" && !password) {
            setError("Vui lòng nhập mật khẩu quản lý.");
            setStep("management-password");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const loginUsername = type === "worker" ? normalizeWorkerLoginCode(rawUsername) : rawUsername;
            const result = await login(loginUsername, type, password) as unknown as LoginResultShape;
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
            setStep(type === "management" ? "management-password" : "role-choice");
        } finally {
            setLoading(false);
        }
    };

    const submitWorkerLogin = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void completeLogin("worker");
    };

    const submitManagementLogin = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void completeLogin("management");
    };

    const backToCode = () => {
        setPassword("");
        setError("");
        setAccessType(null);
        setStep("employee-code");
    };

    const backToRoleChoice = () => {
        setPassword("");
        setError("");
        setAccessType(null);
        setStep("role-choice");
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
                    <h1>{step === "role-choice" ? "Chọn vai trò" : step === "management-password" ? "Đăng nhập quản lý" : "Chào mừng bạn!"}</h1>
                    <p>
                        {step === "employee-code" && "Nhập mã nhân viên để tiếp tục"}
                        {step === "role-choice" && <>Mã nhân viên: <strong>{username.trim()}</strong><br />Chọn loại tài khoản để tiếp tục</>}
                        {step === "management-password" && <>Mã nhân viên: <strong>{username.trim()}</strong></>}
                    </p>
                </header>

                {step === "employee-code" && (
                    <form className="login-form" onSubmit={continueWithCode}>
                        <div className="login-field">
                            <label htmlFor="login-username">Mã nhân viên</label>
                            <div className="login-input-wrap">
                                <span className="login-input-icon" aria-hidden="true">♙</span>
                                <input
                                    id="login-username"
                                    type="text"
                                    inputMode="text"
                                    autoComplete="username"
                                    placeholder="Nhập mã nhân viên"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    disabled={loading}
                                    autoFocus
                                    maxLength={20}
                                />
                            </div>
                        </div>

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
                            Tiếp tục <span aria-hidden="true">→</span>
                        </button>
                    </form>
                )}

                {step === "role-choice" && (
                    <div className="login-role-choice">
                        <button type="button" className="login-role-card" onClick={() => chooseRole("worker")} disabled={loading}>
                            <span className="login-role-icon" aria-hidden="true">♙</span>
                            <span className="login-role-copy"><strong>Công nhân</strong><small>Đăng nhập bằng mã nhân viên đã nhập</small></span>
                            <b aria-hidden="true">›</b>
                        </button>

                        <button type="button" className="login-role-card" onClick={() => chooseRole("management")} disabled={loading}>
                            <span className="login-role-icon" aria-hidden="true">♙</span>
                            <span className="login-role-copy"><strong>Quản lý</strong><small>Dùng mã nhân viên và nhập mật khẩu</small></span>
                            <b aria-hidden="true">›</b>
                        </button>

                        {error && <div className="login-error" role="alert">{error}</div>}
                        <button type="button" className="login-back" onClick={backToCode} disabled={loading}>← Nhập lại mã nhân viên</button>
                    </div>
                )}

                {step === "management-password" && (
                    <form className="login-form" onSubmit={submitManagementLogin}>
                        <div className="login-field">
                            <label htmlFor="login-password">Mật khẩu quản lý</label>
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
                                    autoFocus
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
                            {loading ? <><span className="login-spinner" /> Đang đăng nhập...</> : <>Đăng nhập <span aria-hidden="true">→</span></>}
                        </button>

                        <button type="button" className="login-back" onClick={backToRoleChoice} disabled={loading}>← Chọn lại vai trò</button>
                    </form>
                )}

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
