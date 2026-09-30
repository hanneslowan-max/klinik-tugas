import { describe, expect, it } from "vitest";

import { idDariRujukan } from "@/features/cari/rujukan";

describe("idDariRujukan", () => {
  it("URL tugas ClickUp (dengan/tanpa ID workspace)", () => {
    expect(idDariRujukan("https://app.clickup.com/t/86b2a0009")).toBe("86b2a0009");
    expect(idDariRujukan("https://app.clickup.com/t/1100340000004525/86b2a0009")).toBe("86b2a0009");
  });
  it("tautan kartu aplikasi", () => {
    expect(idDariRujukan("https://tugas.palletmeshindonesia.com/t/rtab12cd34")).toBe("rtab12cd34");
    expect(idDariRujukan("/t/z8r3uj0001?tab=riwayat")).toBe("z8r3uj0001");
  });
  it("teks biasa bukan rujukan", () => {
    expect(idDariRujukan("ringkasan kampanye")).toBeNull();
    expect(idDariRujukan("https://app.clickup.com/1100340000004525/v/l/6-901-1")).toBeNull();
  });
});
