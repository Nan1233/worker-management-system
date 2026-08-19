import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function WorkerPageFrame({ eyebrow, title, description, actions, children }: Props) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
