import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

export type KtcPageProps={title:string;description?:string;eyebrow?:string;actions?:ReactNode;children:ReactNode};
export function KtcPage({title,description,eyebrow,actions,children}:KtcPageProps){
 return <div className="space-y-5">
  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
   <div className="min-w-0 space-y-1">{eyebrow&&<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description&&<p className="max-w-3xl text-sm text-muted-foreground">{description}</p>}</div>
   {actions&&<div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
  <Separator />{children}
 </div>;
}
export function KtcCard({title,description,actions,children}:{title?:string;description?:string;actions?:ReactNode;children:ReactNode}){
 return <Card>{(title||description||actions)&&<CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0"><div className="min-w-0">{title&&<CardTitle>{title}</CardTitle>}{description&&<CardDescription>{description}</CardDescription>}</div>{actions}</CardHeader>}<CardContent>{children}</CardContent></Card>;
}

