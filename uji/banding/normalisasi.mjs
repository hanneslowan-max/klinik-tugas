// Aturan normalisasi uji banding (uji/banding.mjs). SETIAP aturan wajib punya alasan; daftar + penjelasan di
// uji/banding/README.md. Aturan diterapkan ke salinan output KEDUA sisi (clickup.mjs → mock, tugas.mjs → app),
// lalu dibandingkan secara struktural. Beda yang tersisa = temuan (bug / permintaan perubahan), bukan dinormalisasi.
//
// Kategori:
//   izin      = diizinkan eksplisit oleh tugas B2 (domain url, attachments[].url, kartu >25 komentar)
//   kontrak   = sudah tercatat di kontrak (KONTRAK-DB §1: urutan kunci jsonb)
//   ditemukan = beda yang ditemukan saat banding; alasan dicatat (tidak dibaca konsumen routine / artefak DB bersama)

const jelajah = (x, f, jalur = "$") => {
  if (Array.isArray(x)) x.forEach((v, i) => jelajah(v, f, `${jalur}[${i}]`));
  else if (x && typeof x === "object") {
    f(x, jalur);
    for (const [k, v] of Object.entries(x)) jelajah(v, f, `${jalur}.${k}`);
  }
};

export function buatAturan({ appBase, anggotaLuar }) {
  const reUrlTugas = new RegExp(`^(?:https://app\\.clickup\\.com|${appBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})/t/([^/?#]+)$`);
  return [
    {
      id: "N3", kategori: "izin", nama: "kartu >25 komentar",
      alasan: "clickup.mjs asli tidak memaginasi GET /task/{id}/comment (ClickUp memberi 25 terbaru); app mengembalikan semua (K9). Output tugas dipotong ke 25 terbaru bila sisi ClickUp tepat 25; 25 pertama tetap harus identik. Di agenda, turunan dari daftar komentar (komentar_baru per kartu, ringkas.kartu_dengan_komentar_baru) dihitung ulang dari daftar terpotong dengan rumus clickup.mjs yang sama.",
      terapkan(cmd, a, b) {
        let n = 0;
        const potong = (x, y) => {
          if (Array.isArray(x) && Array.isArray(y) && x.length === 25 && y.length > 25) { y.splice(25); n++; return true; }
          return false;
        };
        if (cmd[0] === "comments") potong(a, b);
        if (cmd[0] === "agenda" && Array.isArray(a?.tasks) && Array.isArray(b?.tasks)) {
          const since = Date.parse(b.sejak);
          let ubah = false;
          a.tasks.forEach((t, i) => {
            const y = b.tasks[i];
            if (y && potong(t.comments, y.comments)) {
              // rumus sama dengan clickup.mjs agenda (komentar_baru)
              y.komentar_baru = y.comments.filter((c) => Date.parse(c.date) >= since || (c.replies || []).some((r) => Date.parse(r.date) >= since)).length;
              ubah = true;
            }
          });
          if (ubah && b.ringkas) b.ringkas.kartu_dengan_komentar_baru = b.tasks.filter((x) => x.komentar_baru > 0).length;
        }
        return n;
      },
    },
    {
      id: "N1", kategori: "izin", nama: "domain url kartu",
      alasan: "url = https://app.clickup.com/t/<id> vs <app_base_url>/t/<id> (satu-satunya beda disengaja, riset §4.4). ID harus sama.",
      terapkan(cmd, a, b) {
        let n = 0;
        for (const x of [a, b]) {
          jelajah(x, (o, jalur) => {
            if (typeof o.url === "string" && !/\.attachments\[\d+\]$/.test(jalur)) {
              const m = reUrlTugas.exec(o.url);
              if (m) { o.url = `⟨url⟩/t/${m[1]}`; n++; }
            }
          });
        }
        return n;
      },
    },
    {
      id: "N2", kategori: "izin", nama: "attachments[].url",
      alasan: "URL CDN ClickUp vs signed URL Storage 24 jam (Edge). Isi berkas dicek terpisah (sha256 unduhan = berkas fixture).",
      terapkan(cmd, a, b) {
        let n = 0;
        for (const x of [a, b]) {
          jelajah(x, (o, jalur) => {
            if (/\.attachments\[\d+\]$/.test(jalur) && typeof o.url === "string") { o.url = "⟨berkas⟩"; n++; }
          });
        }
        return n;
      },
    },
    {
      id: "N5", kategori: "ditemukan", nama: "whoami: jumlah anggota workspace",
      alasan: "DB lokal BERSAMA berisi anggota aktif di luar fixture (seed dev, anggota uji agen lain, anggota yang sudah keluar dari /team tetapi tetap aktif di app). Jumlah app dikurangi anggota aktif yang tidak ada di /team tiruan (dihitung dari GET /v2/team app).",
      terapkan(cmd, a, b) {
        if (cmd[0] !== "whoami" || !Array.isArray(b?.workspaces)) return 0;
        let n = 0;
        for (const w of b.workspaces) if (typeof w.members === "number" && anggotaLuar) { w.members -= anggotaLuar; n++; }
        return n;
      },
    },
    {
      id: "N6", kategori: "ditemukan", nama: "profilePicture",
      alasan: "Tabel members tidak menyimpan avatar; kontrak §6 member json profilePicture:null. Tidak dibaca konsumen (brief/getComments/agenda).",
      terapkan(cmd, a, b) {
        let n = 0;
        for (const x of [a, b]) jelajah(x, (o) => { if ("profilePicture" in o && o.profilePicture !== null) { o.profilePicture = null; n++; } });
        return n;
      },
    },
    {
      id: "N7", kategori: "ditemukan", nama: "thumbnail lampiran",
      alasan: "App tidak membuat thumbnail (kontrak §6: thumbnail_small/large null); ClickUp memberi URL thumbnail untuk gambar. URL turunan berkas yang sama; routine hanya mengunduh attachments[].url.",
      terapkan(cmd, a, b) {
        let n = 0;
        for (const x of [a, b]) {
          jelajah(x, (o, jalur) => {
            if (!/\.attachments\[\d+\]$/.test(jalur)) return;
            for (const k of ["thumbnail_small", "thumbnail_large"]) if (o[k] !== undefined && o[k] !== null) { o[k] = null; n++; }
          });
        }
        return n;
      },
    },
    {
      id: "N8", kategori: "ditemukan", nama: "watchers",
      alasan: "App tidak melacak watcher (kontrak §6 watchers:[]); ClickUp mengisi pembuat + assignee. Tidak dibaca konsumen.",
      terapkan(cmd, a, b) {
        let n = 0;
        for (const x of [a, b]) jelajah(x, (o) => { if (Array.isArray(o.watchers) && o.watchers.length) { o.watchers = []; n++; } });
        return n;
      },
    },
    {
      id: "N9", kategori: "ditemukan", nama: "sharing",
      alasan: "Kontrak §6 sharing:{public:false}; ClickUp menambah public_share_expires_on/public_fields/token/seo_optimized (pengaturan share publik ClickUp, tidak ada di app). Nilai `public` tetap dibandingkan.",
      terapkan(cmd, a, b) {
        let n = 0;
        for (const x of [a, b]) {
          jelajah(x, (o) => {
            if (o.sharing && typeof o.sharing === "object" && Object.keys(o.sharing).some((k) => k !== "public")) {
              o.sharing = { public: o.sharing.public };
              n++;
            }
          });
        }
        return n;
      },
    },
    {
      id: "N10", kategori: "ditemukan", nama: "folder tersembunyi list tanpa folder",
      alasan: "ClickUp menaruh list tanpa folder di folder tersembunyi ber-ID nyata; app tidak menyimpan ID itu (lists.folder_id null) dan memakai '<list>-hidden'. Hanya folder/project.id pada kartu list tanpa folder; name/hidden/access tetap dibandingkan.",
      terapkan(cmd, a, b) {
        let n = 0;
        for (const x of [a, b]) {
          jelajah(x, (o) => {
            for (const k of ["folder", "project"]) {
              const f = o[k];
              if (f && typeof f === "object" && f.hidden === true && f.name === "hidden" && typeof f.id === "string") { f.id = "⟨folder-tersembunyi⟩"; n++; }
            }
          });
        }
        return n;
      },
    },
  ];
}

// Temuan yang SUDAH diketahui (permintaan perubahan). Tidak dinormalisasi; hanya diberi label di laporan.
export const DIKETAHUI = [
  {
    id: "PR-1", pola: /\.(tags|checklists)(\[|\.length|$)/,
    ringkas: "tags/checklists kartu impor selalu [] di API app (j_task memakai konstanta; isi ada di tasks.extra)",
  },
];

// Beda struktural: urutan kunci objek diabaikan (jsonb), urutan array dipertahankan, tipe dibedakan ("1" ≠ 1).
export function beda(a, b, jalur = "$", out = []) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push({ jalur: `${jalur}.length`, clickup: a.length, tugas: b.length });
    for (let i = 0; i < Math.min(a.length, b.length); i++) beda(a[i], b[i], `${jalur}[${i}]`, out);
    return out;
  }
  const obj = (x) => x && typeof x === "object" && !Array.isArray(x);
  if (obj(a) && obj(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (!(k in a)) out.push({ jalur: `${jalur}.${k}`, clickup: "⟨tidak ada⟩", tugas: b[k] });
      else if (!(k in b)) out.push({ jalur: `${jalur}.${k}`, clickup: a[k], tugas: "⟨tidak ada⟩" });
      else beda(a[k], b[k], `${jalur}.${k}`, out);
    }
    return out;
  }
  if (!Object.is(a, b)) out.push({ jalur, clickup: a, tugas: b });
  return out;
}

export function urutanKunciBeda(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.some((x, i) => urutanKunciBeda(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length === kb.length && ka.join("\u0000") !== kb.join("\u0000") && [...ka].sort().join("\u0000") === [...kb].sort().join("\u0000")) return true;
    return ka.some((k) => k in b && urutanKunciBeda(a[k], b[k]));
  }
  return false;
}
