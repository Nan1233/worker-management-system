import type { ReactNode } from "react";

type Props = {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  children: ReactNode;
  emptyText?: string;
};

export function LeadDataState({ loading, error, empty, children, emptyText="Chưa có dữ liệu." }: Props) {
  if (loading) return <div className="space-y-3" aria-busy="true">{[1,2,3].map(i=><div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>;
  if (error) return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error}</div>;
  if (empty) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyText}</div>;
  return <>{children}</>;
}
