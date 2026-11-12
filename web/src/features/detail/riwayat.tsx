"use client";

// Tab Riwayat (activity_log, append-only): terbaru di atas, satu kalimat per jenis perubahan + detail beda,
// snapshot saat ditutup, sumber (web / API / impor / sinkron / sistem), rentang waktu untuk data impor.
import type { ReactNode } from "react";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Chip } from "@/components/umum/chip";
import { StatusPil } from "@/components/umum/status-pil";
import { useProfil } from "@/features/profil/penyedia-profil";
import { PRIORITAS } from "@/lib/konstanta";
import { fmtJamWib, fmtTanggal, fmtWaktu, fmtWaktuPanjang } from "@/lib/tanggal";
import type { Aktivitas, JejakTanggal, Prioritas, Snapshot, StatusList } from "@/types/domain";

const NAMA_SUMBER: Record<string, string> = { ui: "web", api: "API/agent", impor: "impor", sinkron: "sinkron", sistem: "sistem" };
const WARNA_AKTOR = "#8e8c99";

const potong = (s: string | null | undefined, n = 160) => (s && s.length > n ? `${s.slice(0, n)}…` : s || "");
const namaPrio = (p: unknown) => PRIORITAS[p as Prioritas]?.nama ?? "tanpa";

function Kalimat({ a, statuses }: { a: Aktivitas; statuses: StatusList[] }) {
  const { hariIni } = useProfil();
  const dr = a.dari;
  const ke = a.ke;
  const pil = (nama: string | null | undefined) => (
    <StatusPil nama={nama} warna={statuses.find((s) => s.status === nama)?.color} className="align-middle" />
  );
  const jejak = (j: JejakTanggal) => (j?.wib ? `${fmtTanggal(j.wib, hariIni)}${j.has_time && j.at ? ` ${fmtJamWib(j.at)}` : ""}` : "kosong");

  let isi: ReactNode;
  switch (a.jenis) {
    case "dibuat":
      isi = ke?.status ? <>membuat tugas dengan status {pil(ke.status)}</> : "membuat tugas";
      break;
    case "status":
      isi = <>mengubah status {pil(dr?.status)} → {pil(ke?.status)}</>;
      break;
    case "buka_ulang":
      isi = <>membuka ulang tugas {pil(dr?.status)} → {pil(ke?.status)}</>;
      break;
    case "due":
      isi = `mengubah due: ${jejak(dr)} → ${jejak(ke)}`;
      break;
    case "mulai":
      isi = `mengubah tanggal mulai: ${jejak(dr)} → ${jejak(ke)}`;
      break;
    case "assignee_tambah":
      isi = `menambah assignee ${ke?.username ?? ""}`;
      break;
    case "assignee_hapus":
      isi = `melepas assignee ${dr?.username ?? ""}`;
      break;
    case "nama":
      isi = "mengganti nama tugas";
      break;
    case "deskripsi":
      isi = "mengubah deskripsi";
      break;
    case "pindah_list":
      isi = `memindah dari list "${dr?.name ?? "?"}" ke "${ke?.name ?? "?"}"`;
      break;
    case "induk":
      isi = `mengubah induk: ${dr || "tanpa"} → ${ke || "tanpa"}`;
      break;
    case "kategori":
      isi = ke
        ? dr
          ? `mengubah kategori "${dr.nama}" → "${ke.nama}"`
          : `mengatur kategori "${ke.nama}"`
        : `mengosongkan kategori "${dr?.nama ?? "?"}"`;
      break;
    case "prioritas":
      isi = `mengubah prioritas: ${namaPrio(dr)} → ${namaPrio(ke)}`;
      break;
    case "arsip":
      isi = "mengarsipkan tugas";
      break;
    case "pulih_arsip":
      isi = "mengeluarkan tugas dari arsip";
      break;
    case "hapus":
      isi = a.catatan === "purge permanen" ? "menghapus permanen" : "memindah tugas ke Sampah";
      break;
    case "pulih":
      isi = "memulihkan tugas dari Sampah";
      break;
    case "komentar":
      isi = ke?.parent_id ? "membalas komentar" : "berkomentar";
      break;
    case "komentar_edit":
      isi = "mengubah komentar";
      break;
    case "komentar_hapus":
      isi = "menghapus komentar";
      break;
    case "lampiran_tambah":
      isi = `menambah lampiran "${ke?.title ?? ""}"`;
      break;
    case "lampiran_hapus":
      isi = `menghapus lampiran "${dr?.title ?? ""}"`;
      break;
    case "hilang_di_clickup":
      isi = "tugas tidak ada lagi di ClickUp (ditandai sinkron)";
      break;
    case "ditutup_impor":
      isi = "tercatat selesai di ClickUp (impor)";
      break;
    default:
      isi = a.jenis;
  }
  return <>{isi}</>;
}

/** Detail beda (nama, deskripsi, teks komentar) atau null. */
function detailBeda(a: Aktivitas): string | null {
  switch (a.jenis) {
    case "nama":
      return `"${potong(a.dari)}" → "${potong(a.ke)}"`;
    case "deskripsi":
      return `Sebelum: ${potong(a.dari, 200) || "(kosong)"}\nSesudah: ${potong(a.ke, 200) || "(kosong)"}`;
    case "komentar":
      return a.ke?.teks200 ? `"${potong(a.ke.teks200)}"` : null;
    case "komentar_edit":
      return `"${potong(a.dari?.teks)}" → "${potong(a.ke?.teks)}"`;
    case "komentar_hapus":
      return a.dari ? `"${potong(a.dari.teks)}"` : null;
    default:
      return null;
  }
}

/** Ringkasan keadaan kartu saat ditutup (bukti selesai). */
function NodeSnapshot({ s }: { s: Snapshot }) {
  const kt = s.komentar_terakhir;
  return (
    <div className="mt-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground" data-uji="snapshot">
      <div>
        Saat ditutup: {s.komentar} komentar · {s.balasan} balasan · {s.lampiran} lampiran · {s.ada_url ? "ada URL" : "tanpa URL"}.
      </div>
      <div>{kt ? `Komentar terakhir: ${kt.user}, ${fmtWaktu(kt.date)} — "${potong(kt.teks200, 200)}"` : "Belum ada komentar saat ditutup."}</div>
    </div>
  );
}

export function DaftarRiwayat({ activity, statuses }: { activity: Aktivitas[]; statuses: StatusList[] }) {
  if (!activity.length) return <p className="py-2 text-sm text-muted-foreground">Belum ada riwayat.</p>;
  const urut = [...activity].reverse(); // terbaru di atas
  return (
    <ul className="divide-y" data-uji="daftar-riwayat">
      {urut.map((a) => {
        const impor = a.sumber === "impor" || a.sumber === "sinkron";
        const aktor = a.aktor ? a.aktor.username : impor ? "impor: aktor tak diketahui" : "sistem";
        const beda = detailBeda(a);
        return (
          <li key={a.id} className="flex gap-2.5 py-3 text-sm" data-jenis={a.jenis}>
            {a.aktor ? (
              <AvatarAnggota anggota={{ username: a.aktor.username, color: WARNA_AKTOR }} className="mt-0.5" />
            ) : (
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#8e8c99] text-xs text-white" aria-hidden>
                ·
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="leading-relaxed break-words">
                <strong className="font-semibold">{aktor}</strong> <Kalimat a={a} statuses={statuses} />
              </div>
              {beda ? <div className="mt-1 text-xs break-words whitespace-pre-wrap text-muted-foreground">{beda}</div> : null}
              {a.snapshot ? <NodeSnapshot s={a.snapshot} /> : null}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <time dateTime={a.at} title={fmtWaktuPanjang(a.at)}>
                  {fmtWaktu(a.at)}
                </time>
                <Chip nada="garis">{NAMA_SUMBER[a.sumber] ?? a.sumber}</Chip>
                {a.at_awal ? (
                  <span>
                    berubah antara {fmtWaktu(a.at_awal)} dan {fmtWaktu(a.at)}
                  </span>
                ) : null}
                {a.lengkap === false ? <Chip title="Waktu/aktor tidak lengkap (data impor/sinkron)">tidak lengkap</Chip> : null}
                {a.aktor_assignee ? <Chip nada="garis">oleh assignee</Chip> : null}
                {a.catatan && a.catatan !== "purge permanen" ? <span>{a.catatan}</span> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
