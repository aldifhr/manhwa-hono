export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  backendUrl,
  authHeaders,
  TIMEOUT,
  errorResponse,
  catchError,
} from "@/lib/server-api";
import { rewriteCoverUrl } from "@/lib/utils";
import { excludedTitleSchema } from "@manhwa-scanner/shared";

interface BackendResponse {
  success: boolean;
  data: { results?: unknown[]; total?: number };
  error?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(
      `${backendUrl()}/api/excluded-titles?page_size=10000`,
      {
        headers: authHeaders(request),
        signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      }
    );
    let body: Record<string, unknown>;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    if (!res.ok || !body?.success) {
      const errObj = body as { error?: unknown };
      const msg =
        typeof errObj?.error === "string"
          ? errObj.error
          : `Upstream ${res.status}`;
      return errorResponse(msg, res.status);
    }
    const backendData =
      (body.data as { results?: unknown[]; total?: number }) || {};
    const results = (backendData.results ?? []).map((raw: unknown) => {
      const parsed = excludedTitleSchema.safeParse(raw);
      if (parsed.success) {
        const p = parsed.data;
        return {
          id: p.id,
          titleKey: p.titleKey,
          title: p.title,
          source: p.source,
          createdAt: p.createdAt,
          cover: rewriteCoverUrl(p.cover),
          seriesUrl: p.seriesUrl,
        };
      }
      // Fallback if zod parse fails (e.g. extra fields) — keep raw mapping
      const r = raw as Record<string, unknown>;
      return {
        id:
          (r.id as string) ||
          (r.title_key as string) ||
          (r.titleKey as string) ||
          "",
        titleKey:
          (r.title_key as string) ||
          (r.titleKey as string) ||
          (r.id as string) ||
          "",
        title: (r.title as string | null) || null,
        source: (r.source as string) || "shinigami",
        createdAt:
          (r.created_at as string | null) ||
          (r.createdAt as string | null) ||
          null,
        cover: rewriteCoverUrl((r.cover as string | null) || null),
        seriesUrl:
          (r.series_url as string | null) ||
          (r.seriesUrl as string | null) ||
          null,
      };
    });
    return NextResponse.json({
      success: true,
      data: { results, total: backendData?.total ?? results.length },
    });
  } catch (err) {
    return catchError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const res = await fetch(`${backendUrl()}/api/excluded-titles`, {
      method: "POST",
      headers: { ...authHeaders(request), "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });
    let respBody: unknown;
    try {
      respBody = await res.json();
    } catch {
      respBody = { success: false, error: `Upstream ${res.status}` };
    }
    return NextResponse.json(respBody, { status: res.ok ? 200 : res.status });
  } catch (err) {
    return catchError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    // Normalize: FE may send title_key or titleKey or id, BE expects title_key
    const title_key =
      (raw.title_key as string) ||
      (raw.titleKey as string) ||
      (raw.title as string) ||
      (raw.id as string) ||
      "";
    const source = String((raw.source as string) || "").trim().toLowerCase();
    if (!title_key || !String(title_key).trim()) {
      console.error(
        "[excluded DELETE] missing title_key, raw:",
        JSON.stringify(raw).slice(0, 500)
      );
      return NextResponse.json(
        { success: false, error: "title_key is missing", received: raw },
        { status: 400 }
      );
    }
    if (!source) {
      return NextResponse.json(
        { success: false, error: "source is missing" },
        { status: 400 }
      );
    }
    const normalizedKey = String(title_key)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .trim();
    const payload = {
      title_key: normalizedKey,
      source,
    };
    const res = await fetch(`${backendUrl()}/api/excluded-titles`, {
      method: "DELETE",
      headers: { ...authHeaders(request), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });
    let respBody: unknown;
    try {
      respBody = await res.json();
    } catch {
      respBody = { success: false, error: `Upstream ${res.status}` };
    }
    // If backend reports not_found with curly-quote mismatch, retry with raw key and with id fallback
    const bodyAs = respBody as {
      success?: boolean;
      error?: string;
      status?: string;
    };
    if (
      (!res.ok || bodyAs.success === false) &&
      normalizedKey !== String(title_key).trim()
    ) {
      const retryPayload = {
        title_key: String(title_key).trim(),
        source: payload.source,
      };
      const retryRes = await fetch(`${backendUrl()}/api/excluded-titles`, {
        method: "DELETE",
        headers: {
          ...authHeaders(request),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(retryPayload),
        signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      });
      try {
        const retryBody = await retryRes.json();
        if (
          retryRes.ok &&
          (retryBody as { success?: boolean }).success !== false
        ) {
          return NextResponse.json(retryBody, { status: 200 });
        }
      } catch {}
    }
    return NextResponse.json(respBody, { status: res.ok ? 200 : res.status });
  } catch (err) {
    return catchError(err);
  }
}
