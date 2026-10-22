"use client";
import { useRef, useCallback } from "react";

export function useLongPress(
  onLongPress: (pos: { x: number; y: number }) => void,
  delay = 450
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      longPressed.current = false;
      const t = e.touches[0];
      timer.current = setTimeout(() => {
        longPressed.current = true;
        onLongPress({ x: t.clientX, y: t.clientY });
      }, delay);
    },
    [onLongPress, delay]
  );

  const onTouchEnd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onTouchMove = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const wasLongPressed = useCallback(() => {
    const v = longPressed.current;
    longPressed.current = false;
    return v;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchMove, wasLongPressed, longPressed };
}
