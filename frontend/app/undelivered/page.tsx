"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/Button";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { ALL_SOURCES, getOriginFlag } from "@/lib/constants";

interface UndeliveredItem {
  title: string;
  titleKey: string;
  chapter: string;
  source: string;
  chapterUrl: string;
  seriesUrl: string;
  cover: string;
  releaseDate: string;
  type: string;
  origin: string;
}

// No 30-day tab: recent_chapters is pruned at 7 days server-side, so it would
// return exactly the same rows as 7 hari while looking like it searched deeper.
const WINDOWS = [
  { hours: 24, label: "24 jam" },
  { hours: 168, label: "7 hari" },
] as const;

export default function UndeliveredPage() {
  const [items, setItems] = useState<UndeliveredItem[]>([]);
  const [skippedSent, setSkippedSent] = useState(0);
  const [maxWindowHours, setMaxWindowHours] = useState(168);
  const [hours, setHours] = useState<number>(168);
  const [source, setSource] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  // urls currently in flight, so a double-click cannot queue twice.
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/undelivered?hours=${hours}&limit=200`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      setItems(json.data.items || []);
      setSkippedSent(json.data.skippedAlreadySent || 0);
      setMaxWindowHours(json.data.maxWindowHours || 168);
      setSent(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = useCallback(async (targets: string[]) => {
    if (targets.length === 0) return;
    setBusy((prev) => {
      const next = new Set(prev);
      for (const t of targets) next.add(t);
      return next;
    });
    try {
      const res = await fetch("/api/v1/undelivered", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterUrls: targets }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      // Remove what the backend actually confirmed. A chapter refused by the
      // dispatch dedupe stays on the list so it is not silently dropped.
      setItems((prev) => prev.filter((i) => !targets.includes(i.chapterUrl)));
      setSent((prev) => {
        const next = new Set(prev);
        for (const t of targets) next.add(t);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal kirim");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        for (const t of targets) next.delete(t);
        return next;
      });
    }
  }, []);

  const filtered = useMemo(
    () => (source === "all" ? items : items.filter((i) => i.source === source)),
    [items, source]
  );

  const bySource = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of items) m[i.source] = (m[i.source] || 0) + 1;
    return m;
  }, [items]);

  const allVisible = filtered.map((i) => i.chapterUrl);
  const anyBusy = allVisible.some((u) => busy.has(u));

  return (
    <PageShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Chapter Terlewat</h1>
          <p className="text-sm text-muted-foreground">
            Chapter langganan yang tidak pernah sampai. Di luar window 24 jam, chapter berhenti
            dikirim dan hilang tanpa catatan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Memuat…" : "Muat ulang"}
          </Button>
          <Button
            size="sm"
            onClick={() => void resend(allVisible)}
            disabled={filtered.length === 0 || anyBusy}
          >
            {anyBusy ? "Mengirim…" : `Kirim semua (${filtered.length})`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              onClick={() => setHours(w.hours)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                hours === w.hours
                  ? "bg-accent text-black"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setSource("all")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              source === "all"
                ? "bg-accent text-black"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            Semua {items.length > 0 && `(${items.length})`}
          </button>
          {ALL_SOURCES.map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                source === s
                  ? "bg-accent text-black"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {s} {bySource[s] ? `(${bySource[s]})` : ""}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Data tersedia {Math.round(maxWindowHours / 24)} hari ke belakang. Chapter yang lebih
        lama dari itu sudah dihapus dan tidak bisa dikembalikan.
      </p>

      {skippedSent > 0 && (
        <p className="text-xs text-muted-foreground">
          {skippedSent} chapter lain disembunyikan — sudah terkirim lewat source lain
          (dedupe FCFS lintas-source).
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border py-12 text-center">
          <p className="text-sm font-medium">
            {items.length === 0 ? "Tidak ada chapter terlewat" : "Tidak ada di filter ini"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {items.length === 0
              ? `Tidak ada yang terlewat dalam ${Math.round(hours / 24)} hari terakhir.`
              : "Coba pilih source lain."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((i) => {
            const isBusy = busy.has(i.chapterUrl);
            const isSent = sent.has(i.chapterUrl);
            const flag = getOriginFlag(i.origin);
            const when = i.releaseDate ? new Date(i.releaseDate) : null;
            return (
              <li key={i.chapterUrl} className="flex items-center gap-3 p-3">
                {i.cover ? (
                  // /api/v1/cover takes ?series=<title_key>, NOT ?url=<upstream>.
                  // Sending url returns 400 "Missing series", and the upstream
                  // host is never exposed to the browser by design (BE-3c).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/v1/cover?series=${encodeURIComponent(i.titleKey)}`}
                    alt=""
                    className="h-14 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {flag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={flag} alt="" className="h-3 w-3" />
                    )}
                    <Link
                      href={i.seriesUrl || i.chapterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {i.title}
                    </Link>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                      ch {i.chapter}
                    </span>
                    <SourceBadge source={i.source} />
                    {when && !Number.isNaN(when.getTime()) && (
                      <span className="text-xs text-muted-foreground">
                        {when.toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isSent ? "ghost" : "primary"}
                  disabled={isBusy || isSent}
                  onClick={() => void resend([i.chapterUrl])}
                >
                  {isBusy ? "…" : isSent ? "Terkirim" : "Kirim"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}