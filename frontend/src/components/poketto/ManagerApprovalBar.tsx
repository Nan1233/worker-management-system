import type { ReactNode } from "react";
export function ManagerApprovalBar({selectionCount=0,children}:{selectionCount?:number;children?:ReactNode}){
 return <div className="action-bar rounded-xl border bg-card p-3 shadow-sm"><div className="mr-auto text-sm font-medium">{selectionCount>0?`${selectionCount} báo cáo được chọn`:"Chưa chọn báo cáo"}</div>{children}</div>;
}
