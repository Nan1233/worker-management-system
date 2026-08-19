import { UsersRound } from "lucide-react";
import { LeadPageFrame } from "../../components/poketto/LeadPageFrame";
export default function LeadWorkersTemplate() {
 const Icon=UsersRound;
 return <section className="poketto-lead-page"><LeadPageFrame eyebrow="Lead workspace" title="Công nhân trong tổ" description="Danh sách nhân sự, trạng thái và phân công."><div className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5"/></span><div><div className="font-semibold">Khu vực công nhân trong tổ</div><div className="text-sm text-muted-foreground">UI Poketto đã sẵn sàng; dữ liệu sẽ dùng service/API KTC hiện tại.</div></div></div></div></LeadPageFrame> </section>;
}
