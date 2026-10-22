"use client";
import type { ReactNode } from "react";
import { motion } from "framer-motion";

type Variant = "default" | "narrow" | "bleached";

const variantClass: Record<Variant, string> = {
  default: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8",
  narrow: "max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8",
  bleached: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8",
};

export function PageShell({
  variant = "default",
  children,
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`${variantClass[variant]} space-y-6`}
    >
      {children}
    </motion.div>
  );
}

// Convenience: re-export as default for page wrappers that want <PageShell> without import churn
export default PageShell;
