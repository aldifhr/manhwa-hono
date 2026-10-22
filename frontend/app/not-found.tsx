"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] w-full px-4">
      <div className="flex flex-col items-center gap-8 max-w-sm w-full">
        {/* 404 heading */}
        <div className="relative">
          <h1
            className="text-[8rem] sm:text-[10rem] font-black leading-none tracking-tight select-none"
            style={{
              background: "linear-gradient(180deg, #e4e4e8 20%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 48px rgba(129, 140, 248, 0.15))",
            }}
          >
            404
          </h1>
        </div>

        {/* Decorative line */}
        <div className="flex items-center gap-3 w-full max-w-30">
          <div className="flex-1 h-px bg-border" />
          <div className="w-1.5 h-1.5 rotate-45 bg-accent" />
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Text content */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-xl sm:text-2xl font-semibold text-text">
            Page not found
          </h2>
          <p className="text-sm sm:text-base text-text-secondary leading-relaxed max-w-xs">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved. Check the URL or head back to the dashboard.
          </p>
        </div>

        {/* Back to Home */}
        <Link
          href="/"
          className="
            inline-flex items-center gap-2
            px-5 py-2.5 rounded-lg
            text-sm font-medium text-black
            bg-accent hover:bg-accent-hover
            shadow-lg shadow-accent/20
            transition-all duration-200
            hover:-translate-y-0.5 active:translate-y-0
          "
        >
          <ArrowLeft size={16} />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
