"use client";
import Link from "next/link";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";

export function NavItem({
  href,
  label,
  icon: Icon,
  active,
  variant = "desktop",
  onPrefetch,
  onClick,
}: {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  active: boolean;
  variant?: "desktop" | "mobile" | "bottom";
  onPrefetch?: (href: string) => void;
  onClick?: () => void;
}) {
  if (variant === "bottom") {
    return (
      <Link
        href={href}
        onClick={onClick}
        onMouseEnter={() => onPrefetch?.(href)}
        className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-lg transition-colors ${active ? "text-white" : "text-white/50"}`}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={22} weight={active ? "fill" : "regular"} />
        <span className="text-[10px] font-medium">{label}</span>
      </Link>
    );
  }
  if (variant === "mobile") {
    return (
      <Link
        href={href}
        onClick={onClick}
        onMouseEnter={() => onPrefetch?.(href)}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors border ${active ? "bg-white text-black border-transparent shadow-[0_2px_10px_rgba(255,255,255,0.08)]" : "text-white/60 hover:text-white hover:bg-white/5 border-transparent"}`}
        aria-current={active ? "page" : undefined}
      >
        <Icon size={20} weight={active ? "fill" : "regular"} />
        {label}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      onClick={onClick}
      onMouseEnter={() => onPrefetch?.(href)}
      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors border ${active ? "bg-white text-black border-transparent shadow-[0_2px_10px_rgba(255,255,255,0.08)]" : "text-white/60 hover:text-white hover:bg-white/5 border-transparent hover:border-white/10"}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={15} weight={active ? "fill" : "regular"} />
      {label}
    </Link>
  );
}
