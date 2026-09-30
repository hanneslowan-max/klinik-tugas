// Deteksi @mention di penyusun komentar (fungsi murni supaya bisa diuji). DB mencatat mention dari '@username'
// persis di teks (web_komentar tanpa p_mentions), jadi yang disisipkan selalu username lengkap.

export type CalonMention = { username: string; nama?: string | null };

export type HasilMention<T extends CalonMention> = {
  /** indeks karakter '@' di teks */
  awal: number;
  pilihan: T[];
};

/**
 * Calon mention dari teks sebelum kursor: '@kata' di awal teks atau sesudah spasi / '('. Cocok bila username atau
 * nama berawalan kata itu, atau salah satu kata dalam username berawalan kata itu. Maks. 8 saran. null bila tidak ada.
 */
export function cariMention<T extends CalonMention>(anggota: readonly T[], teks: string, pos: number): HasilMention<T> | null {
  const m = teks.slice(0, pos).match(/(^|[\s(])@([^\n@]{0,40})$/);
  if (!m) return null;
  const kata = m[2].toLowerCase();
  const pilihan = anggota
    .filter((x) => {
      const u = x.username.toLowerCase();
      return u.startsWith(kata) || (x.nama ?? "").toLowerCase().startsWith(kata) || u.split(/\s+/).some((p) => p.startsWith(kata));
    })
    .slice(0, 8);
  // "@budi " (spasi di akhir) hanya lanjut bila memang bagian dari username ("budi santoso")
  if (!pilihan.length || (m[2].endsWith(" ") && !pilihan.some((x) => x.username.toLowerCase().startsWith(kata)))) return null;
  return { awal: pos - m[2].length - 1, pilihan };
}

/** Teks sesudah mention disisipkan menggantikan '@kata' di [awal, pos) + posisi kursor baru. */
export function sisipMention(teks: string, awal: number, pos: number, username: string) {
  const sisip = `@${username} `;
  return { teks: teks.slice(0, awal) + sisip + teks.slice(pos), kursor: awal + sisip.length };
}
