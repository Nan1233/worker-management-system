import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  children: ReactNode;
};

export function WorkerDataBridge({ title, description, loading, error, empty, children }: Props) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <div className="font-semibold">{title}</div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
    );
  }
  return <>{children}</>;
}
