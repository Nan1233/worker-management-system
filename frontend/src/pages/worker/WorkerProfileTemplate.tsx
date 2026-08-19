import { LogOut, UserRound, ShieldCheck, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WorkerPageFrame } from "../../components/poketto/WorkerPageFrame";
import { logout } from "../../services/authService";

export default function WorkerProfileTemplate() {
  const navigate = useNavigate();
  const handleLogout = () => { void logout(); navigate("/login", { replace: true }); };
  return (
    <WorkerPageFrame eyebrow="Account" title="Tài khoản" description="Thông tin tài khoản và phiên làm việc.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="size-5"/></span>
            <div><div className="font-semibold">Tài khoản công nhân</div><div className="text-sm text-muted-foreground">Thông tin được lấy theo phiên KTC hiện tại.</div></div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3"><ShieldCheck className="size-5 text-emerald-600"/><div><div className="font-semibold">Quyền truy cập</div><div className="text-sm text-muted-foreground">Permission hiện tại được giữ nguyên.</div></div></div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3"><Smartphone className="size-5 text-primary"/><div><div className="font-semibold">Thiết bị</div><div className="text-sm text-muted-foreground">Giao diện responsive cho điện thoại và tablet.</div></div></div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <button type="button" onClick={handleLogout} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"><LogOut className="size-4"/> Đăng xuất</button>
        </div>
      </div>
    </WorkerPageFrame>
  );
}
