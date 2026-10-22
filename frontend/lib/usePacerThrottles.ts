"use client";
import { useCallback, useEffect, useRef } from "react";

export function usePacerThrottledScroll(fn: () => void, wait = 250) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return useCallback(() => {
    const now = Date.now();
    const remaining = wait - (now - last.current);
    if (remaining <= 0) {
      if (timer.current) clearTimeout(timer.current);
      last.current = now;
      fnRef.current();
    } else if (!timer.current) {
      timer.current = setTimeout(() => {
        last.current = Date.now();
        timer.current = null;
        fnRef.current();
      }, remaining);
    }
  }, [wait]);
}


