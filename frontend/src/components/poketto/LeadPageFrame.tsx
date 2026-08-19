import type { ReactNode } from "react";
import { WorkerPageFrame } from "./WorkerPageFrame";

export function LeadPageFrame({ eyebrow="Lead workspace", title, description, children }: {
  eyebrow?: string; title: string; description?: string; children: ReactNode;
}) {
  return (
    <div className="poketto-lead-page">
      <WorkerPageFrame eyebrow={eyebrow} title={title} description={description}>
        {children}
      </WorkerPageFrame>
    </div>
  );
}
