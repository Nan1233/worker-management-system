import type { ReactNode } from "react";
export function KtcGrid({children,className=""}:{children:ReactNode;className?:string}){return <div className={`grid gap-4 ${className}`}>{children}</div>}
