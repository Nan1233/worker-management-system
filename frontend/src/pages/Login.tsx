import {
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

import {
    useNavigate
} from "react-router-dom";

import axios from "axios";

import {
    login
} from "../services/authService";

import {
    beginLoginTransition,
    finishLoginTransition
} from "../services/api";

import {
    clearAuthSession,
    clearCurrentTabAuthSession
} from "../utils/authStorage";

import type {
    User,
    UserRole
} from "../types/auth";

interface RememberedAccount {
    username: string;
    fullName: string;
    role: UserRole;
    lastUsedAt: string;
}

type LoginStep =
    | "employee-code"
    | "role-choice"
    | "management-password";

type AccessType = "worker" | "management";

interface LoginResultShape {
    user?: User;
    data?: {
        user?: User;
    };
}

const REMEMBERED_ACCOUNTS_KEY = "ktc_remembered_accounts";
const CROSS_TAB_LOGIN_MARKER_KEY = "ktcCrossTabAuthInvalidated";

const homeByRole: Record<UserRole, string> = {
    admin: "/admin",
    manager: "/manager",
    lead: "/lead",
    worker: "/worker"
};

const roleLabel: Record<UserRole, string> = {
    admin: "Quản trị viên",
    manager: "Quản lý",
    lead: "Tổ trưởng",
    worker: "Công nhân"
};

const readRememberedAccounts = (): RememberedAccount[] => {
    try {
        const rawValue = localStorage.getItem(REMEMBERED_ACCOUNTS_KEY);
        const value = JSON.parse(rawValue || "[]");
        return Array.isArray(value) ? value.slice(0, 5) : [];
    } catch {
        return [];
    }
};

const getLoginCode = (user: User): string =>
    String(user.username ?? "").trim();

const saveRememberedAccount = (user: User): RememberedAccount[] => {
    const loginCode = getLoginCode(user);
    const next: RememberedAccount[] = [
        {
            username: loginCode,
            fullName: user.full_name || loginCode,
            role: user.role,
            lastUsedAt: new Date().toISOString()
        },
        ...readRememberedAccounts().filter(
            item => item.username !== loginCode
        )
    ].slice(0, 5);

    localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(next));
    return next;
};

const normalizeWorkerLoginCode = (value: string): string => {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return trimmed;
    const stripped = trimmed.replace(/^0+(?=\d)/, "");
    return stripped || "0";
};

function Login() {
    const navigate = useNavigate();
    const loginPageInitializedRef = useRef(false);

    const initialAccounts = useMemo(() => readRememberedAccounts(), []);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [step, setStep] = useState<LoginStep>("role-choice");
    const [accessType, setAccessType] = useState<AccessType | null>(null);
    const [rememberAccount, setRememberAccount] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [rememberedAccounts, setRememberedAccounts] = useState<RememberedAccount[]>(initialAccounts);

    useEffect(() => {
        if (loginPageInitializedRef.current) return;
        loginPageInitializedRef.current = true;

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

    const matchingAccounts = useMemo(() => {
        const keyword = username.trim().toLowerCase();
        if (!keyword) return rememberedAccounts;
        return rememberedAccounts.filter(item =>
            item.username.toLowerCase().includes(keyword) ||
            item.fullName.toLowerCase().includes(keyword)
        );
    }, [rememberedAccounts, username]);

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
            const loginUsername = type === "worker"
                ? normalizeWorkerLoginCode(rawUsername)
                : rawUsername;

            const result = await login(loginUsername, type, password) as unknown as LoginResultShape;
            const user = result?.user || result?.data?.user;

            if (!user?.role) {
                throw new Error("Đăng nhập thành công nhưng máy chủ không trả về thông tin tài khoản.");
            }

            if (rememberAccount) {
                setRememberedAccounts(saveRememberedAccount(user));
            } else {
                const next = readRememberedAccounts().filter(item => item.username !== getLoginCode(user));
                localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(next));
                setRememberedAccounts(next);
            }

            const redirectAfterLogin = sessionStorage.getItem("redirectAfterLogin");
            sessionStorage.removeItem("redirectAfterLogin");

            if (redirectAfterLogin && redirectAfterLogin !== "/login") {
                navigate(redirectAfterLogin, { replace: true });
                return;
            }

            navigate(homeByRole[user.role] || "/", { replace: true });
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

    const chooseRole = (type: AccessType) => {
        setAccessType(type);
        setUsername("");
        setPassword("");
        setError("");
        setStep(type === "worker" ? "employee-code" : "management-password");
    };

    const submitEmployeeCode = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!username.trim()) {
            setError("Vui lòng nhập mã nhân viên.");
            return;
        }
        setError("");
        void completeLogin("worker");
    };

    const submitManagementPassword = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void completeLogin("management");
    };

    const resetToRoleChoice = () => {
        setUsername("");
        setPassword("");
        setError("");
        setAccessType(null);
        setStep("role-choice");
    };

    const selectAccount = (account: RememberedAccount) => {
        setUsername(account.username);
        setPassword("");
        setError("");
        setAccessType(account.role === "worker" ? "worker" : "management");
        setStep(account.role === "worker" ? "employee-code" : "management-password");
    };

    const removeAccount = (accountUsername: string) => {
        const next = rememberedAccounts.filter(item => item.username !== accountUsername);
        localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(next));
        setRememberedAccounts(next);
        if (username === accountUsername) resetToRoleChoice();
    };

    return (
        <main className="login-page">
            <section className="login-showcase">
                <div className="login-showcase-inner">
                    <div className="login-company-brand">
                        <span className="login-brand-mark" aria-hidden="true">KTC</span>
                        <p className="login-company-name">KTC (HANOI) CO., LTD</p>
                        <h1>Hệ thống quản lý sản xuất</h1>
                        <p className="login-tagline">Quản lý hiệu quả – Nâng cao chất lượng –<br />Phát triển bền vững</p>
                    </div>

                    <div className="login-factory-photo" aria-hidden="true">
                        <div className="factory-sky" />
                        <div className="factory-building">
                            <span className="factory-roof" />
                            <span className="factory-window factory-window-1" />
                            <span className="factory-window factory-window-2" />
                            <span className="factory-window factory-window-3" />
                            <span className="factory-door" />
                            <b>KTC</b>
                        </div>
                        <div className="factory-ground" />
                        <div className="factory-tree tree-1" /><div className="factory-tree tree-2" /><div className="factory-tree tree-3" /><div className="factory-tree tree-4" />
                    </div>

                    <div className="login-benefits">
                        <div><b>♢</b><strong>An toàn</strong><span>Bảo mật thông tin</span></div>
                        <div><b>▥</b><strong>Hiệu quả</strong><span>Quản lý chính xác</span></div>
                        <div><b>♧</b><strong>Kết nối</strong><span>Đồng hành phát triển</span></div>
                    </div>
                </div>
            </section>

            <section className="login-panel">
                <div className="login-card">
                    <div className="login-mobile-brand">
                        <span className="login-brand-mark" aria-hidden="true">KTC</span>
                    </div>

                    <div className="login-heading">
                        <div className="login-welcome-mark" aria-hidden="true" />
                        <h2>{step === "role-choice" ? "Đăng nhập" : accessType === "worker" ? "Đăng nhập công nhân" : "Đăng nhập quản lý"}</h2>
                        <span>{step === "role-choice" ? "Vui lòng chọn vai trò để tiếp tục" : `Mã nhân viên: ${username || "Chưa nhập"}`}</span>
                    </div>

                    {step === "role-choice" && (
                        <div className="login-role-choice">
                            <button type="button" className="login-role-card login-role-worker" disabled={loading} onClick={() => chooseRole("worker")}>
                                <span className="login-role-icon login-worker-icon" aria-hidden="true">♙</span>
                                <span><strong>Công nhân</strong><small>Đăng nhập bằng mã nhân viên</small></span>
                                <b aria-hidden="true">›</b>
                            </button>
                            <button type="button" className="login-role-card" disabled={loading} onClick={() => chooseRole("management")}>
                                <span className="login-role-icon login-manager-icon" aria-hidden="true">♙</span>
                                <span><strong>Quản lý</strong><small>Đăng nhập bằng mã nhân viên và mật khẩu</small></span>
                                <b aria-hidden="true">›</b>
                            </button>

                            {rememberedAccounts.length > 0 && (
                                <div className="remembered-section">
                                    <div className="remembered-title"><span>Tài khoản gần đây</span></div>
                                    <div className="remembered-list">
                                        {matchingAccounts.slice(0, 3).map(account => (
                                            <div className="remembered-account" key={account.username}>
                                                <button type="button" onClick={() => selectAccount(account)}>
                                                    <span className="remembered-avatar">{(account.fullName || account.username).charAt(0).toUpperCase()}</span>
                                                    <span className="remembered-copy"><strong>{account.fullName || account.username}</strong><small>{account.username} · {roleLabel[account.role]}</small></span>
                                                </button>
                                                <button type="button" className="remove-remembered" onClick={() => removeAccount(account.username)} aria-label={`Xóa gợi ý tài khoản ${account.username}`}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="login-security-note"><b>✓</b><span>Hệ thống được bảo mật an toàn.<br />Vui lòng không chia sẻ thông tin đăng nhập.</span></div>
                        </div>
                    )}

                    {step === "employee-code" && (
                        <form onSubmit={submitEmployeeCode} className="login-form">
                            <label><span>Mã nhân viên</span><div className="login-input-wrap"><span className="login-input-icon" aria-hidden="true">♙</span><input type="text" inputMode="text" autoComplete="username" placeholder="Nhập mã nhân viên" value={username} onChange={event => setUsername(event.target.value)} disabled={loading} autoFocus maxLength={20} /></div></label>
                            <label className="remember-checkbox"><input type="checkbox" checked={rememberAccount} onChange={event => setRememberAccount(event.target.checked)} disabled={loading} /><span>Ghi nhớ mã nhân viên trên thiết bị</span></label>
                            {error && <div className="login-error" role="alert">{error}</div>}
                            <button type="submit" className="login-submit" disabled={loading}>{loading ? <><span className="login-spinner" />Đang đăng nhập...</> : <>Đăng nhập <span>→</span></>}</button>
                            <button type="button" className="login-back" onClick={resetToRoleChoice} disabled={loading}>← Quay lại</button>
                        </form>
                    )}

                    {step === "management-password" && (
                        <form onSubmit={submitManagementPassword} className="login-form">
                            <label><span>Mã nhân viên</span><div className="login-input-wrap"><span className="login-input-icon" aria-hidden="true">♙</span><input type="text" autoComplete="username" placeholder="Nhập mã nhân viên" value={username} onChange={event => setUsername(event.target.value)} disabled={loading} autoFocus maxLength={20} /></div></label>
                            <label><span>Mật khẩu quản lý</span><div className="login-input-wrap"><span className="login-input-icon" aria-hidden="true">●</span><input type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Nhập mật khẩu" value={password} onChange={event => setPassword(event.target.value)} disabled={loading} /><button type="button" className="password-toggle" onClick={() => setShowPassword(current => !current)} disabled={loading} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? "Ẩn" : "Hiện"}</button></div></label>
                            <label className="remember-checkbox"><input type="checkbox" checked={rememberAccount} onChange={event => setRememberAccount(event.target.checked)} disabled={loading} /><span>Ghi nhớ mã nhân viên trên thiết bị</span></label>
                            {error && <div className="login-error" role="alert">{error}</div>}
                            <button type="submit" className="login-submit" disabled={loading}>{loading ? <><span className="login-spinner" />Đang đăng nhập...</> : <>Đăng nhập <span>→</span></>}</button>
                            <button type="button" className="login-back" onClick={resetToRoleChoice} disabled={loading}>← Quay lại chọn vai trò</button>
                        </form>
                    )}

                    <footer className="login-footer"><div />© 2025 KTC (HANOI) CO., LTD.<span>Phiên bản 1.0.0</span></footer>
                </div>
            </section>
        </main>
    );
}

export default Login;
