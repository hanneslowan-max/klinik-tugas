// Database pelanggan & log repeat order (17 Okt 2026, migrasi 20261017120000): layar /pipeline/pelanggan (cari,
// saringan Repeat order), detail pelanggan (ringkasan, log "Order ke-N", kontak; peran baca tanpa kontak), riwayat
// pelanggan di detail lead + label Repeat di daftar lead, saran pelanggan lama di form Lead baru, ubah pelanggan, dan
// gabung pelanggan dobel + batal (admin). Seed sintetis tidak punya data Pipeline → tiap tes menyiapkan akses + 2
// pelanggan (ejaan dobel) lewat psql lokal dan membersihkannya.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, diHp, masuk, sqlLokal } from "./bantu";

const NAMA = "PT Uji Repeat Pelanggan";
const NAMA_DOBEL = "pt. uji repeat pelanggan";
const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

let plA = ""; // 2 order (Jan & Mei) + 1 lead BARU hari ini
let plB = ""; // ejaan dobel: 1 order (Mar)
let [o1, o2, baru, o3] = ["", "", "", ""];

function bersihkan() {
  sqlLokal(
    `delete from public.pelanggan_gabung where ke_id in (select id from public.pelanggan where nama in ('${NAMA}', '${NAMA_DOBEL}'))` +
      ` or dari ->> 'nama' in ('${NAMA}', '${NAMA_DOBEL}');` +
      ` delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama in ('${NAMA}', '${NAMA_DOBEL}'));` +
      ` delete from public.pelanggan where nama in ('${NAMA}', '${NAMA_DOBEL}');` +
      ` delete from public.pipeline_akses where member_id in (${AKUN.citra.id}, ${AKUN.dodi.id});`,
  );
}

test.beforeEach(() => {
  bersihkan();
  [plA, plB] = [`pl${acak()}`, `pl${acak()}`];
  [o1, o2, baru, o3] = [`ld${acak()}`, `ld${acak()}`, `ld${acak()}`, `ld${acak()}`];
  const ini = sqlLokal(`select to_char(public.hari_ini_wib(), 'YYYY-MM-DD')`);
  const th = Number(ini.slice(0, 4)) - 1; // order tahun lalu: tanggal & bulan SP tetap sah
  const nomor = 10000 + Math.floor(Math.random() * 80000);
  const sp = (n: number, bln: number) => `${n}/RSG/${ROMAWI[bln - 1]}/${th}`;
  sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${AKUN.citra.id}, 'rep', 'RSG'), (${AKUN.dodi.id}, 'baca', null);` +
      ` insert into public.pelanggan (id, nama, kota) values ('${plA}', '${NAMA}', 'Surabaya'), ('${plB}', '${NAMA_DOBEL}', null);` +
      ` insert into public.kontak (pelanggan_id, nama, telepon, telepon_tampil) values ('${plA}', 'Ibu Sari Uji', '6281299990001', '0812-9999-0001');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, tanggal_masuk, no_sp, tanggal_sp, nilai_transaksi) values` +
      ` ('${o1}', '${plA}', 'Google Ads', ${AKUN.citra.id}, 'ORDER', '${th}-01-05', '${sp(nomor, 1)}', '${th}-01-10', 10000000),` +
      ` ('${o2}', '${plA}', 'WA langsung', ${AKUN.citra.id}, 'ORDER', '${th}-05-02', '${sp(nomor + 1, 5)}', '${th}-05-10', 5000000),` +
      ` ('${baru}', '${plA}', 'Google Ads', ${AKUN.citra.id}, 'BARU', '${ini}', null, null, null),` +
      ` ('${o3}', '${plB}', 'Telepon', ${AKUN.citra.id}, 'ORDER', '${th}-03-01', '${sp(nomor + 2, 3)}', '${th}-03-01', 2000000);` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${o1}', 'Pallet Mesh', 40), ('${o2}', 'Pallet Mesh', 20),` +
      ` ('${baru}', 'Roda', 8), ('${o3}', 'Locker', 2);`,
  );
});

test.afterEach(() => bersihkan());

const kartu = (page: Page, id: string) => page.locator(`[data-uji="baris-pelanggan"][data-id="${id}"]`);
const logLead = (page: Page, id: string) => page.locator(`[data-uji="log-lead"][data-id="${id}"]`);

test("daftar pelanggan: dari menu Pipeline, cari ejaan berbeda, saringan Repeat order", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  // HP/tablet: tautan ada di menu ⋯ kepala halaman; desktop: tombol berlabel di kepala halaman
  if (diHp(page)) {
    await page.getByTestId("menu-pipeline").click();
    await page.getByTestId("menu-tautan-pelanggan").click();
  } else {
    await page.getByTestId("tautan-pelanggan").click();
  }
  await expect(page).toHaveURL(/\/pipeline\/pelanggan$/);

  // kunci nama: "uji repeat pelanggan" menemukan kedua ejaan
  await page.getByTestId("cari-pelanggan").fill("uji repeat pelanggan");
  await expect(kartu(page, plA)).toBeVisible();
  await expect(kartu(page, plB)).toBeVisible();
  await expect(kartu(page, plA).getByTestId("chip-pelanggan-repeat")).toBeVisible();
  await expect(kartu(page, plA)).toContainText("3 lead · 2 order · Rp15.000.000");
  await expect(kartu(page, plA)).toContainText("Ibu Sari Uji");
  await expect(kartu(page, plB).getByTestId("chip-pelanggan-repeat")).toHaveCount(0);

  await page.getByTestId("saring-pelanggan-repeat").click();
  await expect(page).toHaveURL(/s=repeat/);
  await expect(kartu(page, plA)).toBeVisible();
  await expect(kartu(page, plB)).toHaveCount(0);

  // cari lewat nomor HP (format lain)
  await page.getByTestId("saring-pelanggan-semua").click();
  await page.getByTestId("cari-pelanggan").fill("0812 9999 0001");
  await expect(kartu(page, plA)).toBeVisible();
  await expect(kartu(page, plB)).toHaveCount(0);
});

test("detail pelanggan: ringkasan repeat, log Order ke-N, lalu riwayat pelanggan di detail lead & label Repeat", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/pipeline/pelanggan/${plA}`);
  await expect(page.getByTestId("info-repeat")).toContainText("Sudah order 2×");
  await expect(page.getByTestId("kontak-pelanggan")).toContainText("Ibu Sari Uji · 0812-9999-0001");
  await expect(page.getByTestId("log-lead")).toHaveCount(3);
  await expect(logLead(page, o1).getByTestId("chip-order-ke")).toHaveText("Order ke-1");
  await expect(logLead(page, o2).getByTestId("chip-order-ke")).toHaveText("Order ke-2");
  await expect(logLead(page, baru).getByTestId("chip-order-ke")).toHaveCount(0);
  // rep bukan admin: tanpa saran gabung
  await expect(page.getByTestId("mungkin-sama")).toHaveCount(0);

  // log → detail lead BARU: bagian riwayat pelanggan
  await logLead(page, baru).click();
  await expect(page).toHaveURL(new RegExp(`/pipeline/${baru}$`));
  await expect(page.getByTestId("ringkas-riwayat-pelanggan")).toContainText("sudah order 2×");
  await expect(page.getByTestId("riwayat-pelanggan-lead")).toHaveCount(2);
  await page.getByTestId("tautan-pelanggan-lead").click();
  await expect(page).toHaveURL(new RegExp(`/pipeline/pelanggan/${plA}$`));

  // label Repeat di daftar lead (lead BARU dari pelanggan yang sudah 2× order)
  await page.goto("/pipeline");
  await page.getByTestId("cari-lead").fill(NAMA);
  const baris = page.getByTestId("baris-lead").filter({ hasText: "Roda" });
  await expect(baris.getByTestId("chip-repeat")).toHaveText("Repeat 2×");
});

test("peran baca: kontak & nomor HP disembunyikan, tanpa tombol ubah", async ({ page }) => {
  await masuk(page, AKUN.dodi.email);
  await page.goto(`/pipeline/pelanggan/${plA}`);
  await expect(page.getByTestId("log-lead")).toHaveCount(3);
  await expect(page.locator("dl").first()).toContainText("disembunyikan");
  await expect(page.getByText("0812-9999-0001")).toHaveCount(0);
  await expect(page.getByTestId("aksi-ubah-pelanggan")).toHaveCount(0);
});

test("form Lead baru: saran pelanggan lama menampilkan jumlah order", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/pipeline");
  await page.getByTestId("tombol-lead-baru").filter({ visible: true }).click();
  await page.getByTestId("lb-nama").fill("Uji Repeat Pelanggan");
  const saran = page.getByTestId("saran-pelanggan");
  await expect(saran).toContainText(NAMA);
  await expect(saran).toContainText("2 order");
  await saran.getByRole("button").filter({ hasText: NAMA }).click();
  await expect(page.getByTestId("lb-pelanggan-lama")).toContainText("2 order");
});

test("ubah data pelanggan (rep)", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/pipeline/pelanggan/${plB}`);
  await page.getByTestId("aksi-ubah-pelanggan").click();
  const dialog = page.getByTestId("dialog-ubah-pelanggan");
  await dialog.locator("#up-kota").fill("Sidoarjo");
  await dialog.getByTestId("kirim-ubah-pelanggan").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Data pelanggan diperbarui" })).toBeVisible();
  await expect(page.locator("dl").first()).toContainText("Sidoarjo");
  expect(sqlLokal(`select kota from public.pelanggan where id = '${plB}'`)).toBe("Sidoarjo");
});

test("admin: gabungkan ejaan dobel lalu batalkan", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await page.goto(`/pipeline/pelanggan/${plA}`);
  const kandidat = page.locator(`[data-uji="kandidat-sama"][data-id="${plB}"]`);
  await expect(kandidat).toContainText("Nama sama");
  await kandidat.getByTestId("gabung-ke-sini").click();
  await page.getByTestId("konfirmasi-ya").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: `digabung ke ${NAMA}` })).toBeVisible();

  // order Mar dari ejaan dobel kini ikut log → order ke-2; order Mei jadi ke-3
  await expect(page.getByTestId("log-lead")).toHaveCount(4);
  await expect(logLead(page, o3).getByTestId("chip-order-ke")).toHaveText("Order ke-2");
  await expect(logLead(page, o2).getByTestId("chip-order-ke")).toHaveText("Order ke-3");
  await expect(page.getByTestId("riwayat-gabung")).toContainText(`Digabung dari ${NAMA_DOBEL}`);
  expect(sqlLokal(`select pelanggan_id from public.lead where id = '${o3}'`)).toBe(plA);

  // tautan lama ke pelanggan yang sudah digabung → dialihkan
  await page.goto(`/pipeline/pelanggan/${plB}`);
  await expect(page).toHaveURL(new RegExp(`/pipeline/pelanggan/${plA}$`));

  await page.getByTestId("riwayat-gabung").getByTestId("batal-gabung").click();
  await page.getByTestId("konfirmasi-ya").click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: `${NAMA_DOBEL} dipulihkan` })).toBeVisible();
  await expect(page.getByTestId("log-lead")).toHaveCount(3);
  expect(sqlLokal(`select pelanggan_id from public.lead where id = '${o3}'`)).toBe(plB);
  await expect(page.getByTestId("riwayat-gabung")).toContainText("Dibatalkan");
});

test("admin: saran gabung (layar khusus) — tandai bukan dobel", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await page.goto("/pipeline/pelanggan");
  await page.getByTestId("tautan-saran-gabung").click();
  await expect(page).toHaveURL(/\/pipeline\/pelanggan\/dobel$/);
  const kelompok = page.locator(`[data-uji="kelompok-dobel"][data-kunci="nama:${[plA, plB].sort().join(",")}"]`);
  await expect(kelompok).toContainText(NAMA);
  await expect(kelompok).toContainText(NAMA_DOBEL);
  await kelompok.getByTestId("bukan-dobel-kelompok").click();
  await expect(kelompok).toHaveCount(0);
  expect(sqlLokal(`select count(*) from public.pelanggan_dobel_abaikan where kunci = 'nama:${[plA, plB].sort().join(",")}'`)).toBe("1");
  sqlLokal(`delete from public.pelanggan_dobel_abaikan where kunci = 'nama:${[plA, plB].sort().join(",")}'`);
});

test("layar pelanggan tanpa gulir mendatar (HP & desktop)", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  for (const url of ["/pipeline/pelanggan", `/pipeline/pelanggan/${plA}`, "/pipeline/pelanggan/dobel"]) {
    await page.goto(url);
    await expect(page.getByTestId(url.endsWith("dobel") ? "kelompok-dobel" : url.endsWith(plA) ? "log-lead" : "baris-pelanggan").first()).toBeVisible();
    const lebar = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(lebar[0], `${url} (${diHp(page) ? "HP" : "desktop"})`).toBeLessThanOrEqual(lebar[1]);
  }
});
