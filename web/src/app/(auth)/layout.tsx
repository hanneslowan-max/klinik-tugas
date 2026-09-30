/** Layar tanpa kerangka (masuk, ganti password): kartu di tengah layar. */
export default function LayoutAuth({ children }: LayoutProps<"/">) {
  return (
    <main id="isi" className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
