import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useNavigate } from "react-router-dom";

import axios from "axios";

import { login } from "../services/authService";

import { beginLoginTransition, finishLoginTransition } from "../services/api";

import { clearAuthSession, clearCurrentTabAuthSession } from "../utils/authStorage";

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
        <main className="min-h-svh bg-background">
            <div className="container relative grid min-h-svh items-center justify-center py-6">
                <div className="w-full max-w-md">
                    <div className="mb-6 flex items-center justify-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">K</span>
                        <div className="grid leading-tight">
                            <span className="text-sm font-semibold">KTC (HANOI) CO., LTD</span>
                            <span className="text-xs text-muted-foreground">Production Management System</span>
                        </div>
                    </div>
                    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
                        <div className="p-6 sm:p-8">
                            <div className="mb-6 text-center">
                                <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground">
                                    <span className="size-1.5 rounded-full bg-emerald-500"/> HỆ THỐNG ĐANG HOẠT ĐỘNG
                                </div>
                                <h1 className="text-2xl font-bold tracking-tight">
                                    {step==="employee-code"&&"Nhập mã nhân viên"}
                                    {step==="role-choice"&&"Chọn vai trò đăng nhập"}
                                    {step==="management-password"&&"Xác thực tài khoản quản lý"}
                                </h1>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    {step==="employee-code"&&"Nhập mã nhân viên để tiếp tục."}
                                    {step==="role-choice"&&`Tài khoản: ${username.trim()}`}
                                    {step==="management-password"&&`Nhập mật khẩu cho ${username.trim()}.`}
                                </p>
                            </div>

                            {step==="employee-code" && rememberedAccounts.length>0 && (
                                <div className="mb-5 space-y-2 border-b pb-5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold">Tài khoản gần đây</span>
                                        <span className="text-muted-foreground">Chọn để điền nhanh</span>
                                    </div>
                                    {matchingAccounts.slice(0,3).map(account=>(
                                        <div key={account.username} className="flex items-center gap-2 rounded-lg border p-2">
                                            <button type="button" onClick={()=>selectAccount(account)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">{account.fullName.slice(0,2).toUpperCase()}</span>
                                                <span className="min-w-0"><span className="block truncate text-sm font-medium">{account.fullName}</span><span className="block truncate text-xs text-muted-foreground">{account.username}</span></span>
                                            </button>
                                            <button type="button" onClick={()=>removeAccount(account.username)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">×</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {step==="employee-code" && (
                                <form onSubmit={continueToRoleChoice} className="grid gap-5">
                                    <label className="grid gap-2 text-sm font-medium">
                                        Mã nhân viên
                                        <input value={username} onChange={e=>{setUsername(e.target.value);setError("");}} autoComplete="username" disabled={loading} placeholder="Nhập mã nhân viên" className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"/>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={rememberAccount} onChange={e=>setRememberAccount(e.target.checked)} className="size-4"/> Ghi nhớ tài khoản trên thiết bị</label>
                                    {error&&<div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
                                    <button type="submit" disabled={loading} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 disabled:opacity-50">Tiếp tục</button>
                                </form>
                            )}

                            {step==="role-choice" && (
                                <div className="grid gap-3">
                                    <button type="button" onClick={()=>void completeLogin("worker")} disabled={loading} className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"><span className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg">👷</span><span className="min-w-0"><b className="block text-sm">Công nhân</b><span className="text-xs text-muted-foreground">Nhập báo cáo sản xuất</span></span></button>
                                    <button type="button" onClick={()=>{setError("");setStep("management-password");}} disabled={loading} className="flex items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"><span className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg">▣</span><span className="min-w-0"><b className="block text-sm">Quản lý / Tổ trưởng</b><span className="text-xs text-muted-foreground">Kiểm duyệt và quản lý dữ liệu</span></span></button>
                                    {error&&<div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
                                    <button type="button" onClick={resetToEmployeeCode} className="text-left text-xs font-medium text-muted-foreground hover:text-foreground">← Đổi mã nhân viên</button>
                                </div>
                            )}

                            {step==="management-password" && (
                                <form onSubmit={submitManagementPassword} className="grid gap-5">
                                    <label className="grid gap-2 text-sm font-medium">
                                        Mật khẩu quản lý
                                        <input value={password} onChange={e=>{setPassword(e.target.value);setError("");}} type={showPassword?"text":"password"} autoComplete="current-password" disabled={loading} placeholder="Nhập mật khẩu" className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"/>
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)} className="size-4"/> Hiện mật khẩu</label>
                                    {error&&<div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
                                    <button type="submit" disabled={loading} className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:opacity-90 disabled:opacity-50">{loading?"Đang xác thực…":"Đăng nhập"}</button>
                                    <button type="button" onClick={resetToEmployeeCode} className="text-left text-xs font-medium text-muted-foreground hover:text-foreground">← Quay lại</button>
                                </form>
                            )}
                            <p className="mt-6 text-center text-xs text-muted-foreground">KTC Production Control · Bảo mật nội bộ</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
