import { ClipboardCheck } from "lucide-react";
import { LeadPageFrame } from "../../components/poketto/LeadPageFrame";
export default function LeadReportsTemplate() {
 const Icon=ClipboardCheck;
 return <section className="poketto-lead-page"><LeadPageFrame eyebrow="Lead workspace" title="Báo cáo sản xuất" description="Theo dõi báo cáo theo ca và trạng thái xử lý."><div className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5"/></span><div><div className="font-semibold">Khu vực báo cáo sản xuất</div><div className="text-sm text-muted-foreground">UI Poketto đã sẵn sàng; dữ liệu sẽ dùng service/API KTC hiện tại.</div></div></div></div></LeadPageFrame> </section>;
}
