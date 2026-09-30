"use client";

// Input tanggal (Due / Mulai) yang hanya menyimpan saat nilainya DIKOMIT:
//  - pilihan lewat picker bawaan (perubahan tanpa ketikan) → langsung disimpan;
//  - perubahan lewat keyboard (angka, panah, Backspace) → ditunda sampai Enter atau fokus keluar, dengan tanda
//    "Belum disimpan"; Esc mengembalikan nilai tersimpan.
// Jadi ketikan setengah jadi (mis. digit pertama bulan) tidak langsung tersimpan. Hapus tanggal lewat tombol ×.
import { X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// tombol yang hanya berpindah fokus / membuka picker bukan "mengetik"
const BUKAN_KETIK = new Set(["Tab", "Shift", "Control", "Alt", "Meta", "CapsLock", " ", "F4"]);

/** Tanggal hasil ketikan harus lengkap & wajar. */
function cekTanggal(el: HTMLInputElement, dariKetik: boolean): string | null {
  if (el.validity.badInput) return "Tanggal belum lengkap, tidak disimpan.";
  if (!el.value) return dariKetik ? "Tanggal belum lengkap, tidak disimpan. Pakai tombol × untuk menghapus tanggal." : null;
  const th = Number(el.value.slice(0, 4));
  if (th < 2000 || th > 2099) return `Tahun ${th} tidak wajar, tanggal tidak disimpan.`;
  return null;
}

type Props = {
  /** label field ("Due" / "Mulai") */
  label: string;
  /** tanggal WIB tersimpan 'YYYY-MM-DD' */
  nilai: string | null;
  /** data-uji input ("input-due" / "input-mulai") */
  uji: string;
  /** awalan data-uji tanda belum disimpan ("due" → "due-belum-simpan") */
  kunciUji: string;
  /** simpan (null = hapus); false = gagal (nilai tersimpan dipasang lagi) */
  onSimpan: (v: string | null) => Promise<boolean>;
};

export function InputTanggal({ label, nilai, uji, kunciUji, onSimpan }: Props) {
  const asli = nilai ?? "";
  const ref = useRef<HTMLInputElement>(null);
  const asliRef = useRef(asli);
  const ketik = useRef(false);
  const sibuk = useRef(false);
  const [belumSimpan, setBelumSimpan] = useState(false);

  // nilai tersimpan berubah (sesudah simpan / dimuat ulang) → pasang ke input, kecuali pengguna sedang mengetik
  useEffect(() => {
    asliRef.current = asli;
    const el = ref.current;
    if (el && !ketik.current && el.value !== asli) el.value = asli;
  }, [asli]);

  const kotor = () => (ref.current?.value ?? "") !== asliRef.current;

  function kembalikan() {
    if (ref.current) ref.current.value = asliRef.current;
    ketik.current = false;
    setBelumSimpan(false);
  }

  async function komit() {
    const el = ref.current;
    if (!el) return;
    const dariKetik = ketik.current;
    ketik.current = false;
    if (sibuk.current) return;
    if (!kotor()) {
      if (el.validity.badInput) el.value = asliRef.current;
      setBelumSimpan(false);
      return;
    }
    const alasan = cekTanggal(el, dariKetik);
    if (alasan) {
      toast.error(alasan, { duration: 5000 });
      kembalikan();
      return;
    }
    sibuk.current = true;
    setBelumSimpan(false);
    try {
      const ok = await onSimpan(el.value || null);
      if (!ok && ref.current) ref.current.value = asliRef.current;
    } finally {
      sibuk.current = false;
    }
  }

  function tombol(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      void komit();
      return;
    }
    if (e.key === "Escape") {
      if (kotor() || ketik.current) {
        e.preventDefault();
        kembalikan();
      }
      return;
    }
    if (BUKAN_KETIK.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    ketik.current = true;
  }

  return (
    <>
      <span className="flex min-w-0 flex-1 basis-40 items-center gap-1">
        <Input
          ref={ref}
          type="date"
          defaultValue={asli}
          min="2000-01-01"
          max="2099-12-31"
          aria-label={label}
          data-uji={uji}
          className="min-w-0 flex-1"
          onKeyDown={tombol}
          onChange={() => (ketik.current ? setBelumSimpan(kotor()) : void komit())}
          onBlur={() => {
            if (kotor() || ketik.current) void komit();
          }}
        />
        {asli ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Hapus ${label.toLowerCase()}`}
            className="text-muted-foreground"
            onClick={() => void onSimpan(null)}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </span>
      <span role="status" hidden={!belumSimpan} data-uji={`${kunciUji}-belum-simpan`} className="basis-full text-xs font-semibold text-hari-ini">
        Belum disimpan · Enter simpan, Esc batal
      </span>
    </>
  );
}
