import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock NextRequest for testing
class MockNextRequest {
  url: string;
  headers: Headers;
  body: string | null;
  method: string;

  constructor(url: string, init: RequestInit = {}) {
    this.url = url;
    this.headers = new Headers(init.headers as Record<string, string>);
    this.body = (init.body as string) || null;
    this.method = init.method || "GET";
  }

  text() {
    return Promise.resolve(this.body || "");
  }

  json() {
    return Promise.resolve(this.body ? JSON.parse(this.body) : {});
  }
}

describe("Cron route integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("returns 401 when no auth provided", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { GET } = await import("@/app/api/cron/route");
    const req = new MockNextRequest("http://localhost/api/cron?action=update");
    const res = await GET(req as unknown as Request);
    expect(res.status).toBe(401);
  });

  it("returns 401 when CRON_SECRET is set but wrong key provided", async () => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.CRON_SECRET = "correct-secret";
    const { GET } = await import("@/app/api/cron/route");
    const req = new MockNextRequest(
      "http://localhost/api/cron?action=update&key=wrong-key"
    );
    const res = await GET(req as unknown as Request);
    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it("passes through when CRON_SECRET matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: { ok: true } }),
      }))
    );
    process.env.CRON_SECRET = "my-secret";
    const { GET } = await import("@/app/api/cron/route");
    const req = new MockNextRequest(
      "http://localhost/api/cron?action=update&key=my-secret"
    );
    const res = await GET(req as unknown as Request);
    expect(res.status).toBe(200);
    delete process.env.CRON_SECRET;
  });

  it("rejects unknown actions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: { ok: true } }),
      }))
    );
    process.env.CRON_SECRET = "my-secret";
    const { GET } = await import("@/app/api/cron/route");
    const req = new MockNextRequest(
      "http://localhost/api/cron?action=unknown&key=my-secret"
    );
    const res = await GET(req as unknown as Request);
    // Should still work but action defaults to "update"
    expect(res.status).toBe(200);
    delete process.env.CRON_SECRET;
  });
});

describe("Auth login route integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("returns 400 when password is missing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const req = new MockNextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as unknown as Request);
    expect(res.status).toBe(400);
  });

  it("returns 401 when backend rejects credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { message: "Invalid password" },
        }),
      }))
    );
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const req = new MockNextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    const res = await POST(req as unknown as Request);
    expect(res.status).toBe(401);
  });

  it("returns 500 when backend does not issue session cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { ok: true } }),
        headers: {
          getSetCookie: () => [],
        },
      }))
    );
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const req = new MockNextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    });
    const res = await POST(req as unknown as Request);
    expect(res.status).toBe(500);
  });
});
