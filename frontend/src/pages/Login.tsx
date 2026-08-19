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

    localStorage.setItem(
        REMEMBERED_ACCOUNTS_KEY,
        JSON.stringify(next)
    );

    return next;
};

/**
 * Worker master-data trước đây có thể chứa mã dạng 599 trong khi
 * người dùng nhập 0599 theo file mẫu. Chỉ chuẩn hóa mã worker thuần số;
 * tài khoản quản lý vẫn gửi nguyên username.
 */
const normalizeWorkerLoginCode = (value: string): string => {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return trimmed;

    const stripped = trimmed.replace(/^0+(?=\d)/, "");
    return stripped || "0";
};

function Login() {
    const navigate = useNavigate();
    const loginPageInitializedRef = useRef(false);

    const initialAccounts = useMemo(
        () => readRememberedAccounts(),
        []
    );

    const [username, setUsername] = useState(
        () => initialAccounts[0]?.username || ""
    );
    const [password, setPassword] = useState("");
    const [step, setStep] = useState<LoginStep>("employee-code");
    const [rememberAccount, setRememberAccount] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [rememberedAccounts, setRememberedAccounts] =
        useState<RememberedAccount[]>(initialAccounts);

    useEffect(() => {
        if (loginPageInitializedRef.current) return;
        loginPageInitializedRef.current = true;

        const passiveCrossTabRedirect =
            sessionStorage.getItem(CROSS_TAB_LOGIN_MARKER_KEY) === "1";

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
            const canonicalUrl =
                `${window.location.origin}/#${window.location.hash.replace(/^#/, "") || "/login"}`;
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

    const completeLogin = async (
        accessType: "worker" | "management"
    ) => {
        const rawUsername = username.trim();

        if (!rawUsername) {
            setError("Vui lòng nhập mã nhân viên.");
            setStep("employee-code");
            return;
        }

        if (accessType === "management" && !password) {
            setError("Vui lòng nhập mật khẩu quản lý.");
            setStep("management-password");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const loginUsername =
                accessType === "worker"
                    ? normalizeWorkerLoginCode(rawUsername)
                    : rawUsername;

            /*
             * authService là canonical API layer. Chấp nhận cả hai shape
             * {user} và {data:{user}} để Login không phụ thuộc Axios wrapper.
             */
            const result = await login(
                loginUsername,
                accessType,
                password
            ) as unknown as LoginResultShape;

            const user =
                result?.user ||
                result?.data?.user;

            if (!user?.role) {
                throw new Error(
                    "Đăng nhập thành công nhưng máy chủ không trả về thông tin tài khoản."
                );
            }

            if (rememberAccount) {
                setRememberedAccounts(
                    saveRememberedAccount(user)
                );
            } else {
                const next = readRememberedAccounts().filter(
                    item => item.username !== getLoginCode(user)
                );

                localStorage.setItem(
                    REMEMBERED_ACCOUNTS_KEY,
                    JSON.stringify(next)
                );
                setRememberedAccounts(next);
            }

            const redirectAfterLogin =
                sessionStorage.getItem("redirectAfterLogin");

            sessionStorage.removeItem("redirectAfterLogin");

            if (
                redirectAfterLogin &&
                redirectAfterLogin !== "/login"
            ) {
                navigate(redirectAfterLogin, { replace: true });
                return;
            }

            navigate(
                homeByRole[user.role] || "/",
                { replace: true }
            );
        } catch (err: unknown) {
            beginLoginTransition();
            clearAuthSession({ bumpEpoch: false });
            finishLoginTransition();

            if (axios.isAxiosError(err)) {
                const responseData = err.response?.data as
                    | { message?: string; error?: string }
                    | undefined;

                setError(
                    responseData?.message ||
                    responseData?.error ||
                    "Mã nhân viên hoặc thông tin đăng nhập không hợp lệ."
                );
            } else {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Không thể đăng nhập. Vui lòng thử lại."
                );
            }
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

    const selectAccount = (account: RememberedAccount) => {
        setUsername(account.username);
        setPassword("");
        setError("");
        setStep("employee-code");
    };

    const removeAccount = (accountUsername: string) => {
        const next = rememberedAccounts.filter(
            item => item.username !== accountUsername
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
                        <span className="login-brand-mark" aria-hidden="true">
                            K
                        </span>
                        <p className="login-company-name">
                            KTC (HANOI) CO., LTD
                        </p>
                    </div>

                    <p className="login-eyebrow">
                        PRODUCTION MANAGEMENT SYSTEM
                    </p>

                    <h1>
                        Dữ liệu sản xuất
                        <br />
                        đúng ngay từ nguồn.
                    </h1>

                    <p className="login-description">
                        Ghi nhận sản lượng, kiểm soát chất lượng và theo dõi
                        trạng thái báo cáo trên một hệ thống thống nhất dành
                        cho nhà máy.
                    </p>

                    <div className="login-benefits">
                        <div>
                            <strong>01</strong>
                            <span>Nhập báo cáo nhanh tại công đoạn</span>
                        </div>
                        <div>
                            <strong>02</strong>
                            <span>Kiểm duyệt và lưu vết minh bạch</span>
                        </div>
                        <div>
                            <strong>03</strong>
                            <span>Tự động tổng hợp Excel và Google Sheet</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="login-panel">
                <div className="login-card">
                    <div className="login-mobile-brand">
                        <span className="login-brand-mark" aria-hidden="true">
                            K
                        </span>
                        <div>
                            <strong>KTC (HANOI) CO., LTD</strong>
                            <small>Đăng nhập hệ thống</small>
                        </div>
                    </div>

                    <div className="login-heading">
                        <div
                            className="login-status-pill"
                            role="status"
                            aria-label="Hệ thống đang hoạt động"
                        >
                            <span
                                className="login-status-dot"
                                aria-hidden="true"
                            />
                            <span className="login-status-text">
                                HỆ THỐNG ĐANG HOẠT ĐỘNG
                            </span>
                        </div>

                        <h2>
                            {step === "employee-code" &&
                                "Nhập mã nhân viên"}
                            {step === "role-choice" &&
                                "Bạn muốn đăng nhập với vai trò nào?"}
                            {step === "management-password" &&
                                "Xác thực tài khoản quản lý"}
                        </h2>

                        <span>
                            {step === "employee-code" &&
                                "Chỉ cần nhập mã nhân viên để tiếp tục."}
                            {step === "role-choice" &&
                                `Tài khoản: ${username.trim()}`}
                            {step === "management-password" &&
                                `Nhập mật khẩu cho tài khoản ${username.trim()}.`}
                        </span>
                    </div>

                    {step === "employee-code" &&
                        rememberedAccounts.length > 0 && (
                            <div className="remembered-section">
                                <div className="remembered-title">
                                    <span>Tài khoản gần đây</span>
                                    <small>
                                        Chọn để điền nhanh mã đăng nhập
                                    </small>
                                </div>

                                <div className="remembered-list">
                                    {matchingAccounts
                                        .slice(0, 3)
                                        .map(account => (
                                            <div
                                                className="remembered-account"
                                                key={account.username}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        selectAccount(account)
                                                    }
                                                >
                                                    <span className="remembered-avatar">
                                                        {(
                                                            account.fullName ||
                                                            account.username
                                                        )
                                                            .charAt(0)
                                                            .toUpperCase()}
                                                    </span>

                                                    <span className="remembered-copy">
                                                        <strong>
                                                            {account.fullName ||
                                                                account.username}
                                                        </strong>
                                                        <small>
                                                            {account.username} ·{" "}
                                                            {roleLabel[account.role]}
                                                        </small>
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    className="remove-remembered"
                                                    onClick={() =>
                                                        removeAccount(
                                                            account.username
                                                        )
                                                    }
                                                    aria-label={`Xóa gợi ý tài khoản ${account.username}`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                    {step === "employee-code" && (
                        <form
                            onSubmit={continueToRoleChoice}
                            className="login-form"
                        >
                            <label>
                                <span>Mã nhân viên</span>

                                <div className="login-input-wrap">
                                    <span
                                        className="login-input-icon"
                                        aria-hidden="true"
                                    >
                                        ♙
                                    </span>

                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="username"
                                        placeholder="Ví dụ: 0599"
                                        value={username}
                                        onChange={event =>
                                            setUsername(event.target.value)
                                        }
                                        disabled={loading}
                                        autoFocus
                                        maxLength={20}
                                    />
                                </div>
                            </label>

                            {error && (
                                <div className="login-error" role="alert">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="login-submit"
                                disabled={loading}
                            >
                                Tiếp tục
                                <span aria-hidden="true">→</span>
                            </button>
                        </form>
                    )}

                    {step === "role-choice" && (
                        <div className="login-role-choice">
                            <button
                                type="button"
                                className="login-role-card login-role-worker"
                                disabled={loading}
                                onClick={() =>
                                    void completeLogin("worker")
                                }
                            >
                                <span
                                    className="login-role-icon"
                                    aria-hidden="true"
                                >
                                    ♙
                                </span>

                                <span>
                                    <strong>Công nhân</strong>
                                    <small>
                                        Vào ngay, không cần mật khẩu
                                    </small>
                                </span>

                                <b aria-hidden="true">→</b>
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
                                <span
                                    className="login-role-icon"
                                    aria-hidden="true"
                                >
                                    ◆
                                </span>

                                <span>
                                    <strong>Quản lý</strong>
                                    <small>
                                        Quản lý, tổ trưởng hoặc quản trị viên
                                    </small>
                                </span>

                                <b aria-hidden="true">→</b>
                            </button>

                            {error && (
                                <div className="login-error" role="alert">
                                    {error}
                                </div>
                            )}

                            {loading && (
                                <div
                                    className="login-loading-line"
                                    role="status"
                                    aria-live="polite"
                                >
                                    <span
                                        className="login-spinner"
                                        aria-hidden="true"
                                    />
                                    Đang đăng nhập...
                                </div>
                            )}

                            <button
                                type="button"
                                className="login-back"
                                onClick={resetToEmployeeCode}
                                disabled={loading}
                            >
                                ← Đổi mã nhân viên
                            </button>
                        </div>
                    )}

                    {step === "management-password" && (
                        <form
                            onSubmit={submitManagementPassword}
                            className="login-form"
                        >
                            <label>
                                <span>Mật khẩu quản lý</span>

                                <div className="login-input-wrap">
                                    <span
                                        className="login-input-icon"
                                        aria-hidden="true"
                                    >
                                        ●
                                    </span>

                                    <input
                                        type={
                                            showPassword
                                                ? "text"
                                                : "password"
                                        }
                                        autoComplete="current-password"
                                        placeholder="Nhập mật khẩu"
                                        value={password}
                                        onChange={event =>
                                            setPassword(event.target.value)
                                        }
                                        disabled={loading}
                                        autoFocus
                                    />

                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() =>
                                            setShowPassword(current => !current)
                                        }
                                        disabled={loading}
                                        aria-label={
                                            showPassword
                                                ? "Ẩn mật khẩu"
                                                : "Hiện mật khẩu"
                                        }
                                    >
                                        {showPassword ? "Ẩn" : "Hiện"}
                                    </button>
                                </div>
                            </label>

                            <label className="remember-checkbox">
                                <input
                                    type="checkbox"
                                    checked={rememberAccount}
                                    onChange={event =>
                                        setRememberAccount(
                                            event.target.checked
                                        )
                                    }
                                    disabled={loading}
                                />
                                <span>
                                    Ghi nhớ mã nhân viên trên thiết bị
                                </span>
                            </label>

                            {error && (
                                <div className="login-error" role="alert">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="login-submit"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span
                                            className="login-spinner"
                                            aria-hidden="true"
                                        />
                                        Đang đăng nhập...
                                    </>
                                ) : (
                                    <>
                                        Đăng nhập quản lý
                                        <span aria-hidden="true">→</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                className="login-back"
                                onClick={() => {
                                    setPassword("");
                                    setError("");
                                    setStep("role-choice");
                                }}
                                disabled={loading}
                            >
                                ← Quay lại chọn vai trò
                            </button>
                        </form>
                    )}

                    <p className="login-security-note">
                        Công nhân đăng nhập bằng mã nhân viên. Tài khoản quản lý
                        vẫn được bảo vệ bằng mật khẩu.
                    </p>
                </div>
            </section>
        </main>
    );
}

export default Login;
