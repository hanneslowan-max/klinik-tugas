"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKeluar } from "@/features/auth/keluar";
import { pesanGalat } from "@/lib/api/galat";
import { rpc } from "@/lib/api/rpc";
import { klienBrowser } from "@/lib/supabase/client";
import { lanjutAman } from "@/lib/teks";

const MIN = 8; // = Auth password_min_length project & Edge password_sementara

function cekPassword(baru: string, ulang: string): string | null {
  if (baru.length < MIN) return `Password minimal ${MIN} karakter.`;
  if (baru !== ulang) return "Kedua password tidak sama.";
  if (/^(.)\1+$/.test(baru)) return "Password terlalu mudah ditebak.";
  return null;
}

export function FormGantiPassword({ wajib, lanjut }: { wajib: boolean; lanjut: string | null }) {
  const router = useRouter();
  const keluar = useKeluar();
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const baru = String(f.get("password-baru") ?? "");
    const salah = cekPassword(baru, String(f.get("password-ulang") ?? ""));
    setGalat(salah);
    if (salah) return;
    setSibuk(true);
    try {
      const klien = klienBrowser();
      const { error } = await klien.auth.updateUser({ password: baru });
      if (error) {
        setGalat(
          /same|different/i.test(error.message)
            ? "Password baru harus berbeda dari password lama."
            : /weak|short|length/i.test(error.message)
              ? "Password terlalu lemah. Pakai minimal 8 karakter campuran."
              : `Gagal mengganti password: ${error.message}`,
        );
        return;
      }
      await rpc(klien, "web_sudah_ganti_password");
      toast.success("Password sudah diganti");
      router.replace(lanjutAman(lanjut, "/saya", ["/ganti-password", "/masuk"]));
      router.refresh();
    } catch (err) {
      setGalat(pesanGalat(err));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="space-y-4">
      {wajib ? (
        <KotakPesan nada="peringatan" data-uji="wajib-ganti">
          Anda masuk dengan password sementara dari owner. Buat password baru sebelum lanjut.
        </KotakPesan>
      ) : null}
      <form method="post" onSubmit={kirim} noValidate className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="space-y-1.5">
          <Label htmlFor="password-baru">Password baru (min. {MIN} karakter)</Label>
          <Input id="password-baru" name="password-baru" type="password" autoComplete="new-password" minLength={MIN} autoFocus required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password-ulang">Ulangi password baru</Label>
          <Input id="password-ulang" name="password-ulang" type="password" autoComplete="new-password" minLength={MIN} required />
        </div>
        {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
        <Button type="submit" className="w-full" size="lg" disabled={sibuk}>
          {sibuk ? "Menyimpan…" : "Simpan password"}
        </Button>
      </form>
      {wajib ? (
        <Button variant="ghost" className="w-full" onClick={() => keluar(false)}>
          Keluar
        </Button>
      ) : (
        <Button variant="ghost" className="w-full" asChild>
          <Link href={lanjutAman(lanjut, "/saya", ["/ganti-password", "/masuk"])}>Batal</Link>
        </Button>
      )}
    </div>
  );
}
