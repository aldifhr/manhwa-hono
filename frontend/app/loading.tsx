export default function Loading() {
  // Note: use `absolute` not `fixed` — Next's layout-router skips auto-scroll
  // when a `fixed`/`sticky` top bar exists (see console warning). `absolute`
  // at viewport top during suspense avoids that.
  return (
    <div className="absolute top-0 left-0 right-0 z-100 h-0.5 bg-transparent pointer-events-none overflow-hidden">
      <div className="h-full w-1/2 bg-linear-to-r from-transparent via-accent to-transparent animate-loading-bar" />
    </div>
  );
}
