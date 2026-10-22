"use client";

// Pratinjau lampiran (22 Okt 2026) di Lembar: gambar, PDF, TXT, CSV/TSV, DOCX; jenis lain (DOC/XLS/XLSX/PPTX) cukup Unduh.
// Berkas dibuka lewat signed URL TANPA Content-Disposition attachment (browser menampilkan, bukan mengunduh).
// PDF: <iframe> hanya di desktop berpenunjuk mouse (frame-src Supabase di CSP, proxy.ts); di layar sentuh <iframe> PDF
// tidak andal (Chrome Android tidak merendernya, Safari iOS hanya halaman pertama) → tombol buka di penampil PDF HP.
// DOCX: mammoth (build browser, ±400 KB, dimuat MALAS hanya saat dibutuhkan) → HTML → DOMPurify (htmlAmanDokumen).
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";

import { GalatMuat, Kosong } from "@/components/umum/keadaan";
import { Lembar } from "@/components/umum/lembar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SEGAR_URL, useUrlLampiran } from "@/features/lampiran/api";
import {
  BATAS_BARIS_TABEL,
  BATAS_PRATINJAU_TEKS,
  ekstensiLampiran,
  jenisPratinjau,
  tebakPemisah,
  uraiTabel,
  type JenisPratinjau,
} from "@/features/lampiran/pratinjau";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GalatApi } from "@/lib/api/galat";
import { ukuranBerkas } from "@/lib/teks";
import type { Lampiran } from "@/types/domain";

const ANGKA = new Intl.NumberFormat("id-ID");

async function ambil(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new GalatApi({ message: `Berkas tidak bisa dimuat (HTTP ${res.status}).`, status: res.status });
  return res;
}

/** Isi berkas untuk pratinjau teks/tabel/DOCX (gambar & PDF dimuat langsung oleh browser dari URL). */
function useIsiPratinjau(a: Lampiran, jenis: JenisPratinjau | null, url: string | undefined) {
  const perluIsi = jenis === "teks" || jenis === "tabel" || jenis === "docx";
  const terlaluBesar = (jenis === "teks" || jenis === "tabel") && (a.size ?? 0) > BATAS_PRATINJAU_TEKS;
  return useQuery({
    queryKey: ["pratinjau-lampiran", a.storage_path, jenis],
    enabled: perluIsi && !terlaluBesar && Boolean(url),
    staleTime: SEGAR_URL,
    gcTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const res = await ambil(url!);
      if (jenis === "docx") {
        const [{ convertToHtml }, { htmlAmanDokumen }] = await Promise.all([
          import("mammoth/mammoth.browser.min.js"),
          import("@/lib/markdown"),
        ]);
        const hasil = await convertToHtml({ arrayBuffer: await res.arrayBuffer() });
        return { html: htmlAmanDokumen(hasil.value) };
      }
      return { teks: await res.text() };
    },
  });
}

function Memuat() {
  return <Skeleton className="h-64 w-full rounded-xl" aria-busy="true" aria-label="Memuat pratinjau" />;
}

function TabelPratinjau({ teks, ekstensi }: { teks: string; ekstensi: string }) {
  const { baris, total } = uraiTabel(teks, tebakPemisah(teks, ekstensi), BATAS_BARIS_TABEL);
  if (!baris.length) return <Kosong>Berkas kosong.</Kosong>;
  const [kepala, ...isi] = baris;
  return (
    <div className="space-y-2">
      <div className="max-h-[65dvh] overflow-auto rounded-lg border" data-uji="pratinjau-tabel">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {kepala.map((s, i) => (
                <th key={i} className="border-b px-2 py-1.5 text-left font-semibold whitespace-pre-wrap">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isi.map((r, i) => (
              <tr key={i} className="odd:bg-muted/30">
                {r.map((s, j) => (
                  <td key={j} className="border-b px-2 py-1 align-top whitespace-pre-wrap">
                    {s}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > baris.length ? (
        <p className="text-xs text-muted-foreground">
          Menampilkan {ANGKA.format(baris.length)} dari {ANGKA.format(total)} baris. Unduh untuk melihat semuanya.
        </p>
      ) : null}
    </div>
  );
}

type PropsIsi = { a: Lampiran; jenis: JenisPratinjau | null; url: ReturnType<typeof useUrlLampiran>; pdfDiHalaman: boolean };

function IsiPratinjau({ a, jenis, url, pdfDiHalaman }: PropsIsi) {
  const isi = useIsiPratinjau(a, jenis, url.data);
  const [gambarGagal, setGambarGagal] = useState(false);
  const judul = a.title || "(tanpa nama)";

  if (!jenis) {
    return (
      <Kosong>
        Pratinjau belum tersedia untuk berkas {ekstensiLampiran(a).toUpperCase() || "ini"}. Unduh untuk membukanya.
      </Kosong>
    );
  }
  if (url.isError) return <GalatMuat galat={url.error} ulang={() => void url.refetch()} />;
  if (!url.data) return <Memuat />;

  if (jenis === "gambar") {
    return gambarGagal ? (
      <Kosong>Gambar ini tidak bisa ditampilkan di browser ini (mis. HEIC di luar Safari). Unduh untuk membukanya.</Kosong>
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- signed URL Storage (bukan aset statis)
      <img
        src={url.data}
        alt={judul}
        className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-lg object-contain"
        onError={() => setGambarGagal(true)}
        data-uji="pratinjau-gambar"
      />
    );
  }

  if (jenis === "pdf") {
    return pdfDiHalaman ? (
      <iframe src={url.data} title={judul} className="h-[70dvh] w-full rounded-lg border bg-white" data-uji="pratinjau-pdf" />
    ) : (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">PDF dibuka di penampil PDF bawaan HP Anda.</p>
        <Button asChild>
          <a href={url.data} target="_blank" rel="noopener noreferrer" data-uji="buka-pdf">
            <ExternalLink aria-hidden />
            Buka PDF
          </a>
        </Button>
      </div>
    );
  }

  if ((a.size ?? 0) > BATAS_PRATINJAU_TEKS && jenis !== "docx") {
    return <Kosong>Berkas terlalu besar untuk dipratinjau ({ukuranBerkas(a.size)}). Unduh untuk membukanya.</Kosong>;
  }
  if (isi.isError) return <GalatMuat galat={isi.error} ulang={() => void isi.refetch()} />;
  if (!isi.data) return <Memuat />;

  if (jenis === "docx") {
    return (
      <div className="md rounded-lg border bg-background p-4 text-sm" data-uji="pratinjau-docx">
        {/* isi sudah disanitasi DOMPurify (lib/markdown.ts htmlAmanDokumen) */}
        <div dangerouslySetInnerHTML={{ __html: isi.data.html ?? "" }} />
      </div>
    );
  }
  if (jenis === "tabel") return <TabelPratinjau teks={isi.data.teks ?? ""} ekstensi={ekstensiLampiran(a)} />;
  return (
    <pre
      className="max-h-[65dvh] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap"
      data-uji="pratinjau-teks"
    >
      {isi.data.teks}
    </pre>
  );
}

type Props = {
  a: Lampiran;
  buka: boolean;
  ubahBuka: (buka: boolean) => void;
  /** tombol Unduh (anchor signed URL ber-Content-Disposition) dari baris lampiran */
  unduh: ReactNode;
};

/** Lembar pratinjau satu lampiran: isi di tengah, kaki = Buka di tab baru (bila bisa ditampilkan browser) + Unduh. */
export function LembarPratinjau({ a, buka, ubahBuka, unduh }: Props) {
  const jenis = jenisPratinjau(a);
  // URL tampil (tanpa unduh) — sama dengan kunci cache thumbnail gambar, jadi gambar biasanya sudah siap
  const url = useUrlLampiran(a, false, buka && Boolean(jenis));
  const pdfDiHalaman = useMediaQuery("(pointer: fine) and (min-width: 768px)");
  // PDF di HP sudah punya tombol "Buka PDF" di isi lembar
  const bisaTab = jenis === "gambar" || jenis === "teks" || (jenis === "pdf" && pdfDiHalaman);
  return (
    <Lembar
      buka={buka}
      ubahBuka={ubahBuka}
      judul={<span className="block truncate pr-2">{a.title || "(tanpa nama)"}</span>}
      deskripsi={[ekstensiLampiran(a).toUpperCase(), ukuranBerkas(a.size)].filter(Boolean).join(" · ") || undefined}
      lebar
      className="sm:max-w-4xl"
      data-uji="lembar-pratinjau"
      kaki={
        <>
          {bisaTab && url.data ? (
            <Button asChild variant="outline">
              <a href={url.data} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Buka di tab baru
              </a>
            </Button>
          ) : null}
          {unduh}
        </>
      }
    >
      {buka ? <IsiPratinjau a={a} jenis={jenis} url={url} pdfDiHalaman={pdfDiHalaman} /> : null}
    </Lembar>
  );
}
