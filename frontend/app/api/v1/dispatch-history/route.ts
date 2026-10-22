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

export async function GET(request: NextRequest) {
  const search = (request.nextUrl.searchParams.get("search") || "")
    .trim()
    .slice(0, 100);
  const page = String(
    Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1),
      1000
    )
  );
  // Clamp page_size (1..1000) to match the backend's validation bound
  // ("page_size must be between 1 and 1000"). Requesting more would 400.
  const pageSize = String(
    Math.min(
      Math.max(Number(request.nextUrl.searchParams.get("page_size")) || 50, 1),
      1000
    )
  );

  try {
    const params = new URLSearchParams({ page, page_size: pageSize });
    if (search) params.set("search", search);

    const res = await fetch(
      `${backendUrl()}/api/v1/dispatch-history?${params}`,
      {
        headers: authHeaders(request),
        signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      }
    );

    let body: Record<string, unknown>;
    try {
      body = await res.json();
    } catch {
      return errorResponse(`Upstream returned non-JSON body`, 502);
    }

    if (!res.ok || !body.success) {
      const msg =
        typeof body.error === "string" ? body.error : `Upstream ${res.status}`;
      return errorResponse(msg, res.status);
    }

    // Normalize backend field casing + rewrite covers so the FE contract
    // ({seriesUrl, titleKey, cover}) holds regardless of backend naming.
    const data = (body.data ?? {}) as Record<string, unknown>;
    const results = (Array.isArray(data.results) ? data.results : []) as Record<
      string,
      unknown
    >[];
    const normalized = results.map((item) => ({
      ...item,
      titleKey: item.titleKey ?? item.title_key ?? null,
      seriesUrl: item.seriesUrl ?? item.series_url ?? null,
      chapterLabel: item.chapterLabel ?? item.chapter_label ?? null,
      canonicalTitleKey:
        item.canonicalTitleKey ?? item.canonical_title_key ?? null,
      isDuplicate: item.isDuplicate ?? item.is_duplicate ?? false,
      cover: rewriteCoverUrl(
        typeof item.cover === "string" ? item.cover : null
      ),
    }));

    return NextResponse.json({
      ...body,
      data: { ...data, results: normalized },
    });
  } catch (err) {
    return catchError(err);
  }
}
