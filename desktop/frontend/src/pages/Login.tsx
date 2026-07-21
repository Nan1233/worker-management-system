import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { login } from "../services/authService";
import type { User, UserRole } from "../types/auth";
import "./Login.css";

interface RememberedAccount {
    username: string;
    fullName: string;
    role: UserRole;
    lastUsedAt: string;
}

const REMEMBERED_ACCOUNTS_KEY = "ktc_remembered_accounts";

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
        const value = JSON.parse(localStorage.getItem(REMEMBERED_ACCOUNTS_KEY) || "[]");
        return Array.isArray(value) ? value.slice(0, 5) : [];
    } catch {
        return [];
    }
};

const saveRememberedAccount = (user: User) => {
    const next: RememberedAccount[] = [
        {
            username: user.username,
            fullName: user.full_name,
            role: user.role,
            lastUsedAt: new Date().toISOString()
        },
        ...readRememberedAccounts().filter((item) => item.username !== user.username)
    ].slice(0, 5);

    localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(next));
};

function Login() {
    const navigate = useNavigate();
    const initialAccounts = useMemo(() => readRememberedAccounts(), []);
    const [username, setUsername] = useState(() => initialAccounts[0]?.username || "");
    const [password, setPassword] = useState("");
    const [rememberAccount, setRememberAccount] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [rememberedAccounts, setRememberedAccounts] = useState<RememberedAccount[]>(initialAccounts);

    useEffect(() => {
        const token = localStorage.getItem("token");
        const savedUser = localStorage.getItem("user");

        if (token && savedUser) {
            try {
                const user = JSON.parse(savedUser) as User;
                navigate(homeByRole[user.role], { replace: true });
                return;
            } catch {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
            }
        }

    }, [navigate]);

    const matchingAccounts = useMemo(() => {
        const keyword = username.trim().toLowerCase();
        if (!keyword) return rememberedAccounts;

        return rememberedAccounts.filter((item) =>
            item.username.toLowerCase().includes(keyword)
            || item.fullName.toLowerCase().includes(keyword)
        );
    }, [rememberedAccounts, username]);

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        if (loading) return;

        const normalizedUsername = username.trim();
        if (!normalizedUsername || !password) {
            setError("Vui lòng nhập đầy đủ mã nhân viên và mật khẩu.");
            return;
        }

        setError("");
        setLoading(true);

        try {
            const data = await login(normalizedUsername, password);

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            if (window.ktcDesktop?.isDesktop) {
                await window.ktcDesktop.configureAutoSync(data.token);
            }

            if (rememberAccount) {
                saveRememberedAccount(data.user);
            } else {
                const next = readRememberedAccounts().filter(
                    (item) => item.username !== data.user.username
                );
                localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(next));
            }

            navigate(homeByRole[data.user.role], { replace: true });
        } catch (err: unknown) {
            setError(
                axios.isAxiosError(err)
                    ? err.response?.data?.message || "Mã nhân viên hoặc mật khẩu không đúng."
                    : "Không thể đăng nhập. Vui lòng thử lại."
            );
        } finally {
            setLoading(false);
        }
    };

    const selectAccount = (account: RememberedAccount) => {
        setUsername(account.username);
        setPassword("");
        setError("");
    };

    const removeAccount = (accountUsername: string) => {
        const next = rememberedAccounts.filter((item) => item.username !== accountUsername);
        localStorage.setItem(REMEMBERED_ACCOUNTS_KEY, JSON.stringify(next));
        setRememberedAccounts(next);
        if (username === accountUsername) setUsername("");
    };

    return (
        <main className="login-page">
            <section className="login-showcase">
                <div className="login-showcase-inner">
                    <div className="login-logo"><span>KTC</span></div>
                    <p className="login-eyebrow">KTC PRODUCTION MANAGEMENT</p>
                    <h1>Dữ liệu sản xuất<br />đúng ngay từ nguồn.</h1>
                    <p className="login-description">
                        Ghi nhận sản lượng, kiểm soát chất lượng và theo dõi trạng thái báo cáo
                        trên một hệ thống thống nhất dành cho nhà máy.
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
                        <span>KTC</span>
                        <div><strong>Quản lý sản xuất</strong><small>Đăng nhập hệ thống</small></div>
                    </div>

                    <div className="login-heading">
                        <span className="login-status-dot" />
                        <p>HỆ THỐNG ĐANG HOẠT ĐỘNG</p>
                        <h2>Chào mừng bạn trở lại</h2>
                        <span>Đăng nhập bằng mã nhân viên được cấp.</span>
                    </div>

                    {rememberedAccounts.length > 0 && (
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
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="login-form">
                        <label>
                            <span>Mã nhân viên / Tên đăng nhập</span>
                            <div className="login-input-wrap">
                                <span className="login-input-icon">♙</span>
                                <input
                                    type="text"
                                    autoComplete="username"
                                    placeholder="Ví dụ: 0599"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    disabled={loading}
                                    autoFocus
                                />
                            </div>
                        </label>

                        <label>
                            <span>Mật khẩu</span>
                            <div className="login-input-wrap">
                                <span className="login-input-icon">●</span>
                                <input
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
                                >
                                    {showPassword ? "Ẩn" : "Hiện"}
                                </button>
                            </div>
                        </label>

                        <label className="remember-checkbox">
                            <input
                                type="checkbox"
                                checked={rememberAccount}
                                onChange={(event) => setRememberAccount(event.target.checked)}
                            />
                            <span>Ghi nhớ và gợi ý tài khoản này trên thiết bị</span>
                        </label>

                        {error && <div className="login-error" role="alert">{error}</div>}

                        <button type="submit" className="login-submit" disabled={loading}>
                            {loading ? <><span className="login-spinner" /> Đang đăng nhập...</> : <>Đăng nhập <span>→</span></>}
                        </button>
                    </form>

                    <p className="login-security-note">
                        Không lưu mật khẩu. Chỉ lưu mã nhân viên và tên hiển thị để gợi ý lần sau.
                    </p>
                </div>
            </section>
        </main>
    );
}

export default Login;
