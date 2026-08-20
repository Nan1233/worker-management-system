import type { HTMLAttributes, ReactNode } from "react";

export type KtcBadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

type KtcBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: KtcBadgeTone;
  children: ReactNode;
};

export function KtcBadge({
  tone = "neutral",
  className = "",
  children,
  ...props
}: KtcBadgeProps) {
  return (
    <span
      {...props}
      className={`ktc-ui-badge ktc-ui-badge-${tone} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
