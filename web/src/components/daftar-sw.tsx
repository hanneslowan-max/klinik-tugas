"use client";

import { useEffect } from "react";

/** Daftarkan service worker (cache aset statis) di produksi saja; dev tidak memakai cache supaya HMR normal. */
export function DaftarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
