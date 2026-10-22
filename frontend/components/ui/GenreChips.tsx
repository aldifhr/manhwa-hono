"use client";

export function GenreChips({
  genres,
  limit = 3,
}: {
  genres?: string[] | null;
  limit?: number;
}) {
  if (!genres || genres.length === 0) return null;
  return (
    <span className="text-[10px] text-white/50 truncate">
      {genres
        .slice(0, limit)
        .map((g) => g.charAt(0).toUpperCase() + g.slice(1))
        .join(" · ")}
      {genres.length > limit ? ` +${genres.length - limit}` : ""}
    </span>
  );
}

// whitelist variant (surface)
export function GenrePills({ genres }: { genres?: string[] | null }) {
  if (!genres || genres.length === 0) return null;
  return (
    <>
      {genres.slice(0, 3).map((g) => (
        <span
          key={g}
          className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-surface-hover text-text-muted line-clamp-1 max-w-20"
        >
          {g}
        </span>
      ))}
    </>
  );
}
