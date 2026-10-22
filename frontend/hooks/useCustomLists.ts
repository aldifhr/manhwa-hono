"use client";
import { useState, useEffect, useCallback } from "react";

export type ListName = "reading" | "plan" | "completed" | "dropped";

const LS_KEY = "custom_lists";

function load(): Record<string, ListName> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function useCustomLists() {
  const [map, setMap] = useState<Record<string, ListName>>({});
  useEffect(() => { setMap(load()); }, []);
  const setList = useCallback((titleKey: string, list: ListName | null) => {
    setMap(prev => {
      const next = { ...prev };
      if (list) next[titleKey] = list;
      else delete next[titleKey];
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return { map, setList };
}
