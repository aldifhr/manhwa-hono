"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { rewriteCoverUrl, decodeHtml } from "@/lib/utils";
import { BookOpen } from "@phosphor-icons/react";

interface CoverProps {
  src: string | null | undefined;
  alt: string;
  titleKey?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  withRetry?: boolean; // shinigami fallback via /api/reader/cover?series=
}

const sizeClass: Record<NonNullable<CoverProps["size"]>, string> = {
  sm: "w-16 sm:w-20 h-24 sm:h-28",
  md: "w-20 h-28",
  lg: "w-full aspect-3/4",
  // B visual-first
  xl: "w-24 sm:w-28 h-36 sm:h-40",
};

export function Cover({
  src,
  alt,
  titleKey,
  size = "md",
  className,
  withRetry = false,
}: CoverProps) {
  const [imgError, setImgError] = useState(false);
  const [hasRetried, setHasRetried] = useState(false);
  const [coverSrc, setCoverSrc] = useState(() => rewriteCoverUrl(src));
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    setCoverSrc(rewriteCoverUrl(src));
    setImgError(false);
    setHasRetried(false);
    setImgLoaded(false);
  }, [src]);

  const handleError = async () => {
    if (!hasRetried && titleKey) {
      // Try refresh-cover first — fetches fresh presigned URL from source API
      try {
        const r = await fetch(`/api/v1/reader/refresh-cover?series=${encodeURIComponent(titleKey)}`);
        if (r.ok) {
          const d = await r.json();
          if (d.success && d.cover) {
            setCoverSrc(rewriteCoverUrl(d.cover) || d.cover);
            setHasRetried(true);
            return;
          }
        }
      } catch {}
      // Fallback to cover endpoint
      setCoverSrc(`/api/v1/reader/cover?series=${encodeURIComponent(titleKey)}`);
      setHasRetried(true);
    } else setImgError(true);
  };

  if (!src || imgError) {
    return (
      <div
        className={cn(
          sizeClass[size],
          "rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center",
          className
        )}
      >
        <BookOpen size={22} className="text-white/25" />
      </div>
    );
  }

  return (
    <img
      src={coverSrc || ""}
      alt={decodeHtml(alt)}
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      onError={handleError}
      onLoad={() => setImgLoaded(true)}
      className={cn(
        sizeClass[size],
        "object-cover rounded-lg bg-white/5 ring-1 ring-white/10 transition-all duration-500",
        imgLoaded ? "blur-0 scale-100" : "blur-md scale-105",
        "group-hover:scale-[1.02]",
        className
      )}
    />
  );
}
