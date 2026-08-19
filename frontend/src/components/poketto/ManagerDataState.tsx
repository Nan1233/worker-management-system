import type { ReactNode } from "react";
export function ManagerDataState({loading,error,empty,children,emptyText="Chưa có dữ liệu."}:{loading?:boolean;error?:string|null;empty?:boolean;children:ReactNode;emptyText?:string}){
 if(loading)return <div className="space-y-3" aria-busy="true">{[1,2,3].map(i=><div key={i} className="h-20 animate-pulse rounded-xl bg-muted"/>)}</div>;
 if(error)return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</div>;
 if(empty)return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyText}</div>;
 return <>{children}</>;
}
