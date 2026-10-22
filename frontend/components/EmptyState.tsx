"use client";
import { IconContext } from "@phosphor-icons/react";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  subMessage?: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  icon,
  message,
  subMessage,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center py-12 gap-3 text-center"
    >
      {icon && (
        <IconContext.Provider
          value={{
            size: 32,
            weight: "light",
            className: "text-text-muted",
          }}
        >
          {icon}
        </IconContext.Provider>
      )}
      <p className="text-sm font-medium text-text">{message}</p>
      {subMessage && <p className="text-xs text-text-muted">{subMessage}</p>}
      {action && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>{action}</motion.div>}
    </motion.div>
  );
}
