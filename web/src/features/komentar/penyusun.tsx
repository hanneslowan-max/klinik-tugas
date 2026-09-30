"use client";

// Penyusun komentar: textarea + autocomplete @mention (username persis) + lampiran opsional.
// Keyboard: ↑/↓ memilih saran, Enter/Tab menyisipkan, Esc menutup saran; Ctrl/Cmd+Enter mengirim.
import { Paperclip, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { AvatarAnggota } from "@/components/umum/avatar-anggota";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAnggotaAktif } from "@/features/anggota/queries";
import { cariMention, sisipMention } from "@/features/komentar/mention";
import { cekBerkas } from "@/features/lampiran/api";
import { ACCEPT_LAMPIRAN } from "@/lib/konstanta";
import { cn } from "@/lib/utils";
import type { Anggota } from "@/types/domain";

type Saran = { awal: number; pilihan: Anggota[]; aktif: number };

export type PropsPenyusun = {
  /** penanda penyusun (atribut data-penyusun): "baru", "balas-<id>", "edit-<id>" */
  kunci: string;
  placeholder?: string;
  labelKirim?: string;
  teksAwal?: string;
  bolehLampiran?: boolean;
  /** fokus + gulir ke penyusun saat dipasang (balas / ubah) */
  fokusAwal?: boolean;
  /** kirim; false = gagal (isi penyusun dipertahankan) */
  kirim: (teks: string, berkas: File[]) => Promise<boolean | void>;
  batal?: () => void;
};

export function Penyusun({
  kunci,
  placeholder = "Tulis komentar… (@ untuk mention)",
  labelKirim = "Kirim",
  teksAwal = "",
  bolehLampiran = false,
  fokusAwal = false,
  kirim,
  batal,
}: PropsPenyusun) {
  const idSaran = useId();
  const { data: anggota } = useAnggotaAktif();
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const berkasRef = useRef<HTMLInputElement>(null);
  const kursor = useRef<number | null>(null);
  const timerTutup = useRef<number | undefined>(undefined);
  const [teks, setTeks] = useState(teksAwal);
  const [berkas, setBerkas] = useState<File[]>([]);
  const [saran, setSaran] = useState<Saran | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    if (!fokusAwal) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.scrollIntoView({ block: "center" });
  }, [fokusAwal]);

  // kursor diletakkan sesudah mention yang baru disisipkan (nilai textarea terpasang saat render)
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (kursor.current === null || !ta) return;
    ta.setSelectionRange(kursor.current, kursor.current);
    ta.focus();
    kursor.current = null;
  });

  useEffect(() => () => window.clearTimeout(timerTutup.current), []);

  function cekMention(ta: HTMLTextAreaElement) {
    const hasil = cariMention(anggota ?? [], ta.value, ta.selectionStart);
    setSaran(hasil ? { ...hasil, aktif: 0 } : null);
  }

  function sisipkan(x: Anggota) {
    const ta = taRef.current;
    if (!ta || !saran) return;
    const hasil = sisipMention(ta.value, saran.awal, ta.selectionStart, x.username);
    kursor.current = hasil.kursor;
    setTeks(hasil.teks);
    setSaran(null);
  }

  function tombol(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (saran) {
      const n = saran.pilihan.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSaran({ ...saran, aktif: (saran.aktif + (e.key === "ArrowDown" ? 1 : n - 1)) % n });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        sisipkan(saran.pilihan[saran.aktif]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSaran(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function tambahBerkas(e: ChangeEvent<HTMLInputElement>) {
    const baru: File[] = [];
    for (const f of e.target.files ?? []) {
      const alasan = cekBerkas(f);
      if (alasan) toast.error(alasan, { duration: 6000 });
      else baru.push(f);
    }
    e.target.value = "";
    if (baru.length) setBerkas((lama) => [...lama, ...baru]);
  }

  async function kirimForm(e: FormEvent) {
    e.preventDefault();
    if (sibuk) return;
    if (!teks.trim()) {
      taRef.current?.focus();
      return;
    }
    setSibuk(true);
    try {
      const ok = await kirim(teks, berkas);
      if (ok !== false) {
        setTeks("");
        setBerkas([]);
      }
    } finally {
      setSibuk(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={kirimForm} className="relative space-y-2" data-uji="penyusun" data-penyusun={kunci}>
      {saran ? (
        <ul
          id={idSaran}
          role="listbox"
          aria-label="Saran mention"
          className="absolute inset-x-0 bottom-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
          data-uji="saran-mention"
        >
          {saran.pilihan.map((x, i) => (
            <li
              key={x.id}
              id={`${idSaran}-${i}`}
              role="option"
              aria-selected={i === saran.aktif}
              data-username={x.username}
              onMouseDown={(e) => {
                e.preventDefault();
                sisipkan(x);
              }}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-muted",
                i === saran.aktif && "bg-info-lembut hover:bg-info-lembut",
              )}
            >
              <AvatarAnggota anggota={x} />
              <span className="min-w-0 truncate text-sm">
                <strong className="font-semibold">{x.username}</strong>
                {x.nama && x.nama !== x.username ? <span className="text-xs text-muted-foreground"> · {x.nama}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Textarea
        ref={taRef}
        value={teks}
        onChange={(e) => {
          setTeks(e.target.value);
          cekMention(e.target);
        }}
        onClick={(e) => cekMention(e.currentTarget)}
        onKeyDown={tombol}
        onBlur={() => {
          window.clearTimeout(timerTutup.current);
          timerTutup.current = window.setTimeout(() => setSaran(null), 150);
        }}
        rows={3}
        maxLength={20000}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={saran ? idSaran : undefined}
        aria-activedescendant={saran ? `${idSaran}-${saran.aktif}` : undefined}
        className="min-h-20"
      />
      {berkas.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Berkas yang akan dilampirkan">
          {berkas.map((f, i) => (
            <li key={`${f.name}-${f.size}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2 text-xs">
              <Paperclip className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Buang ${f.name}`}
                onClick={() => setBerkas((lama) => lama.filter((_, j) => j !== i))}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-muted pointer-coarse:size-11"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {bolehLampiran ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => berkasRef.current?.click()} className="mr-auto">
              <Paperclip aria-hidden />
              Lampiran
            </Button>
            <input
              ref={berkasRef}
              type="file"
              accept={ACCEPT_LAMPIRAN}
              multiple
              hidden
              aria-label="Pilih berkas untuk komentar"
              data-uji="input-lampiran-komentar"
              onChange={tambahBerkas}
            />
          </>
        ) : null}
        {batal ? (
          <Button type="button" variant="ghost" size="sm" onClick={batal}>
            Batal
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={sibuk} data-uji="kirim-komentar">
          {sibuk ? "Mengirim…" : labelKirim}
        </Button>
      </div>
    </form>
  );
}
