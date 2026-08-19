import type { ReactNode } from "react";
import { KtcPage, KtcCard } from "./KtcPage";

export function WorkerPage({title,description,actions,children}:{title:string;description?:string;actions?:ReactNode;children:ReactNode}){
  return <KtcPage eyebrow="Worker" title={title} description={description} actions={actions}>{children}</KtcPage>;
}
export function WorkerSection({title,description,children}:{title?:string;description?:string;children:ReactNode}){
  return <KtcCard title={title} description={description}>{children}</KtcCard>;
}
