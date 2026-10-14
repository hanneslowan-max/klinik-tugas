// Cookie pilihan sidebar desktop (ditulis klien, dibaca layout server supaya HTML pertama sudah benar — tanpa kedip).
// Modul biasa (bukan "use client"): layout server butuh NILAI konstanta ini, bukan referensi komponen klien.
export const KUKI_SIDEBAR = "anvil_sidebar";

/** Terbuka kecuali pengguna pernah menyembunyikannya (nilai "tutup"). */
export const sidebarTerbukaDariKuki = (nilai: string | undefined) => nilai !== "tutup";
