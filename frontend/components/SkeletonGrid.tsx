"use client";

import React from "react";
import { motion } from "framer-motion";

interface SkeletonGridProps {
  count?: number;
  variant?: "grid-item" | "list-item" | "group-item";
  hideHeader?: boolean;
}

export const SkeletonGrid = ({
  count = 8,
  variant = "list-item",
  hideHeader = false,
}: SkeletonGridProps) => {
  if (variant === "grid-item") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3 }}
            className="rounded-2xl border border-white/8 bg-white/5 p-3 space-y-2 overflow-hidden relative"
          >
            <div className="relative w-full aspect-2/3 rounded-lg overflow-hidden">
              <div className="skeleton absolute inset-0 rounded-lg" />
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1, ease: "linear" }}
              />
            </div>
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-2.5 w-16 rounded" />
            <div className="flex items-center gap-1.5">
              <div className="skeleton h-4 w-12 rounded-md" />
              <div className="skeleton h-4 w-10 rounded-md" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (variant === "group-item") {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 p-4 rounded-2xl border border-white/8 bg-white/5"
          >
            <div className="relative shrink-0 w-20 h-28 rounded-lg overflow-hidden">
              <div className="skeleton absolute inset-0 rounded-lg" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-2.5 w-20 rounded" />
              <div className="flex items-center gap-1.5 mt-1">
                <div className="skeleton h-5 w-12 rounded-md" />
                <div className="skeleton h-5 w-10 rounded-md" />
                <div className="skeleton h-5 w-16 rounded-md ml-auto" />
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden">
                  <div className="skeleton h-full w-1/3 rounded-full" />
                </div>
                <div className="skeleton h-3 w-8 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hideHeader && <div className="skeleton h-7 w-44 rounded" />}
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-4 p-4 rounded-2xl border border-white/8 bg-white/5"
          >
            <div className="relative shrink-0 w-20 h-28 rounded-lg overflow-hidden">
              <div className="skeleton absolute inset-0 rounded-lg" />
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-2.5 w-16 rounded" />
              </div>

              <div className="flex items-center gap-1.5 mt-1">
                <div className="skeleton h-4 w-14 rounded-md" />
                <div className="skeleton h-4 w-10 rounded-md" />
                <div className="skeleton h-4 w-10 rounded-md" />
                <div className="skeleton h-2.5 w-10 rounded" />
              </div>

              <div className="skeleton h-3 w-full rounded mt-1" />
              <div className="skeleton h-3 w-2/3 rounded" />

              <div className="flex items-center gap-2 mt-auto pt-2">
                <div className="skeleton h-7 w-20 rounded-lg" />
                <div className="skeleton h-7 w-16 rounded-lg ml-auto" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
