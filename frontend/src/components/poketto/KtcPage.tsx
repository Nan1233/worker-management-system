import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../poketto-template/ui/card";
import { Separator } from "../../poketto-template/ui/separator";

export function KtcPage({title,description,actions,children}:{title:string;description?:string;actions?:ReactNode;children:ReactNode}){
 return <div className="space-y-5">
   <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
     <div className="min-w-0">
       <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
       {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
     </div>
     {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
   </div>
   <Separator />
   {children}
 </div>;
}
export function KtcCard({title,description,actions,children}:{title?:string;description?:string;actions?:ReactNode;children:ReactNode}){
 return <Card>
   {(title||description||actions) && <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
     <div className="min-w-0">{title&&<CardTitle>{title}</CardTitle>}{description&&<CardDescription>{description}</CardDescription>}</div>
     {actions}
   </CardHeader>}
   <CardContent>{children}</CardContent>
 </Card>;
}
