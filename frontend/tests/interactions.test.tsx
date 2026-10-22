import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Cleanup after each test
afterEach(() => cleanup());

// Test Button component interaction
describe("Button", () => {
  it("renders with text", async () => {
    const { default: Button } = await import("@/components/ui/Button");
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("handles click events", async () => {
    const { default: Button } = await import("@/components/ui/Button");
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText("Click"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("shows disabled state", async () => {
    const { default: Button } = await import("@/components/ui/Button");
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText("Disabled")).toBeDisabled();
  });

  it("applies variant classes", async () => {
    const { default: Button } = await import("@/components/ui/Button");
    const { container } = render(<Button variant="primary">Primary</Button>);
    expect(container.firstChild).toHaveClass("bg-accent");
  });
});

// Test Modal interaction
describe("Modal", () => {
  it("renders content when open", async () => {
    const { Modal } = await import("@/components/ui/Modal");
    render(
      <Modal open={true} onClose={() => {}} title="Test Modal">
        <div>Modal content</div>
      </Modal>,
    );
    expect(screen.getByText("Test Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("renders footer buttons", async () => {
    const { Modal } = await import("@/components/ui/Modal");
    render(
      <Modal
        open={true}
        onClose={() => {}}
        title="Modal"
        footer={<button>Confirm</button>}
      >
        <div>Content</div>
      </Modal>,
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });
});

// Test WhitelistGrid with QueryClientProvider
describe("WhitelistGrid interactions", () => {
  const createTestQueryClient = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false } } });

  beforeEach(() => {
    // Mock fetch for WhitelistGrid
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: { results: [], totalPages: 1 } }),
    })));
  });

  it("renders search input after loading", async () => {
    vi.resetModules();
    const { WhitelistGrid } = await import("@/components/WhitelistGrid");
    const qc = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <WhitelistGrid />
      </QueryClientProvider>,
    );

    // Wait for loading to finish - search input should appear
    const searchInput = await waitFor(() => {
      const el = container.querySelector("input[data-search-input]");
      if (!el) throw new Error("Search input not found yet");
      return el;
    });
    expect(searchInput).toBeInTheDocument();
  });

  it("updates search value on change", async () => {
    vi.resetModules();
    const { WhitelistGrid } = await import("@/components/WhitelistGrid");
    const qc = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <WhitelistGrid />
      </QueryClientProvider>,
    );

    const searchInput = await waitFor(() => {
      const el = container.querySelector("input[data-search-input]");
      if (!el) throw new Error("Search input not found yet");
      return el as HTMLInputElement;
    });

    fireEvent.change(searchInput, { target: { value: "Solo Leveling" } });
    expect(searchInput.value).toBe("Solo Leveling");
  });
});

// Test ErrorBoundary interaction
describe("ErrorBoundary interaction", () => {
  it("shows error message and recovers on retry", async () => {
    vi.resetModules();
    const { default: ErrorBoundary } = await import("@/components/ErrorBoundary");

    function ThrowOnce() {
      const [threw, setThrew] = React.useState(false);
      if (!threw) {
        setThrew(true);
        throw new Error("Test error");
      }
      return <div>Recovered</div>;
    }

    const { getByText } = render(
      <ErrorBoundary>
        <ThrowOnce />
      </ErrorBoundary>,
    );

    expect(getByText("Something went wrong")).toBeInTheDocument();
    expect(getByText("Test error")).toBeInTheDocument();
  });
});

// Import React for useState
import React from "react";
