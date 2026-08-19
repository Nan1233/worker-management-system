import { ArrowLeft, CheckCircle2, ClipboardList, Factory, Info, Send, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WorkerPageFrame } from "../../components/poketto/WorkerPageFrame";

export default function ProductionTemplate() {
  const navigate = useNavigate();

  return (
    <WorkerPageFrame
      eyebrow="Production"
      title="Nhập báo cáo sản xuất"
      description="Giao diện nhập liệu mới theo Poketto. Dữ liệu nghiệp vụ vẫn được xử lý bởi form KTC hiện tại."
      actions={
        <button
          type="button"
          onClick={() => navigate("/worker")}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          <ArrowLeft className="size-4" /> Quay lại
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Quy trình nhập liệu</h2>
              <p className="mt-1 text-sm text-muted-foreground">Chọn đúng thông tin trước khi gửi báo cáo.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["1", "Chọn công đoạn", "Công đoạn được cấp quyền cho tài khoản"],
              ["2", "Chọn máy / sản phẩm", "Dùng master data hiện có của KTC"],
              ["3", "Nhập sản lượng", "OK, NG và thời gian làm việc"],
              ["4", "Kiểm tra & gửi", "Xác nhận trước khi tạo báo cáo"],
            ].map(([step, title, text]) => (
              <div key={step} className="rounded-lg border bg-muted/20 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{step}</span>
                  <span className="font-medium">{title}</span>
                </div>
                <p className="text-sm leading-5 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-dashed p-4">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm leading-6 text-muted-foreground">
                Form nghiệp vụ KTC hiện tại vẫn là nguồn dữ liệu chính. Trang này không thay đổi validation,
                API hoặc quy tắc submit.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/worker/production-entry")}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto sm:px-6"
          >
            <Send className="size-4" /> Mở biểu mẫu sản xuất
          </button>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Factory className="size-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">KTC Production</div>
                <div className="text-xs text-muted-foreground">Worker workspace</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-emerald-600" /> Quy tắc nghiệp vụ được giữ nguyên
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>• Kiểm tra dữ liệu master</li>
              <li>• Kiểm tra OK/NG</li>
              <li>• Kiểm tra thời gian làm việc</li>
              <li>• Chống gửi trùng</li>
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 text-emerald-600" /> UI template migration
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Poketto được dùng cho layout và components; logic sản xuất không bị thay thế.
            </p>
          </div>
        </aside>
      </div>
    </WorkerPageFrame>
  );
}
