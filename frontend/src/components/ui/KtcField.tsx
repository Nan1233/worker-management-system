import type { InputHTMLAttributes, ReactNode } from "react";

type KtcFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
};

export function KtcField({
  label,
  hint,
  error,
  leading,
  id,
  className = "",
  ...props
}: KtcFieldProps) {
  const inputId = id ?? `ktc-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <label className="ktc-ui-field" htmlFor={inputId}>
      <span className="ktc-ui-field-label">{label}</span>
      <span className="ktc-ui-field-control">
        {leading}
        <input {...props} id={inputId} className={`ktc-ui-input ${className}`.trim()} />
      </span>
      {error ? <span className="ktc-ui-field-error">{error}</span> : hint ? <span className="ktc-ui-field-hint">{hint}</span> : null}
    </label>
  );
}
