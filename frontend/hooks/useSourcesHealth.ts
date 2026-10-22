"use client";
import { useQuery } from "@tanstack/react-query";

type HealthRow = { source: string; status: string };

async function fetchHealth(): Promise<Record<string, string>> {
  const r = await fetch("/api/v1/sources/health", { cache: "no-store", credentials: "include" });
  if (!r.ok) return {};
  const j = await r.json().catch(() => null);
  const arr: HealthRow[] = j?.data ?? j?.sources ?? [];
  const map: Record<string, string> = {};
  for (const row of arr) {
    if (row.source) map[row.source.toLowerCase()] = String(row.status || "").toLowerCase();
  }
  // fallback for object shape {shinigami: {status}}
  if (!arr.length && j?.data && typeof j.data === "object") {
    for (const [k, v] of Object.entries(j.data as Record<string, any>)) {
      if (v?.status) map[k.toLowerCase()] = String(v.status).toLowerCase();
    }
  }
  return map;
}

export function useSourcesHealth() {
  const { data } = useQuery({
    queryKey: ["sources-health-dot"],
    queryFn: fetchHealth,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  return data ?? {};
}

export function isHealthy(status?: string) {
  if (!status) return true; // unknown -> assume healthy (no dot)
  return status === "healthy" || status === "ok" || status === "up";
}
