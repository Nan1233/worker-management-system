import type { ReactNode } from "react";

type KtcPageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function KtcPageHeader({ title, actions }: KtcPageHeaderProps) {
  return (
    <header className="ktc-ui-page-header">
      <div>
        <h1>{title}</h1>
      </div>
      {actions ? <div className="ktc-ui-page-header-actions">{actions}</div> : null}
    </header>
  );
}
