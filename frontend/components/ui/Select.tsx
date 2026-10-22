import { SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  ariaLabel?: string;
}

export function Select({ options, ariaLabel, className = "", ...props }: SelectProps) {
  return (
    <select
      aria-label={ariaLabel}
      className={`px-2.5 py-1.5 text-xs rounded-lg bg-surface border border-border text-text focus:outline-none focus:ring-1 focus:ring-accent transition-colors ${className}`}
      {...props}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
