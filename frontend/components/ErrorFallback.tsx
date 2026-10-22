"use client";

import React from "react";
import { Info, WarningCircle } from "@phosphor-icons/react";
import { motion } from "framer-motion";

interface ErrorFallbackProps {
  title: string;
  message?: string;
  onRetry?: () => void;
  icon?: "warning" | "info";
}

export const ErrorFallback = ({
  title,
  message,
  onRetry,
  icon = "warning",
}: ErrorFallbackProps) => {
  const IconComponent = icon === "warning" ? WarningCircle : Info;

  return (
    <motion.div
      role="alert"
      aria-live="assertive"
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center py-20 gap-4 text-center"
    >
      <IconComponent size={32} weight="light" className="text-text-muted" />
      <p className="text-text text-lg font-medium">{title}</p>
      {message && <p className="text-text-muted text-sm max-w-md">{message}</p>}
      {onRetry && (
        <motion.button
          autoFocus
          onClick={onRetry}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-5 py-2 rounded-lg bg-accent text-black text-sm font-medium transition-colors cursor-pointer hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          Retry
        </motion.button>
      )}
    </motion.div>
  );
};
