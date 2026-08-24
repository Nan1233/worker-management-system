import { useMemo } from "react";
import { BriefcaseBusiness, Building2, ShieldCheck, UserRound } from "lucide-react";
import { getStoredUser } from "../../utils/authStorage";

const roleLabels: Record<string, string> = {
  admin: "Quản trị viên",
  manager: "Quản lý",
  lead: "Tổ trưởng",
};

export default function ManagementProfile() {
  const user = useMemo(() => getStoredUser(), []);
  const role = String(user?.role || "").toLowerCase();
  const roleLabel = roleLabels[role] || user?.role || "—";
  const displayName = user?.full_name || user?.username || "Người dùng";
  const initial = displayName.trim().charAt(0).toUpperCase() || "K";

  const fields = [
    { label: "Tên đăng nhập", value: user?.username || "—", icon: ShieldCheck },
    { label: "Vai trò", value: roleLabel, icon: BriefcaseBusiness },
    { label: "Mã nhân viên", value: user?.worker_code || "—", icon: UserRound },
    { label: "Bộ phận", value: user?.department || "—", icon: Building2 },
    { label: "Số điện thoại", value: user?.phone || "—", icon: UserRound },
    { label: "Trạng thái", value: "Đang hoạt động", icon: ShieldCheck },
  ];

  return (
    <section className="ktc-page">
      <header className="mb-3 sm:mb-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:text-xs">Tài khoản</div>
        <h1 className="my-1 text-[20px] font-semibold leading-tight text-foreground sm:text-[22px]">Hồ sơ cá nhân</h1>
        <p className="max-w-[34rem] text-[11px] leading-[1.4] text-muted-foreground sm:text-[13px]">Thông tin tài khoản và vai trò đang được sử dụng trong hệ thống KTC.</p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground sm:size-11">
            <span className="text-sm font-bold sm:text-base">{initial}</span>
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-semibold leading-tight sm:text-base">{displayName}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{roleLabel}</p>
          </div>
        </div>

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
      </div>
    </section>
  );
}
