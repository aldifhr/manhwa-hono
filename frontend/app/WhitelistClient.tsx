"use client";

import { WhitelistGrid } from "@/components/WhitelistGrid";
import { PageShell } from "@/components/PageShell";

export function WhitelistClient() {
  return (
    <PageShell>
      <h1 className="text-xl font-semibold tracking-tight text-text">Whitelist</h1>
      <WhitelistGrid />
    </PageShell>
  );
}
