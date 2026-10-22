export const runtime = "nodejs";

import { NextResponse, NextRequest } from "next/server";
import { backendUrl, authHeaders } from "@/lib/server-api";
export async function GET(request: NextRequest) {
  const res = await fetch(`${backendUrl()}/api/v1/auth`, {
    headers: authHeaders(request as unknown as Request),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    return NextResponse.json(
      { success: false, error: "unauthorized" },
      { status: 401 }
    );
  return NextResponse.json(data);
}
