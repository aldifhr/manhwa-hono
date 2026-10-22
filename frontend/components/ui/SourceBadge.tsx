import { sourceBadgeClass } from "@/lib/styles";

interface SourceBadgeProps {
  source: string;
  className?: string;
}

export function SourceBadge({ source, className = "" }: SourceBadgeProps) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded capitalize ${sourceBadgeClass(source ?? "")} ${className}`}>
      {String(source ?? "")}
    </span>
  );
}
