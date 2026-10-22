"use client";

import { createContext, useContext, useCallback, useMemo } from "react";
import { Toaster, toast as sonnerToast } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

/* ── Types ── */

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  type?: "success" | "error" | "info";
  action?: ToastAction;
  duration?: number;
}

interface ToastCtx {
  toast: (message: string, options?: ToastType | ToastOptions) => void;
}

type ToastType = "success" | "error" | "info";

/* ── Constants ── */

const DEFAULT_DURATION = 4000;

/* ── Context ── */

const ToastContext = createContext<ToastCtx | null>(null);

/* ── Fire toast (sonner) ── */

// Shared AudioContext — creating one per toast is wasteful and browsers cap
// the number of live contexts. Lazily create + reuse a single instance.
let audioCtx: AudioContext | null = null;

function playToastSound(type: ToastType) {
  try {
    if (typeof window === "undefined" || localStorage.getItem("toast_sound") !== "1") return;
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const Ctx = AudioCtor;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = type === "error" ? 220 : 440;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch { /* ignore */ }
}

function fireToast(message: string, options?: ToastType | ToastOptions) {
  let type: ToastType = "success";
  let action: ToastAction | undefined;
  let duration: number | undefined;

  if (typeof options === "string") {
    type = options;
  } else if (options && typeof options === "object") {
    if (options.type) type = options.type;
    if (options.action) action = options.action;
    if (options.duration !== undefined) duration = options.duration;
  }

  const opts = {
    ...(duration !== undefined ? { duration } : {}),
    ...(action ? { action } : {}),
  };

  playToastSound(type);

  if (type === "error") sonnerToast.error(message, opts);
  else if (type === "info") sonnerToast.info(message, opts);
  else sonnerToast.success(message, opts);
}

/* ── Provider ── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  const toast = useCallback(
    (message: string, options?: ToastType | ToastOptions) => fireToast(message, options),
    [],
  );

  const ctx = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <Toaster
        theme={theme}
        position="bottom-right"
        richColors
        closeButton
        visibleToasts={3}
        toastOptions={{
          duration: DEFAULT_DURATION,
          classNames: {
            toast: "border-border",
          },
        }}
      />
    </ToastContext.Provider>
  );
}

/* ── Hook ── */

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  return ctx ?? { toast: () => {} };
}