import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword, logout } from "../../services/authService";
import { getApiError } from "../../utils/apiError";

const MIN_LENGTH = 8;

/**
 * "Đổi mật khẩu" for admin / manager / lead. Workers sign in with their code only,
 * so the card renders nothing for them. After a successful change the server revokes
 * all sessions and the user signs in again with the new password.
 */
export default function ChangePasswordCard({ role }: { role?: string }) {
    const navigate = useNavigate();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    if (!role || String(role).toLowerCase() === "worker") return null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setError("");
        if (!current || !next || !confirm) return setError("Vui lòng nhập đủ mật khẩu hiện tại, mật khẩu mới và xác nhận.");
        if (next.length < MIN_LENGTH) return setError(`Mật khẩu mới tối thiểu ${MIN_LENGTH} ký tự.`);
        if (next !== confirm) return setError("Mật khẩu mới và phần xác nhận không khớp.");
        if (next === current) return setError("Mật khẩu mới phải khác mật khẩu hiện tại.");
        setBusy(true);
        try {
            await changePassword({ currentPassword: current, newPassword: next, confirmPassword: confirm });
            setDone(true);
            window.setTimeout(() => { void logout().finally(() => navigate("/login", { replace: true })); }, 1500);
        } catch (err) {
            setError(getApiError(err, "Không thể đổi mật khẩu").message);
        } finally {
            setBusy(false);
        }
    };

    const field = (id: string, label: string, value: string, set: (v: string) => void, autoComplete: string) => (
        <label htmlFor={id} style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
            {label}
            <input
                id={id}
                type="password"
                value={value}
                autoComplete={autoComplete}
                disabled={busy || done}
                onChange={(event) => set(event.target.value)}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 8, border: "1px solid #c9d6ea", fontSize: 16 }}
            />
        </label>
    );

    return (
        <form onSubmit={(event) => void submit(event)} data-testid="change-password-card" style={{ marginTop: 12, padding: 16, borderRadius: 16, border: "1px solid #dbe5f2", background: "#fff", display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Đổi mật khẩu</h2>
            {field("currentPassword", "Mật khẩu hiện tại", current, setCurrent, "current-password")}
            {field("newPassword", `Mật khẩu mới (tối thiểu ${MIN_LENGTH} ký tự)`, next, setNext, "new-password")}
            {field("confirmPassword", "Nhập lại mật khẩu mới", confirm, setConfirm, "new-password")}
            {error && <div role="alert" style={{ color: "#b42318", fontSize: 13 }}>{error}</div>}
            {done && <div role="status" style={{ color: "#067647", fontSize: 13 }}>Đổi mật khẩu thành công. Đang đăng xuất để bạn đăng nhập lại…</div>}
            <button type="submit" disabled={busy || done} style={{ minHeight: 44, borderRadius: 8, border: 0, background: "#174ea6", color: "#fff", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
                {busy ? "Đang đổi mật khẩu…" : "Đổi mật khẩu"}
            </button>
        </form>
    );
}
