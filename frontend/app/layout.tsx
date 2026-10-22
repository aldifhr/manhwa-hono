import type { Metadata } from "next";
import "./globals.css";
import "./gold.css";
import Navbar from "@/components/Navbar";
import Announcement from "@/components/Announcement";
import QueryProvider from "@/components/QueryProvider";
import { ToastProvider } from "@/lib/useToast";
import { CommandPalette } from "@/components/CommandPalette";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "ManhwaScan — Read Manhwa & Manga Free",
  description:
    "Read manhwa, manga, and webtoon for free. Daily updates, best quality.",
  manifest: "/manifest.json",
  other: {
    "theme-color": "#000000",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("font-sans dark", geist.variable)}
    >
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-icon.svg" />
        {/*
          next/font/google handles Geist optimization (self-hosted, no network).
          Inter and Space Grotesk are loaded via CSS @import in gold.css —
          removing the manual stylesheet link eliminates preload warnings.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body className="min-h-dvh bg-black text-white overflow-x-hidden">
        <QueryProvider>
          <ToastProvider>
            <Announcement />
            <Navbar />
            <CommandPalette />
            <main className="min-h-dvh pb-safe">{children}</main>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
