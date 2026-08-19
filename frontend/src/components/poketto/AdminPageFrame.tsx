import type { ReactNode } from "react";
import { WorkerPageFrame } from "./WorkerPageFrame";
export function AdminPageFrame({title,description,actions,children}:{title:string;description?:string;actions?:ReactNode;children:ReactNode}){
 return <div className="poketto-admin-page"><WorkerPageFrame eyebrow="Admin workspace" title={title} description={description} actions={actions}>{children}</WorkerPageFrame></div>;
}
