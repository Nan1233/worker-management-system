import { Database, ShieldCheck, UsersRound, Settings2 } from "lucide-react";
export function AdminKpiStrip({users="—",roles="—",master="—",system="—"}:{users?:string|number;roles?:string|number;master?:string|number;system?:string|number}){
 const cards=[["Người dùng",users,UsersRound],["Vai trò & quyền",roles,ShieldCheck],["Dữ liệu chuẩn",master,Database],["Hệ thống",system,Settings2]] as const;
 return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,Icon])=><div className="kpi-card" key={label}><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon className="size-4 text-primary"/></div><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div></div>)}</div>;
}
