"use client";

import { useSyncExternalStore } from "react";

/** true bila media query cocok. Di server selalu false (layar HP = bawaan). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (ubah) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", ubah);
      return () => mql.removeEventListener("change", ubah);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Desktop = lebar ≥ 768px (md). */
export const useDesktop = () => useMediaQuery("(min-width: 768px)");
