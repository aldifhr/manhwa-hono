"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  function handleReset() {
    // global-error tidak punya QueryClient context, cukup hard reload
    // reset() saja tidak cukup karena Router cache + fetch memo tetap error
    window.location.reload();
    try { reset(); } catch {}
  }
  return (
    <html lang="id">
      <body className="min-h-dvh bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-white/60 max-w-md mb-6 text-sm">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={handleReset}
          className="px-5 py-2 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
