"use client";

// Masuk dengan email + password (akun dibuat owner; tanpa daftar mandiri).
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { KotakPesan } from "@/components/umum/kotak-pesan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { klienBrowser } from "@/lib/supabase/client";
import { lanjutAman } from "@/lib/teks";

function pesanMasuk(pesan: string) {
  if (/invalid login|invalid_credentials|Invalid/i.test(pesan)) return "Email atau password salah.";
  if (/rate|too many/i.test(pesan)) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (/fetch|network/i.test(pesan)) return "Tidak bisa terhubung ke server. Periksa koneksi.";
  return `Gagal masuk: ${pesan}`;
}

export function FormMasuk({ lanjut }: { lanjut: string | null }) {
  const router = useRouter();
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [lihat, setLihat] = useState(false);

  async function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    setGalat(null);
    if (!email || !password) {
      setGalat("Isi email dan password.");
      return;
    }
    setSibuk(true);
    try {
      const { error } = await klienBrowser().auth.signInWithPassword({ email, password });
      if (error) {
        setGalat(pesanMasuk(error.message));
        return;
      }
      router.replace(lanjutAman(lanjut, "/saya", ["/masuk"]));
      router.refresh();
    } catch (err) {
      setGalat(pesanMasuk(err instanceof Error ? err.message : String(err)));
    } finally {
      setSibuk(false);
    }
  }

  return (
    <form method="post" onSubmit={kirim} noValidate className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} autoFocus required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="flex gap-2">
          <Input id="password" name="password" type={lihat ? "text" : "password"} autoComplete="current-password" required />
          <Button type="button" variant="outline" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan password" : "Tampilkan password"}>
            {lihat ? "Sembunyi" : "Lihat"}
          </Button>
        </div>
      </div>
      {galat ? <KotakPesan nada="galat">{galat}</KotakPesan> : null}
      <Button type="submit" className="w-full" size="lg" disabled={sibuk}>
        {sibuk ? "Memeriksa…" : "Masuk"}
      </Button>
    </form>
  );
}
