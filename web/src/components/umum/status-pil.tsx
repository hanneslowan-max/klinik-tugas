import { cn } from "@/lib/utils";
import { warnaAman } from "@/lib/teks";

/** Pil status (nama status ClickUp apa adanya) dengan titik warna status. */
export function StatusPil({ nama, warna, className }: { nama: string | null | undefined; warna?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
      data-status={nama ?? ""}
    >
      <TitikWarna warna={warna} />
      <span className="truncate">{nama || "—"}</span>
    </span>
  );
}

export function TitikWarna({ warna, className }: { warna?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: warnaAman(warna) ?? "#999999" }}
    />
  );
}
