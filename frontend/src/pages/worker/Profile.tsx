import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, BriefcaseBusiness, CheckCircle2, LogOut, Phone, ShieldCheck, UserRound } from "lucide-react";
import { api } from "../../services/api";
import { logout } from "../../services/authService";
import { getStoredUser } from "../../utils/authStorage";

type WorkerProcess = { id: number; code: string; name: string };
type WorkerProfile = {
  worker_id?: number; user_id?: number; worker_code?: string | null; username?: string;
  full_name?: string; role?: string; phone?: string | null; department?: string | null;
  position?: string | null; training_percent?: number | string | null; status?: string;
  processes?: WorkerProcess[]; process_names?: string;
};

function displayRole(role?: string) {
  const labels: Record<string, string> = { admin: "Quản trị viên", manager: "Quản lý", lead: "Tổ trưởng", worker: "Nhân viên" };
  return labels[String(role || "").toLowerCase()] || role || "—";
}

export default function Profile() {
  const navigate = useNavigate();
  const storedUser = useMemo(() => getStoredUser(), []);
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true); setError("");
        if (storedUser?.role === "worker") {
          const response = await api.get("/workers/me");
          if (active) setProfile(response.data?.data || null);
          return;
        }
        if (active) setProfile({
          user_id: storedUser?.id, worker_code: storedUser?.worker_code,
          username: storedUser?.username, full_name: storedUser?.full_name, role: storedUser?.role
        });
      } catch (requestError) {
        console.error("LOAD PROFILE ERROR:", requestError);
        if (active) setError("Không thể tải thông tin tài khoản.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [storedUser]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logout(); } finally { navigate("/login", { replace: true }); }
  };

  const trainingPercent = profile?.training_percent;
  const processNames = profile?.processes?.length
    ? profile.processes.map((item) => item.name || item.code).filter(Boolean).join(", ")
    : profile?.process_names || "—";

  const fields = [
    { label: "Mã nhân viên", value: profile?.worker_code || storedUser?.worker_code || "—", icon: UserRound },
    { label: "Tên đăng nhập", value: profile?.username || storedUser?.username || "—", icon: ShieldCheck },
    { label: "Bộ phận", value: profile?.department || "—", icon: Building2 },
    { label: "Vị trí", value: profile?.position || "—", icon: BriefcaseBusiness },
    { label: "% học việc", value: trainingPercent === null || trainingPercent === undefined || trainingPercent === "" ? "—" : `${Number(trainingPercent)}%`, icon: CheckCircle2 },
    { label: "Trạng thái", value: profile?.status === "inactive" ? "Ngừng hoạt động" : "Đang hoạt động", icon: CheckCircle2 },
    { label: "Công đoạn", value: processNames, icon: BriefcaseBusiness },
    { label: "Số điện thoại", value: profile?.phone || "—", icon: Phone },
  ];

  return (
    <section className="ktc-page">
      <header className="mb-3 sm:mb-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:text-xs">Tài khoản</div>
        <h1 className="my-1 text-[20px] font-semibold leading-tight text-foreground sm:text-[22px]">Hồ sơ cá nhân</h1>
        <p className="max-w-[34rem] text-[11px] leading-[1.4] text-muted-foreground sm:text-[13px]">Thông tin nhận diện và phân công đang áp dụng cho tài khoản của bạn.</p>
      </header>

      {error && <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[12px] text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-11">
            <UserRound className="size-[18px] sm:size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold leading-tight sm:text-base">{profile?.full_name || storedUser?.full_name || "Người dùng"}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{displayRole(profile?.role || storedUser?.role)}</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 sm:gap-3 sm:p-4" aria-busy="true">
            {[1,2,3,4].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-2 sm:gap-3 sm:p-4">
            {fields.map(({ label, value, icon: Icon }) => (
              <div key={label} className="min-w-0 rounded-xl border border-border/60 bg-background/70 p-2.5 sm:p-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground">
                    <Icon className="size-[13px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-[9px] font-medium leading-tight text-muted-foreground sm:text-[10px]">{label}</dt>
                    <dd className="mt-1 break-words text-[11px] font-semibold leading-tight text-foreground sm:text-xs">{value}</dd>
                  </div>
                </div>
              </div>
            ))}
          </dl>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={loggingOut}
        aria-label="Đăng xuất tài khoản"
        className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-[11px] font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-4 sm:h-10"
      >
        <LogOut className="size-3.5" />
        <span>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</span>
      </button>
    </section>
  );
}
