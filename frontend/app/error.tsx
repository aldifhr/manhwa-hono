"use client";

import { useEffect } from "react";
import { Warning } from "@phosphor-icons/react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-danger/10 p-4">
        <Warning size={32} className="text-danger" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-text">
          Something went wrong
        </h2>
        <p className="max-w-md text-sm text-text-muted">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="rounded-lg bg-surface border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-hover transition-colors"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
