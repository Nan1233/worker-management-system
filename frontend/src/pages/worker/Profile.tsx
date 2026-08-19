import { useEffect, useMemo, useState } from "react";
import { Building2, BriefcaseBusiness, CheckCircle2, Phone, ShieldCheck, UserRound } from "lucide-react";
import { api } from "../../services/api";
import { getStoredUser } from "../../utils/authStorage";
import { WorkerPageFrame } from "../../components/poketto/WorkerPageFrame";

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
  const storedUser = useMemo(() => getStoredUser(), []);
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    <WorkerPageFrame
      eyebrow="Account"
      title="Hồ sơ cá nhân"
      description="Thông tin nhận diện và phân công đang áp dụng cho tài khoản của bạn."
    >
      {error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-4 border-b bg-muted/20 p-5 sm:p-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{profile?.full_name || storedUser?.full_name || "Người dùng"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{displayRole(profile?.role || storedUser?.role)}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 p-5 sm:p-6" aria-busy="true">
            {[1,2,3,4].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
          </div>
        ) : (
          <dl className="grid sm:grid-cols-2">
            {fields.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex min-w-0 gap-3 border-b p-4 last:border-b sm:nth-last-child(-n+2):border-b-0">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </div>
    </WorkerPageFrame>
  );
}
