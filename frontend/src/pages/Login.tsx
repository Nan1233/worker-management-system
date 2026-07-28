import {
    useEffect,
    useMemo,
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
    getAccessToken,
    getStoredUser,
    recoverUserFromAccessToken
} from "../utils/authStorage";

import type {
    User,
    UserRole
} from "../types/auth";

import "./Login.css";

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

const REMEMBERED_ACCOUNTS_KEY =
    "ktc_remembered_accounts";

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

const readRememberedAccounts =
    (): RememberedAccount[] => {
        try {
            const rawValue = localStorage.getItem(
                REMEMBERED_ACCOUNTS_KEY
            );

            const value = JSON.parse(
                rawValue || "[]"
            );

            return Array.isArray(value)
                ? value.slice(0, 5)
                : [];
        } catch {
            return [];
        }
    };

const saveRememberedAccount = (
    user: User
): RememberedAccount[] => {
    const next: RememberedAccount[] = [
        {
            username: user.username,
            fullName:
                user.full_name ||
                user.username,
            role: user.role,
            lastUsedAt:
                new Date().toISOString()
        },
        ...readRememberedAccounts().filter(
            (item) =>
                item.username !==
                user.username
        )
    ].slice(0, 5);

    localStorage.setItem(
        REMEMBERED_ACCOUNTS_KEY,
        JSON.stringify(next)
    );

    return next;
};

function Login() {
    const navigate = useNavigate();

    const initialAccounts = useMemo(
        () => readRememberedAccounts(),
        []
    );

    const [username, setUsername] = useState(
        () => initialAccounts[0]?.username || ""
    );
    const [password, setPassword] = useState("");
    const [step, setStep] = useState<LoginStep>(
        "employee-code"
    );
    const [rememberAccount, setRememberAccount] =
        useState(true);
    const [showPassword, setShowPassword] =
        useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [rememberedAccounts, setRememberedAccounts] =
        useState<RememberedAccount[]>(initialAccounts);

    useEffect(() => {
        const accessToken = getAccessToken();
        const savedUser = getStoredUser() || recoverUserFromAccessToken();

        if (accessToken && savedUser) {
            const targetPath = homeByRole[savedUser.role];

            if (targetPath) {
                navigate(targetPath, { replace: true });
                return;
            }
        }

        // Không xóa phiên chỉ vì thông tin user cục bộ bị thiếu.
        // User tối thiểu được khôi phục từ access token để app không báo
        // "không tồn tại" khi reload hoặc mở lại PWA/Desktop.
    }, [navigate]);

    const matchingAccounts = useMemo(() => {
        const keyword = username.trim().toLowerCase();

        if (!keyword) {
            return rememberedAccounts;
        }

        return rememberedAccounts.filter(
            (item) =>
                item.username
                    .toLowerCase()
                    .includes(keyword) ||
                item.fullName
                    .toLowerCase()
                    .includes(keyword)
        );
    }, [rememberedAccounts, username]);

    const completeLogin = async (
        accessType: "worker" | "management"
    ) => {
        const normalizedUsername = username.trim();

        if (!normalizedUsername) {
            setError("Vui lòng nhập mã nhân viên.");
            setStep("employee-code");
            return;
        }

        if (
            accessType === "management" &&
            !password
        ) {
            setError("Vui lòng nhập mật khẩu quản lý.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const data = await login(
                normalizedUsername,
                accessType,
                password
            );

            if (rememberAccount) {
                setRememberedAccounts(
                    saveRememberedAccount(data.user)
                );
            } else {
                const next = readRememberedAccounts().filter(
                    (item) =>
                        item.username !== data.user.username
                );

                localStorage.setItem(
                    REMEMBERED_ACCOUNTS_KEY,
                    JSON.stringify(next)
                );
                setRememberedAccounts(next);
            }

            const redirectAfterLogin =
                sessionStorage.getItem(
                    "redirectAfterLogin"
                );

            sessionStorage.removeItem(
                "redirectAfterLogin"
            );

            if (
                redirectAfterLogin &&
                redirectAfterLogin !== "/login"
            ) {
                navigate(redirectAfterLogin, {
                    replace: true
                });
                return;
            }

            navigate(
                homeByRole[data.user.role] || "/",
                { replace: true }
            );
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                const responseData = err.response?.data as
                    | { message?: string }
                    | undefined;

                setError(
                    responseData?.message ||
                    "Không thể đăng nhập. Vui lòng kiểm tra lại."
                );
                return;
            }

            setError(
                err instanceof Error
                    ? err.message
                    : "Không thể đăng nhập. Vui lòng thử lại."
            );
        } finally {
            setLoading(false);
        }
    };

    const continueToRoleChoice = (
        event: React.FormEvent<HTMLFormElement>
    ) => {
        event.preventDefault();

        if (!username.trim()) {
            setError("Vui lòng nhập mã nhân viên.");
            return;
        }

        setError("");
        setStep("role-choice");
    };

    const submitManagementPassword = (
        event: React.FormEvent<HTMLFormElement>
    ) => {
        event.preventDefault();
        void completeLogin("management");
    };

    const resetToEmployeeCode = () => {
        setPassword("");
        setError("");
        setStep("employee-code");
    };

    const selectAccount = (
        account: RememberedAccount
    ) => {
        setUsername(account.username);
        setPassword("");
        setError("");
        setStep("employee-code");
    };

    const removeAccount = (
        accountUsername: string
    ) => {
        const next = rememberedAccounts.filter(
            (item) => item.username !== accountUsername
        );

        localStorage.setItem(
            REMEMBERED_ACCOUNTS_KEY,
            JSON.stringify(next)
        );
        setRememberedAccounts(next);

        if (username === accountUsername) {
            setUsername("");
            resetToEmployeeCode();
        }
    };

    return (
        <main className="login-page">
            <section className="login-showcase">
                <div className="login-showcase-inner">
                    <div className="login-company-brand">
                        <span className="login-brand-mark" aria-hidden="true">K</span>
                        <p className="login-company-name">KTC (HANOI) CO., LTD</p>
                    </div>
                    <p className="login-eyebrow">PRODUCTION MANAGEMENT SYSTEM</p>
                    <h1>Dữ liệu sản xuất<br />đúng ngay từ nguồn.</h1>
                    <p className="login-description">
                        Ghi nhận sản lượng, kiểm soát chất lượng và theo dõi trạng thái báo cáo trên một hệ thống thống nhất dành cho nhà máy.
                    </p>
                    <div className="login-benefits">
                        <div><strong>01</strong><span>Nhập báo cáo nhanh tại công đoạn</span></div>
                        <div><strong>02</strong><span>Kiểm duyệt và lưu vết minh bạch</span></div>
                        <div><strong>03</strong><span>Tự động tổng hợp Excel và Google Sheet</span></div>
                    </div>
                </div>
            </section>

            <section className="login-panel">
                <div className="login-card">
                    <div className="login-mobile-brand">
                        <span className="login-brand-mark" aria-hidden="true">K</span>
                        <div>
                            <strong>KTC (HANOI) CO., LTD</strong>
                            <small>Đăng nhập hệ thống</small>
                        </div>
                    </div>

                    <div className="login-heading">
                        <span className="login-status-dot" />
                        <p>HỆ THỐNG ĐANG HOẠT ĐỘNG</p>
                        <h2>
                            {step === "employee-code" && "Nhập mã nhân viên"}
                            {step === "role-choice" && "Bạn muốn đăng nhập với vai trò nào?"}
                            {step === "management-password" && "Xác thực tài khoản quản lý"}
                        </h2>
                        <span>
                            {step === "employee-code" && "Chỉ cần nhập mã nhân viên để tiếp tục."}
                            {step === "role-choice" && `Mã nhân viên: ${username.trim()}`}
                            {step === "management-password" && `Nhập mật khẩu cho mã ${username.trim()}.`}
                        </span>
                    </div>

                    {step === "employee-code" && rememberedAccounts.length > 0 && (
                        <div className="remembered-section">
                            <div className="remembered-title">
                                <span>Tài khoản gần đây</span>
                                <small>Chọn để điền nhanh mã đăng nhập</small>
                            </div>
                            <div className="remembered-list">
                                {matchingAccounts.slice(0, 3).map((account) => (
                                    <div className="remembered-account" key={account.username}>
                                        <button type="button" onClick={() => selectAccount(account)}>
                                            <span className="remembered-avatar">
                                                {(account.fullName || account.username).charAt(0).toUpperCase()}
                                            </span>
                                            <span className="remembered-copy">
                                                <strong>{account.fullName || account.username}</strong>
                                                <small>{account.username} · {roleLabel[account.role]}</small>
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className="remove-remembered"
                                            onClick={() => removeAccount(account.username)}
                                            aria-label={`Xóa gợi ý tài khoản ${account.username}`}
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === "employee-code" && (
                        <form onSubmit={continueToRoleChoice} className="login-form">
                            <label>
                                <span>Mã nhân viên</span>
                                <div className="login-input-wrap">
                                    <span className="login-input-icon">♙</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="username"
                                        placeholder="Ví dụ: 0599"
                                        value={username}
                                        onChange={(event) => setUsername(event.target.value)}
                                        disabled={loading}
                                        autoFocus
                                    />
                                </div>
                            </label>
                            {error && <div className="login-error" role="alert">{error}</div>}
                            <button type="submit" className="login-submit" disabled={loading}>
                                Tiếp tục <span>→</span>
                            </button>
                        </form>
                    )}

                    {step === "role-choice" && (
                        <div className="login-role-choice">
                            <button
                                type="button"
                                className="login-role-card login-role-worker"
                                disabled={loading}
                                onClick={() => void completeLogin("worker")}
                            >
                                <span className="login-role-icon">♙</span>
                                <span>
                                    <strong>Công nhân</strong>
                                    <small>Vào ngay, không cần mật khẩu</small>
                                </span>
                                <b>→</b>
                            </button>
                            <button
                                type="button"
                                className="login-role-card"
                                disabled={loading}
                                onClick={() => {
                                    setError("");
                                    setStep("management-password");
                                }}
                            >
                                <span className="login-role-icon">◆</span>
                                <span>
                                    <strong>Quản lý</strong>
                                    <small>Quản lý, tổ trưởng hoặc quản trị viên</small>
                                </span>
                                <b>→</b>
                            </button>
                            {error && <div className="login-error" role="alert">{error}</div>}
                            {loading && <div className="login-loading-line"><span className="login-spinner" /> Đang đăng nhập...</div>}
                            <button type="button" className="login-back" onClick={resetToEmployeeCode} disabled={loading}>← Đổi mã nhân viên</button>
                        </div>
                    )}

                    {step === "management-password" && (
                        <form onSubmit={submitManagementPassword} className="login-form">
                            <label>
                                <span>Mật khẩu quản lý</span>
                                <div className="login-input-wrap">
                                    <span className="login-input-icon">●</span>
                                    <input
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
                                    >{showPassword ? "Ẩn" : "Hiện"}</button>
                                </div>
                            </label>
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
                                {loading ? <><span className="login-spinner" />Đang đăng nhập...</> : <>Đăng nhập quản lý <span>→</span></>}
                            </button>
                            <button type="button" className="login-back" onClick={() => { setPassword(""); setError(""); setStep("role-choice"); }} disabled={loading}>← Quay lại chọn vai trò</button>
                        </form>
                    )}

                    <p className="login-security-note">
                        Công nhân đăng nhập bằng mã nhân viên. Tài khoản quản lý vẫn được bảo vệ bằng mật khẩu.
                    </p>
                </div>
            </section>
        </main>
    );
}

export default Login;
