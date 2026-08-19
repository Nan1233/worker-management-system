import { BarChart3, ClipboardCheck, FileCheck2, UsersRound } from "lucide-react";
export function ManagerKpiStrip({pending="—",approved="—",workers="—",production="—"}:{pending?:string|number;approved?:string|number;workers?:string|number;production?:string|number}){
 const cards=[
  ["Chờ duyệt",pending,ClipboardCheck],
  ["Đã duyệt",approved,FileCheck2],
  ["Nhân sự",workers,UsersRound],
  ["Sản lượng",production,BarChart3],
 ] as const;
 return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,Icon])=><div className="kpi-card" key={label}><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon className="size-4 text-primary"/></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div></div>)}</div>;
}
