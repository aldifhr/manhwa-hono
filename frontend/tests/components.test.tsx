import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Minimal component tests using renderToString
// These are smoke tests to verify components don't crash on render

// We need to set environment to client for components using 'use client' directives
vi.stubEnv("NODE_ENV", "development");

// MangaCard reads source health through useQuery, so it needs a provider. A
// fresh client per render keeps the tests independent.
function renderWithQuery(node: React.ReactNode): string {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToString(createElement(QueryClientProvider, { client }, node));
}

describe("ErrorBoundary", () => {
  it("renders children without crashing", async () => {
    vi.resetModules();
    const { default: ErrorBoundary } = await import("@/components/ErrorBoundary");
    const html = renderToString(
      createElement(ErrorBoundary, null, createElement("div", null, "Test Child")),
    );
    expect(html).toContain("Test Child");
  });
});

describe("SkeletonGrid", () => {
  it("renders skeleton items", async () => {
    vi.resetModules();
    const { SkeletonGrid } = await import("@/components/SkeletonGrid");
    const html = renderToString(createElement(SkeletonGrid, { variant: "grid-item" }));
    expect(html).toContain("skeleton");
  });
});

describe("MangaCard", () => {
  it("renders with minimal props", async () => {
    vi.resetModules();
    const { default: MangaCard } = await import("@/components/MangaCard");
    const html = renderWithQuery(
      createElement(MangaCard, {
        title: "Test Manga",
        cover: null,
        id: "test-id",
        titleKey: "test-key",
      }),
    );
    expect(html).toContain("Test Manga");
  });

  it("renders with cover image", async () => {
    vi.resetModules();
    const { default: MangaCard } = await import("@/components/MangaCard");
    const html = renderWithQuery(
      createElement(MangaCard, {
        title: "Test Manga",
        cover: "/api/reader/proxy?url=https://example.com/cover.jpg",
        id: "test-id",
        titleKey: "test-key",
      }),
    );
    expect(html).toContain("Test Manga");
  });
});
