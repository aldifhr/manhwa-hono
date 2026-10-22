/**
 * Deep module Whitelist (server) — single seam for whitelist mutations.
 * Route handlers stay thin (10 lines), testable via injected fetch.
 */
import { backendUrl, authHeaders, TIMEOUT, catchError, hashSession } from "@/lib/server-api";
import { readSessionCookie } from "@/lib/cookies";
import { clearCachesForSession } from "@/lib/cache";
import { NextResponse } from "next/server";

function clearForRequest(request: Request): void {
  const raw = readSessionCookie(request.headers.get("cookie") || "") || "anon";
  clearCachesForSession(hashSession(raw));
}

export async function handleWhitelistDelete(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const res = await fetch(`${backendUrl()}/api/whitelist`, {
      method: "DELETE",
      headers: { ...authHeaders(request), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT.WHITELIST),
      cache: "no-store",
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { success: res.ok, error: `Upstream ${res.status}` };
    }
    const bodyOk = (data as { success?: boolean })?.success !== false;
    const statusOk = (data as { status?: string })?.status === "ok";
    if (res.ok && (bodyOk || statusOk)) clearForRequest(request);
    if (res.ok && !bodyOk && !statusOk) {
      return NextResponse.json(data, { status: 400 });
    }
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (err) {
    return catchError(err);
  }
}

export async function handleWhitelistPost(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const res = await fetch(`${backendUrl()}/api/whitelist`, {
      method: "POST",
      headers: { ...authHeaders(request), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT.WHITELIST),
      cache: "no-store",
    });
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = { success: false, error: `Upstream ${res.status}` };
    }
    if (res.ok) clearForRequest(request);
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (err) {
    return catchError(err);
  }
}
