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
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
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
      <header className="mb-2.5 sm:mb-4">
        <div className="text-[10px] text-muted-foreground sm:text-xs">Tài khoản</div>
        <h1 className="my-0.5 text-[18px] font-medium leading-tight sm:my-1 sm:text-[22px]">Hồ sơ cá nhân</h1>
        <p className="max-w-[34rem] text-[11px] leading-[1.35] text-muted-foreground sm:text-[13px] sm:leading-[1.45]">Thông tin nhận diện và phân công đang áp dụng cho tài khoản của bạn.</p>
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[12px] text-destructive sm:rounded-xl sm:p-4 sm:text-sm">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 border-b bg-muted/20 px-3 py-2.5 sm:gap-4 sm:p-5 sm:pb-6">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-12">
            <UserRound className="size-4 sm:size-6" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold leading-tight sm:text-lg">{profile?.full_name || storedUser?.full_name || "Người dùng"}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground sm:mt-1 sm:text-sm">{displayRole(profile?.role || storedUser?.role)}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-1.5 p-3 sm:space-y-3 sm:p-5 sm:pt-6" aria-busy="true">
            {[1,2,3,4].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted sm:h-14" />)}
          </div>
        ) : (
          <dl className="grid sm:grid-cols-2">
            {fields.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex min-w-0 gap-2 border-b px-2.5 py-2 sm:gap-3 sm:p-4 last:border-b sm:nth-last-child(-n+2):border-b-0">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:size-8">
                  <Icon className="size-[13px] sm:size-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-[10px] font-medium leading-tight text-muted-foreground sm:text-xs">{label}</dt>
                  <dd className="mt-0.5 break-words text-[12px] font-semibold leading-tight sm:mt-1 sm:text-sm">{value}</dd>
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
        className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-[11px] font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-4 sm:h-auto sm:rounded-xl sm:py-3.5 sm:text-sm"
      >
        <LogOut className="size-3.5 sm:size-4" />
        <span>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</span>
      </button>
    </section>
  );
}
