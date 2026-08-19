import type { ReactNode } from "react";
import { WorkerPageFrame } from "./WorkerPageFrame";

export function ManagerPageFrame({title,description,actions,children}:{title:string;description?:string;actions?:ReactNode;children:ReactNode}){
 return <div className="poketto-manager-page"><WorkerPageFrame eyebrow="Manager workspace" title={title} description={description} actions={actions}>{children}</WorkerPageFrame></div>;
}
