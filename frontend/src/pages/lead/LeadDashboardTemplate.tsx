import { Activity, ArrowRight, ClipboardCheck, Factory, UsersRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LeadPageFrame } from "../../components/poketto/LeadPageFrame";

const cards=[
  {title:"Công nhân trong tổ",text:"Theo dõi nhân sự và trạng thái làm việc",path:"/lead/workers",icon:UsersRound},
  {title:"Báo cáo cần xử lý",text:"Kiểm tra báo cáo sản xuất theo ca",path:"/lead/reports",icon:ClipboardCheck},
  {title:"Sản xuất",text:"Tổng quan sản xuất và máy",path:"/lead/production",icon:Factory},
  {title:"Hoạt động",text:"Xem lịch sử thao tác của tổ",path:"/lead/history",icon:Activity},
];
export default function LeadDashboardTemplate(){
 const navigate=useNavigate();
 return <section className="poketto-lead-page"><LeadPageFrame eyebrow="Lead workspace" title="Tổng quan tổ sản xuất" description="Giao diện giám sát nhanh cho tổ trưởng trên tablet và desktop.">
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(c=>{const Icon=c.icon;return <button key={c.path} type="button" onClick={()=>navigate(c.path)} className="group rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="mb-5 flex items-center justify-between"><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-5"/></span><ArrowRight className="size-4 text-muted-foreground"/></div><div className="font-semibold">{c.title}</div><p className="mt-1 text-sm leading-5 text-muted-foreground">{c.text}</p></button>})}</div>
  <div className="grid gap-4 md:grid-cols-2">
   <div className="rounded-xl border bg-card p-5 shadow-sm"><div className="text-sm font-semibold">KPI ca hiện tại</div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Sản lượng</div><div className="mt-1 text-xl font-semibold">—</div></div><div className="rounded-lg bg-muted/40 p-3"><div className="text-xs text-muted-foreground">NG</div><div className="mt-1 text-xl font-semibold">—</div></div></div></div>
   <div className="rounded-xl border border-dashed p-5"><div className="text-sm font-semibold">Dữ liệu thực</div><p className="mt-1 text-sm text-muted-foreground">Các KPI và danh sách sẽ nối vào API Lead hiện tại, không tạo API mới.</p></div>
  </div>
 </LeadPageFrame> </section>;
}
