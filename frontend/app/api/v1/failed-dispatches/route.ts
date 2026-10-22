export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { backendUrl, authHeaders, TIMEOUT, errorResponse, catchError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") || "20";
  const offset = request.nextUrl.searchParams.get("offset") || "0";
  const source = request.nextUrl.searchParams.get("source") || "";
  const params = new URLSearchParams({ limit, offset });
  if (source) params.set("source", source);
  try {
    const res = await fetch(`${backendUrl()}/api/v1/failed-dispatches?${params}`, {
      headers: authHeaders(request as unknown as Request),
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ success: false, error: `Upstream ${res.status}` }));
    return NextResponse.json(body, { status: res.ok ? 200 : res.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return catchError(err);
  }
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action") || "";
  const body = await request.text();
  try {
    const res = await fetch(`${backendUrl()}/api/v1/failed-dispatches?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { ...authHeaders(request as unknown as Request), "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });
    const data = await res.json().catch(() => ({ success: false }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return catchError(err);
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") || request.nextUrl.searchParams.get("chapter_url") || "";
  const body = await request.text().catch(() => "");
  const target = id ? `${backendUrl()}/api/v1/failed-dispatches?id=${encodeURIComponent(id)}` : `${backendUrl()}/api/v1/failed-dispatches`;
  try {
    const res = await fetch(target, {
      method: "DELETE",
      headers: { ...authHeaders(request as unknown as Request), "Content-Type": "application/json" },
      body: body || undefined,
      signal: AbortSignal.timeout(TIMEOUT.DEFAULT),
    });
    const data = await res.json().catch(() => ({ success: true }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return catchError(err);
  }
}
