import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function TidakDitemukan() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">Halaman tidak ditemukan</h1>
      <p className="text-sm text-muted-foreground">Alamat ini tidak ada di aplikasi Tugas RHJ.</p>
      <Button asChild>
        <Link href="/saya">Ke Tugas Saya</Link>
      </Button>
    </main>
  );
}
