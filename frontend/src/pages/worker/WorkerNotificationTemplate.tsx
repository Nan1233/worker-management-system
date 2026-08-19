import { Bell, CheckCheck, ChevronRight, Info, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WorkerPageFrame } from "../../components/poketto/WorkerPageFrame";

export default function WorkerNotificationTemplate() {
  const navigate = useNavigate();
  return (
    <WorkerPageFrame eyebrow="Notifications" title="Thông báo" description="Theo dõi phản hồi và trạng thái báo cáo sản xuất.">
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-4">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bell className="size-5"/></span>
          <div className="flex-1"><div className="font-semibold">Trung tâm thông báo</div><div className="text-xs text-muted-foreground">Các thông báo mới sẽ xuất hiện tại đây.</div></div>
          <CheckCheck className="size-4 text-muted-foreground"/>
        </div>
        <div className="divide-y">
          <button type="button" onClick={() => navigate("/worker/notifications")} className="flex w-full gap-3 p-4 text-left hover:bg-accent/50">
            <Info className="mt-0.5 size-4 text-primary"/><span className="flex-1 text-sm"><b>Trạng thái báo cáo</b><span className="block text-xs text-muted-foreground">Mở trang thông báo hiện tại để xem dữ liệu thực.</span></span><ChevronRight className="size-4"/>
          </button>
          <div className="flex gap-3 p-4 text-sm text-muted-foreground"><ShieldAlert className="mt-0.5 size-4"/><span>Presentation layer không thay đổi notification API hoặc unread state.</span></div>
        </div>
      </div>
    </WorkerPageFrame>
  );
}
