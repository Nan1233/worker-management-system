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
// Relative path is required for the packaged Electron file:// frontend.
// The same path also resolves correctly when the app is served by the web host.
const LOGIN_LOGO_URL = "./ktc-hanoi-logo.png";

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
            setError("Vui lÃ²ng nháº­p mÃ£ nhÃ¢n viÃªn.");
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
        if (type === "worker") {
            void completeLogin("worker");
            return;
        }
        setStep("management-password");
    };

    const completeLogin = async (type: AccessType) => {
        const rawUsername = username.trim();

        if (!rawUsername) {
            setError("Vui lÃ²ng nháº­p mÃ£ nhÃ¢n viÃªn.");
            setStep("employee-code");
            return;
        }

        if (type === "management" && !password) {
            setError("Vui lÃ²ng nháº­p máº­t kháº©u quáº£n lÃ½.");
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
                throw new Error("ÄÄƒng nháº­p thÃ nh cÃ´ng nhÆ°ng mÃ¡y chá»§ khÃ´ng tráº£ vá» thÃ´ng tin tÃ i khoáº£n.");
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
                setError(responseData?.message || responseData?.error || "MÃ£ nhÃ¢n viÃªn hoáº·c thÃ´ng tin Ä‘Äƒng nháº­p khÃ´ng há»£p lá»‡.");
            } else {
                setError(err instanceof Error ? err.message : "KhÃ´ng thá»ƒ Ä‘Äƒng nháº­p. Vui lÃ²ng thá»­ láº¡i.");
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

            <section className="login-card" aria-label="ÄÄƒng nháº­p há»‡ thá»‘ng KTC">
                <div className="login-brand">
                    <img
                        src={LOGIN_LOGO_URL}
                        alt="KTC HANOI"
                        className="login-logo"
                        width="192" height="64"
                        decoding="async"
                    />
                </div>

                <header className="login-heading">
                    <h1>{step === "role-choice" ? "Chá»n vai trÃ²" : step === "management-password" ? "ÄÄƒng nháº­p quáº£n lÃ½" : "ChÃ o má»«ng báº¡n!"}</h1>
                    <p>
                        {step === "employee-code" && "Nháº­p mÃ£ nhÃ¢n viÃªn Ä‘á»ƒ tiáº¿p tá»¥c"}
                        {step === "role-choice" && <>MÃ£ nhÃ¢n viÃªn: <strong>{username.trim()}</strong><br />Chá»n loáº¡i tÃ i khoáº£n Ä‘á»ƒ tiáº¿p tá»¥c</>}
                        {step === "management-password" && <>MÃ£ nhÃ¢n viÃªn: <strong>{username.trim()}</strong></>}
                    </p>
                </header>

                {step === "employee-code" && (
                    <form className="login-form" onSubmit={continueWithCode}>
                        <div className="login-field">
                            <label htmlFor="login-username">MÃ£ nhÃ¢n viÃªn</label>
                            <div className="login-input-wrap">
                                <span className="login-input-icon" aria-hidden="true">â™™</span>
                                <input id="login-username" type="text" inputMode="text" autoComplete="username" placeholder="Nháº­p mÃ£ nhÃ¢n viÃªn" value={username} onChange={(event) => setUsername(event.target.value)} disabled={loading} autoFocus maxLength={20} />
                            </div>
                        </div>
                        <label className="remember-checkbox">
                            <input type="checkbox" checked={rememberAccount} onChange={(event) => setRememberAccount(event.target.checked)} disabled={loading} />
                            <span>Ghi nhá»› mÃ£ nhÃ¢n viÃªn trÃªn thiáº¿t bá»‹</span>
                        </label>
                        {error && <div className="login-error" role="alert">{error}</div>}
                        <button type="submit" className="login-submit" disabled={loading}>Tiáº¿p tá»¥c <span aria-hidden="true">â†’</span></button>
                    </form>
                )}

                {step === "role-choice" && (
                    <div className="login-role-choice">
                        <button type="button" className="login-role-card" onClick={() => chooseRole("worker")} disabled={loading}>
                            <span className="login-role-icon" aria-hidden="true">â™™</span>
                            <span className="login-role-copy"><strong>CÃ´ng nhÃ¢n</strong><small>ÄÄƒng nháº­p báº±ng mÃ£ nhÃ¢n viÃªn Ä‘Ã£ nháº­p</small></span>
                            <b aria-hidden="true">â€º</b>
                        </button>
                        <button type="button" className="login-role-card" onClick={() => chooseRole("management")} disabled={loading}>
                            <span className="login-role-icon" aria-hidden="true">â™™</span>
                            <span className="login-role-copy"><strong>Quáº£n lÃ½</strong><small>DÃ¹ng mÃ£ nhÃ¢n viÃªn vÃ  nháº­p máº­t kháº©u</small></span>
                            <b aria-hidden="true">â€º</b>
                        </button>
                        {error && <div className="login-error" role="alert">{error}</div>}
                        <button type="button" className="login-back" onClick={backToCode} disabled={loading}>â† Nháº­p láº¡i mÃ£ nhÃ¢n viÃªn</button>
                    </div>
                )}

                {step === "management-password" && (
                    <form className="login-form" onSubmit={submitManagementLogin}>
                        <div className="login-field">
                            <label htmlFor="login-password">Máº­t kháº©u quáº£n lÃ½</label>
                            <div className="login-input-wrap">
                                <span className="login-input-icon" aria-hidden="true">â—</span>
                                <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Nháº­p máº­t kháº©u" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} autoFocus />
                                <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} disabled={loading} aria-label={showPassword ? "áº¨n máº­t kháº©u" : "Hiá»‡n máº­t kháº©u"}>{showPassword ? "áº¨n" : "Hiá»‡n"}</button>
                            </div>
                        </div>
                        <label className="remember-checkbox">
                            <input type="checkbox" checked={rememberAccount} onChange={(event) => setRememberAccount(event.target.checked)} disabled={loading} />
                            <span>Ghi nhá»› mÃ£ nhÃ¢n viÃªn trÃªn thiáº¿t bá»‹</span>
                        </label>
                        {error && <div className="login-error" role="alert">{error}</div>}
                        <button type="submit" className="login-submit" disabled={loading}>{loading ? <><span className="login-spinner" /> Äang Ä‘Äƒng nháº­p...</> : <>ÄÄƒng nháº­p <span aria-hidden="true">â†’</span></>}</button>
                        <button type="button" className="login-back" onClick={backToRoleChoice} disabled={loading}>â† Chá»n láº¡i vai trÃ²</button>
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

