"use client";
import { MagnifyingGlass } from "@phosphor-icons/react";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search title…",
  id,
  "data-search-input": dataAttr,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  "data-search-input"?: string;
}) {
  return (
    <div className="relative flex-1">
      <MagnifyingGlass
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50"
      />
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-search-input={dataAttr}
        className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/50 focus:outline-none focus:border-white/30"
      />
    </div>
  );
}

// whitelist variant (compact, surface)
export function CompactSearchInput(props: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex-1 max-w-xs">
      <MagnifyingGlass
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
      />
      <input
        type="text"
        placeholder="Search title..."
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        data-search-input="true"
        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
      />
    </div>
  );
}
