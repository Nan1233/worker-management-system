import type { HTMLAttributes, ReactNode } from "react";

type KtcCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function KtcCard({ className = "", children, ...props }: KtcCardProps) {
  return (
    <section {...props} className={`ktc-ui-card ${className}`.trim()}>
      {children}
    </section>
  );
}
