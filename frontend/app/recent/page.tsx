"use client";

import AllTab from "@/components/home/AllTab";
import BackToTop from "@/components/BackToTop";
import ContinueReadingStrip from "@/components/ContinueReadingStrip";
import { PageShell } from "@/components/PageShell";

export default function RecentPage() {
  return (
    <>
      <PageShell>
        <ContinueReadingStrip />
      </PageShell>
      <AllTab />
      <BackToTop />
    </>
  );
}
