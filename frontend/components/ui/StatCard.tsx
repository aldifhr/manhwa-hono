import type React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  iconComponent?: React.ComponentType<{size?: number; className?: string}>;
  iconSize?: number;
  className?: string;
}

export default function StatCard({
  label,
  value,
  sub,
  color,
  icon,
  iconComponent: IconComponent,
  iconSize = 16,
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`rounded-xl bg-surface border border-border p-5 flex flex-col gap-1 transition-colors hover:border-border-hover ${className}`}
    >
      <div className="flex items-center gap-2">
        {IconComponent ? (
          <IconComponent size={iconSize} className="text-text-muted" />
        ) : icon ? (
          <span className="text-text-muted">{icon}</span>
        ) : null}
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {label}
        </p>
      </div>
      <p
        className="text-3xl font-bold tabular-nums leading-tight"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
