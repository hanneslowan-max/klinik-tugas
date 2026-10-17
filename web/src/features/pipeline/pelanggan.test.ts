import { describe, expect, it } from "vitest";

import { namaPelanggan, tanggalLog } from "@/features/pipeline/konstanta";
import { nomorOrder, ringkasStatistik } from "@/features/pipeline/pelanggan";
import type { TahapLead } from "@/types/domain";

const lead = (id: string, tahap: TahapLead, tanggal_masuk: string, tanggal_sp: string | null = null) => ({
  id, kode: `UPG-${id}`, tahap, tanggal_masuk, tanggal_sp,
});

describe("nomorOrder", () => {
  it("urut tanggal SP (bukan tanggal masuk), lead bukan ORDER tidak bernomor", () => {
    const n = nomorOrder([
      lead("1", "ORDER", "2026-01-02", "2026-06-15"),
      lead("2", "ORDER", "2026-03-01", "2026-04-01"),
      lead("3", "BARU", "2026-05-01"),
      lead("4", "BATAL", "2026-02-01"),
    ]);
    expect([...n.entries()]).toEqual([["2", 1], ["1", 2]]);
  });
  it("tanpa SP pakai tanggal masuk; tanggal sama → urut kode", () => {
    const n = nomorOrder([lead("9", "ORDER", "2026-03-01"), lead("5", "ORDER", "2026-03-01"), lead("7", "ORDER", "2026-01-01", "2026-03-01")]);
    expect([...n.entries()]).toEqual([["5", 1], ["7", 2], ["9", 3]]);
  });
});

describe("ringkasStatistik", () => {
  it("tanpa order hanya jumlah lead; dengan order + nilai", () => {
    expect(ringkasStatistik({ jml_lead: 1, jml_order: 0, nilai_order: 0 })).toBe("1 lead");
    expect(ringkasStatistik({ jml_lead: 3, jml_order: 2, nilai_order: 12_500_000 })).toBe("3 lead · 2 order · Rp12.500.000");
  });
});

describe("namaPelanggan", () => {
  it("nama asli apa adanya; nama semu → PIC, tanpa PIC → Perorangan", () => {
    expect(namaPelanggan({ nama: "PT Berkah", semu: false, pic: "Rina" })).toBe("PT Berkah");
    expect(namaPelanggan({ nama: "-", semu: true, pic: "Pak Joko" })).toBe("Pak Joko");
    expect(namaPelanggan({ nama: "Perorangan", semu: true, pic: null })).toBe("Perorangan");
    expect(namaPelanggan({ nama: "Pribadi", semu: true, pic: "  " })).toBe("Perorangan");
  });
});

describe("tanggalLog", () => {
  it("tanggal SP untuk lead ber-SP (order / order dibatalkan), selain itu tanggal masuk", () => {
    expect(tanggalLog({ tanggal_masuk: "2026-01-02", tanggal_sp: "2026-06-15", no_sp: "1/RSG/VI/2026" })).toBe("2026-06-15");
    expect(tanggalLog({ tanggal_masuk: "2026-01-02", tanggal_sp: null, no_sp: null })).toBe("2026-01-02");
  });
});
