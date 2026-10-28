// Jelajah per kategori pekerjaan (28 Okt 2026): kartu kategori + hitungan, isi kategori lintas list dikelompokkan per
// tenggat, saring per orang & tampilkan selesai (tanpa RSC), atur kategori di detail (juga kartu ClickUp di mode
// cermin), Tugas baru dari halaman kategori (pilih list, kategori terisi), Admin › Kategori (tambah/ganti nama/
// geser/hapus). Data uji per proyek (hp/desktop jalan bersamaan) dibuat & dibersihkan lewat SQL lokal.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, masuk, SEED, sqlLokal } from "./bantu";

type Uji = { p: string; P: string; kat: string; nama: string; cu: string };

function data(proyek: string): Uji {
  const p = proyek === "hp" ? "h" : "d";
  // id kartu ClickUp unik per jalan: riwayat (activity) append-only tetap tersimpan sesudah kartunya dihapus
  const cu = `e2ekat${p}cu${Date.now().toString(36)}`;
  return { p, P: proyek.toUpperCase(), kat: `kke2e${p}01`, nama: `E2E Jelajah ${proyek.toUpperCase()}`, cu };
}

function bersihkan({ p, P }: Uji) {
  sqlLokal(`select set_config('app.sumber', 'impor', false), set_config('app.actor_id', '${AKUN.owner.id}', false);
    delete from public.tasks where id like 'rte2ekat${p}%' or id like 'e2ekat${p}cu%' or name like 'E2E ${P} buat%';
    delete from public.kategori_kerja where id like 'kke2e${p}%' or nama like 'E2E Admin ${P}%';`);
}

function siapkan(u: Uji) {
  bersihkan(u);
  const { p, P, kat, nama } = u;
  const dueTelat = `(((now() at time zone 'Asia/Jakarta')::date - 2) + time '12:00') at time zone 'Asia/Jakarta'`;
  sqlLokal(`select set_config('app.sumber', 'ui', false), set_config('app.actor_id', '${AKUN.owner.id}', false);
    insert into public.kategori_kerja (id, nama, urutan) values ('${kat}', '${nama}', 90);
    insert into public.tasks (id, list_id, name, due_at, kategori_id) values
      ('rte2ekat${p}1', '${SEED.listApp}', 'E2E ${P} telat milik Citra', ${dueTelat}, '${kat}'),
      ('rte2ekat${p}2', '${SEED.listApp}', 'E2E ${P} tanpa due milik Dodi', null, '${kat}'),
      ('rte2ekat${p}3', '${SEED.listApp}', 'E2E ${P} sudah selesai', null, '${kat}');
    insert into public.task_assignees (task_id, member_id) values
      ('rte2ekat${p}1', ${AKUN.citra.id}), ('rte2ekat${p}2', ${AKUN.dodi.id});
    update public.tasks set status = 'complete' where id = 'rte2ekat${p}3';`);
  // kartu bergaya ClickUp (hanya-baca di mode cermin) tanpa kategori
  sqlLokal(`select set_config('app.sumber', 'impor', false), set_config('app.actor_id', '900000000002', false);
    insert into public.tasks (id, list_id, name, sumber, synced_at) values
      ('${u.cu}', '${SEED.listClickUp}', 'E2E ${P} kartu ClickUp tanpa kategori', 'clickup', now());`);
}

let u: Uji;
test.beforeEach(({}, info) => {
  u = data(info.project.name);
  siapkan(u);
});
test.afterEach(() => bersihkan(u));

const tidakMelebar = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test("Jelajah: kartu kategori + hitungan → isi kategori lintas list, saring orang, tampilkan selesai tanpa RSC", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto("/jelajah");
  for (const n of ["Ads", "Konten", "SEO", "Pipeline", "Tanpa kategori"]) {
    await expect(page.getByTestId("kartu-kategori")).toContainText(n);
  }
  const kartu = page.locator(`[data-kategori="${u.kat}"]`);
  await expect(kartu).toContainText(u.nama);
  await expect(kartu.getByTestId("hitungan-terbuka")).toHaveText("2 terbuka");
  await expect(kartu).toContainText("1 telat");
  await expect(page.locator(`[data-kategori="tanpa"]`)).toContainText(/\d+ terbuka/);
  // owner saja yang melihat tautan Atur kategori
  await expect(page.getByTestId("atur-kategori")).toHaveCount(0);
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);

  await kartu.click();
  await expect(page).toHaveURL(new RegExp(`/jelajah/${u.kat}$`));
  await expect(page.getByTestId("judul-halaman")).toHaveText(u.nama);
  const telat = page.locator("[data-grup=telat]");
  await expect(telat.getByTestId("baris-tugas")).toHaveCount(1);
  await expect(telat).toContainText(`E2E ${u.P} telat milik Citra`);
  await expect(telat).toContainText("Latihan Uji"); // nama list tampil (lintas list)
  await expect(page.locator("[data-grup=tanpa_due]")).toContainText(`E2E ${u.P} tanpa due milik Dodi`);
  await expect(page.getByText(`E2E ${u.P} sudah selesai`)).toHaveCount(0);
  expect(await tidakMelebar(page)).toBeLessThanOrEqual(0);

  // navigasi RSC (bukan prefetch tautan baris) = halaman dimuat ulang dari server
  const rsc: string[] = [];
  page.on("request", (r) => {
    const h = r.headers();
    if ((h["rsc"] === "1" || new URL(r.url()).searchParams.has("_rsc")) && !h["next-router-prefetch"]) rsc.push(r.url());
  });

  // saring orang (?m) — hanya kartu milik Citra
  await page.getByTestId("saring-orang").click();
  await page.getByRole("option", { name: `Saya (${AKUN.citra.username})` }).click();
  await expect(page).toHaveURL(new RegExp(`/jelajah/${u.kat}\\?m=${AKUN.citra.id}$`));
  await expect(page.getByText(`E2E ${u.P} tanpa due milik Dodi`)).toHaveCount(0);
  await expect(page.getByText(`E2E ${u.P} telat milik Citra`)).toBeVisible();

  // tampilkan selesai (?selesai=1) — saringan orang tetap; kartu selesai tanpa assignee ikut tersaring
  await page.getByTestId("saring-orang").click();
  await page.getByRole("option", { name: "Semua orang" }).click();
  await expect(page.getByTestId("alih-selesai")).toHaveText("Tampilkan selesai (1)");
  await page.getByTestId("alih-selesai").click();
  await expect(page).toHaveURL(new RegExp(`/jelajah/${u.kat}\\?selesai=1$`));
  await expect(page.locator("[data-grup=selesai]")).toContainText(`E2E ${u.P} sudah selesai`);
  await expect(page.getByTestId("alih-selesai")).toHaveText("Sembunyikan selesai");
  expect(rsc, "saring & alih selesai tidak boleh memicu RSC").toEqual([]);

  // muat langsung dengan parameter URL
  await page.goto(`/jelajah/${u.kat}?m=${AKUN.dodi.id}&selesai=1`);
  await expect(page.getByText(`E2E ${u.P} tanpa due milik Dodi`)).toBeVisible();
  await expect(page.getByText(`E2E ${u.P} telat milik Citra`)).toHaveCount(0);
  await expect(page.getByTestId("alih-selesai")).toHaveText("Sembunyikan selesai");

  await page.goto("/jelajah/kkbukanada");
  await expect(page.getByText("Kategori tidak ditemukan")).toBeVisible();
});

test("detail: atur kategori kartu ClickUp di mode cermin → pindah kelompok Jelajah, tercatat di riwayat", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/t/${u.cu}`);
  const pilih = page.getByTestId("pilih-kategori");
  await expect(pilih).toHaveText("— tanpa kategori —");
  await pilih.click();
  await page.getByRole("option", { name: u.nama }).click();
  await expect(page.getByText("Kategori disimpan")).toBeVisible();
  await expect(pilih).toHaveText(u.nama);
  expect(sqlLokal(`select kategori_id from public.tasks where id = '${u.cu}'`)).toBe(u.kat);
  // field lain kartu ClickUp tetap terkunci (status hanya-baca)
  await expect(page.getByTestId("pilih-status")).toHaveCount(0);

  await page.getByRole("tab", { name: /Riwayat/ }).click();
  await expect(page.getByText(`mengatur kategori "${u.nama}"`)).toBeVisible();

  await page.goto(`/jelajah/${u.kat}`);
  await expect(page.locator("[data-grup=tanpa_due]")).toContainText(`E2E ${u.P} kartu ClickUp tanpa kategori`);
});

test("Tugas baru dari halaman kategori: pilih list (list app saja di mode cermin), kategori terisi", async ({ page }) => {
  await masuk(page, AKUN.citra.email);
  await page.goto(`/jelajah/${u.kat}`);
  await expect(page.getByTestId("judul-halaman")).toHaveText(u.nama);
  await page.getByTestId("buat-tugas").click();
  const dialog = page.getByTestId("dialog-buat-tugas");
  await expect(dialog).toContainText("Tugas baru");
  await expect(dialog.getByTestId("pilih-kategori-buat")).toHaveText(u.nama);
  await dialog.getByLabel("Nama tugas").fill(`E2E ${u.P} buat dari kategori`);
  // tanpa list → ditolak dengan pesan
  await dialog.getByTestId("kirim-buat-tugas").click();
  await expect(dialog.getByText("Pilih list tujuan.")).toBeVisible();
  await dialog.getByTestId("pilih-list-buat").click();
  // list ClickUp (hanya-baca di mode cermin) tidak ditawarkan
  await expect(page.getByRole("option", { name: /Fase Uji 1/ })).toHaveCount(0);
  await page.getByRole("option", { name: /Latihan Uji/ }).click();
  await dialog.getByTestId("kirim-buat-tugas").click();
  await expect(page).toHaveURL(/\/t\/rt[0-9a-z]+$/);
  await expect(page.getByTestId("pilih-kategori")).toHaveText(u.nama);
  expect(sqlLokal(`select k.nama from public.tasks t join public.kategori_kerja k on k.id = t.kategori_id where t.name = 'E2E ${u.P} buat dari kategori'`)).toBe(
    u.nama,
  );
});

test("Admin › Kategori: tambah, ganti nama, geser, hapus (tugas kembali tanpa kategori)", async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await page.goto("/jelajah");
  await page.getByTestId("atur-kategori").click();
  await expect(page).toHaveURL(/\/admin\/kategori$/);
  const daftar = page.getByTestId("daftar-kategori");
  await expect(daftar).toContainText("Ads");

  const baru = `E2E Admin ${u.P}`;
  await page.getByLabel("Nama kategori").fill(baru);
  await page.getByTestId("tambah-kategori").click();
  await expect(daftar.locator("[data-kategori]").last()).toContainText(baru);
  await page.getByLabel("Nama kategori").fill("ads");
  await page.getByTestId("tambah-kategori").click();
  await expect(page.getByText('Kategori "ads" sudah ada')).toBeVisible();

  // baris dikunci lewat id (saat disunting, nama ada di <input> sehingga hasText tidak cocok lagi)
  const idBaru = await daftar.locator("[data-kategori]", { hasText: baru }).getAttribute("data-kategori");
  const baris = daftar.locator(`[data-kategori="${idBaru}"]`);
  await baris.getByRole("button", { name: `Ganti nama ${baru}` }).click();
  await baris.getByLabel(`Nama baru untuk ${baru}`).fill(`${baru} Dua`);
  await baris.getByRole("button", { name: "Simpan nama" }).click();
  await expect(page.getByText("Nama kategori disimpan")).toBeVisible();
  const baris2 = baris;
  await expect(baris2).toContainText(`${baru} Dua`);
  await expect(baris2).toContainText("0 tugas");

  // geser naik satu langkah: tidak lagi di urutan terakhir
  await baris2.getByRole("button", { name: `Naikkan ${baru} Dua` }).click();
  await expect(daftar.locator("[data-kategori]").last()).not.toContainText(`${baru} Dua`);

  // kategori uji (3 tugas) dihapus → tugasnya tanpa kategori
  const barisUji = daftar.locator(`[data-kategori="${u.kat}"]`);
  await expect(barisUji).toContainText("3 tugas");
  await barisUji.getByRole("button", { name: `Hapus ${u.nama}` }).click();
  await expect(page.getByRole("alertdialog")).toContainText('3 tugas di dalamnya kembali menjadi "Tanpa kategori"');
  await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
  await expect(barisUji).toHaveCount(0);
  expect(sqlLokal(`select count(*) from public.tasks where id like 'rte2ekat${u.p}%' and kategori_id is null`)).toBe("3");

  await daftar.locator("[data-kategori]", { hasText: `${baru} Dua` }).getByRole("button", { name: `Hapus ${baru} Dua` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
  await expect(daftar).not.toContainText(baru);

  await page.goto("/jelajah");
  await expect(page.getByTestId("kartu-kategori")).not.toContainText(u.nama);
});
