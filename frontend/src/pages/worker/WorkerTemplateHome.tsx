import { ArrowRight, ClipboardCheck, Clock3, History, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WorkerPageFrame } from "../../components/poketto/WorkerPageFrame";

const actions = [
  { title: "Nhập báo cáo sản xuất", text: "Tạo báo cáo cho ca hiện tại", path: "/worker/production", icon: ClipboardCheck },
  { title: "Lịch sử sản xuất", text: "Xem các báo cáo đã gửi", path: "/worker/history", icon: History },
  { title: "Thông báo", text: "Theo dõi trạng thái xử lý", path: "/worker/system", icon: ShieldCheck },
];

export default function WorkerTemplateHome() {
  const navigate = useNavigate();
  return (
    <WorkerPageFrame
      eyebrow="KTC Production Control"
      title="Xin chào, sẵn sàng cho ca làm?"
      description="Các thao tác thường dùng được gom vào một màn hình để công nhân thao tác nhanh trên điện thoại."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className="group rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="font-semibold">{item.title}</div>
              <div className="mt-1 text-sm leading-5 text-muted-foreground">{item.text}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Clock3 className="size-4" /></span>
            <div>
              <div className="text-sm font-medium">Ca làm</div>
              <div className="text-sm text-muted-foreground">Chọn ca và công đoạn trong biểu mẫu sản xuất.</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"><ShieldCheck className="size-4" /></span>
            <div>
              <div className="text-sm font-medium">Trạng thái hệ thống</div>
              <div className="text-sm text-muted-foreground">Giao diện Worker đang chạy trên workspace KTC.</div>
            </div>
          </div>
        </div>
      </div>
    </WorkerPageFrame>
  );
}
