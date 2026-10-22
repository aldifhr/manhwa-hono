"use client";

import { ArrowUp } from "@phosphor-icons/react";
import { motion, AnimatePresence, animate } from "framer-motion";
import { useScrollVisibility } from "@/lib/hooks/useScrollVisibility";

export default function BackToTop() {
  const visible = useScrollVisibility(300);

  const scrollToTop = () => {
    animate(window.scrollY, 0, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => window.scrollTo(0, v),
    });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          onClick={scrollToTop}
          aria-label="Back to top"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-40 safe-bottom w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white shadow-lg shadow-black/30 border border-white/10 flex items-center justify-center backdrop-blur-md"
        >
          <ArrowUp size={20} weight="bold" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
