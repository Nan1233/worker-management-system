import { ArrowRight, CalendarDays, CheckCircle2, Clock3, FileText, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WorkerPageFrame } from "../../components/poketto/WorkerPageFrame";

const demoRows = [
  { date: "Hôm nay", shift: "Ca 1", process: "Sản xuất", qty: "—", status: "Chờ xử lý" },
  { date: "Hôm qua", shift: "Ca 2", process: "Sản xuất", qty: "—", status: "Đã duyệt" },
];

export default function WorkerHistoryTemplate() {
  const navigate = useNavigate();
  return (
    <WorkerPageFrame
      eyebrow="Production history"
      title="Lịch sử sản xuất"
      description="Theo dõi các báo cáo đã gửi và trạng thái xử lý."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 shadow-sm"><CalendarDays className="size-5 text-primary"/><div className="mt-3 text-sm text-muted-foreground">Khoảng thời gian</div><div className="font-semibold">14 ngày gần nhất</div></div>
        <div className="rounded-xl border bg-card p-4 shadow-sm"><Clock3 className="size-5 text-amber-600"/><div className="mt-3 text-sm text-muted-foreground">Chờ xử lý</div><div className="font-semibold">—</div></div>
        <div className="rounded-xl border bg-card p-4 shadow-sm"><CheckCircle2 className="size-5 text-emerald-600"/><div className="mt-3 text-sm text-muted-foreground">Đã duyệt</div><div className="font-semibold">—</div></div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">Báo cáo gần đây</div>
        <div className="divide-y">
          {demoRows.map((row) => (
            <button key={`${row.date}-${row.shift}`} type="button" onClick={() => navigate("/worker/production-history")}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/50">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><FileText className="size-4"/></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{row.process} · {row.shift}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{row.date} · Sản lượng {row.qty}</span>
              </span>
              <span className="hidden text-xs text-muted-foreground sm:block">{row.status}</span>
              <ArrowRight className="size-4 text-muted-foreground"/>
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <div className="flex gap-2"><XCircle className="mt-0.5 size-4"/> Dữ liệu hiển thị nghiệp vụ vẫn lấy từ API KTC; mẫu trên chỉ là presentation layer; dữ liệu thật lấy từ service/API KTC.</div>
      </div>
    </WorkerPageFrame>
  );
}
