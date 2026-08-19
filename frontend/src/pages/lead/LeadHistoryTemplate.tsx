import { History } from "lucide-react";
import { LeadPageFrame } from "../../components/poketto/LeadPageFrame";
export default function LeadHistoryTemplate() {
 const Icon=History;
 return <section className="poketto-lead-page"><LeadPageFrame eyebrow="Lead workspace" title="Lịch sử hoạt động" description="Xem hoạt động và báo cáo gần đây của tổ."><div className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5"/></span><div><div className="font-semibold">Khu vực lịch sử hoạt động</div><div className="text-sm text-muted-foreground">UI Poketto đã sẵn sàng; dữ liệu sẽ dùng service/API KTC hiện tại.</div></div></div></div></LeadPageFrame> </section>;
}


