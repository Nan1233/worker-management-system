import type { ButtonHTMLAttributes, ReactNode } from "react";

export type KtcButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type KtcButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: KtcButtonVariant;
  children: ReactNode;
};

export function KtcButton({
  variant = "secondary",
  className = "",
  children,
  ...props
}: KtcButtonProps) {
  return (
    <button
      {...props}
      className={`ktc-ui-button ktc-ui-button-${variant} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
