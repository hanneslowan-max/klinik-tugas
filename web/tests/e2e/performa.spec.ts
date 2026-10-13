// Revisi performa: umpan balik navigasi instan (useLinkStatus), tab/filter lewat URL dangkal (tanpa RSC), cache
// router + gcTime aman saat ganti akun, simpan detail tanpa refetch ganda, dan akses Pipeline dari server.
// Data uji dibuat sementara (psql lokal) dan selalu dibersihkan di finally.
import { expect, test, type Page, type Request } from "@playwright/test";

import { AKUN, SANDI, SEED, diHp, keluar, masuk, sqlLokal } from "./bantu";

/** Permintaan navigasi RSC (bukan prefetch): header `rsc` / query `_rsc` tanpa penanda prefetch. */
function rscNavigasi(r: Request) {
  const h = r.headers();
  return (h["rsc"] === "1" || new URL(r.url()).searchParams.has("_rsc")) && !h["next-router-prefetch"];
}

/** POST /rest/v1/rpc/<fungsi> dari browser. */
function rpcKe(r: Request, fungsi: string) {
  return r.method() === "POST" && new URL(r.url()).pathname === `/rest/v1/rpc/${fungsi}`;
}

/** Tahan setiap navigasi RSC selama `ms` (mensimulasikan server/jaringan lambat). */
async function tahanRsc(page: Page, ms: number) {
  await page.route("**/*", async (route) => {
    if (rscNavigasi(route.request())) await new Promise((r) => setTimeout(r, ms));
    await route.fallback();
  });
}

function sebagai(id: number, sql: string): string {
  const uid = sqlLokal(`select auth_user_id from public.members where id = ${id}`);
  return sqlLokal(
    `begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); set local role authenticated; ` +
      `${sql}; commit;`,
  )
    .split("\n")
    .filter((b) => b && b !== "BEGIN" && b !== "COMMIT")
    .pop() as string;
}

/** Kartu app sementara di list "Latihan Uji" milik budi; kembalikan id-nya. */
function buatKartu(nama: string, extra: Record<string, unknown> = {}): string {
  const body = JSON.stringify({ name: nama, assignees: [AKUN.owner.id], ...extra }).replace(/'/g, "''");
  return sebagai(AKUN.owner.id, `select (public.web_buat_tugas('${SEED.listApp}', '${body}'::jsonb))->>'id'`);
}

/** Hapus permanen kartu uji (ke Sampah lalu purge) supaya tidak menumpuk di list seed. */
function hapusKartu(id: string) {
  sebagai(AKUN.owner.id, `select public.web_hapus('${id}'); select public.web_purge('${id}')`);
}

/** Beri akses Pipeline sementara; kembalikan fungsi pembersih (hanya menghapus baris yang ditambahkan di sini). */
function beriAksesPipeline(member: number, peran: "admin" | "rep" | "baca"): () => void {
  const ditambah = sqlLokal(
    `insert into public.pipeline_akses (member_id, peran, kode_sp) values (${member}, '${peran}', 'UJIPERF') on conflict (member_id) do nothing returning member_id`,
  );
  return () => {
    if (ditambah) sqlLokal(`delete from public.pipeline_akses where member_id = ${member} and kode_sp = 'UJIPERF'`);
  };
}

const tautanNav = (page: Page, href: string) =>
  diHp(page) ? page.locator(`nav[data-uji="nav-bawah"] a[href="${href}"]`) : page.locator(`aside a[href="${href}"]`);

test.describe("umpan balik navigasi (P3)", () => {
  test("tap menu: tanda menunggu ≤100 ms dan sorotan aktif sebelum URL berganti", async ({ page }) => {
    await masuk(page, AKUN.owner.email);
    await page.waitForLoadState("networkidle");
    await tahanRsc(page, 600);
    const sel = diHp(page) ? 'nav[data-uji="nav-bawah"] a[href="/jelajah"]' : 'aside a[href="/jelajah"]';
    const hasil = await page.evaluate(async (sel) => {
      const a = document.querySelector<HTMLAnchorElement>(sel)!;
      const t0 = performance.now();
      a.click();
      return await new Promise<{ dt: number; path: string; primer: boolean }>((selesai) => {
        const cek = () => {
          const ind = a.querySelector('[data-uji="indikator-navigasi"][data-pending]');
          const dt = performance.now() - t0;
          if (ind || dt > 2000) {
            selesai({ dt: ind ? dt : Infinity, path: location.pathname, primer: !!a.querySelector("svg.text-primary") });
          } else requestAnimationFrame(cek);
        };
        cek();
      });
    }, sel);
    expect(hasil.dt).toBeLessThanOrEqual(100);
    expect(hasil.path).toBe("/saya");
    expect(hasil.primer).toBe(true);
    await expect(page).toHaveURL(/\/jelajah$/);
    await expect(page.locator(sel)).toHaveAttribute("aria-current", "page");
    await expect(page.locator(`${sel} [data-uji="indikator-navigasi"][data-pending]`)).toHaveCount(0);
  });

  test("HP: Lembar Menu tetap terbuka sampai halaman berganti, lalu tertutup", async ({ page }) => {
    test.skip(!diHp(page), "khusus HP (Lembar Menu)");
    await masuk(page, AKUN.owner.email);
    await page.waitForLoadState("networkidle");
    await tahanRsc(page, 800);
    await page.getByTestId("tombol-menu").click();
    const lembar = page.getByRole("dialog");
    await expect(lembar).toBeVisible();
    await page.getByTestId("menu-notif").click();
    await expect(page.locator('[data-uji="menu-notif"] [data-uji="indikator-navigasi"][data-pending]')).toBeAttached({ timeout: 300 });
    expect(new URL(page.url()).pathname).toBe("/saya");
    await expect(lembar).toBeVisible();
    await expect(page).toHaveURL(/\/notif$/);
    await expect(lembar).toBeHidden();
  });
});

test.describe("URL dangkal tanpa RSC (P7)", () => {
  test("Tugas Saya: Daftar↔Papan & pilih anggota tanpa permintaan RSC; Ctrl+klik membuka tab baru", async ({ page, context }) => {
    await masuk(page, AKUN.owner.email);
    await expect(page.getByText(/kartu terbuka/)).toBeVisible();
    await page.waitForLoadState("networkidle");
    const rsc: string[] = [];
    page.on("request", (r) => {
      if (rscNavigasi(r)) rsc.push(r.url());
    });

    await page.getByTestId("tab-board").click();
    await expect(page).toHaveURL(/\/saya\?v=board$/);
    await expect(page.getByTestId("papan-saya")).toBeVisible();
    await page.getByTestId("tab-daftar").click();
    await expect(page).toHaveURL(/\/saya$/);
    await expect(page.locator("[data-grup]").first()).toBeVisible();
    await page.getByTestId("pilih-pemilik").click();
    await page.getByRole("option", { name: AKUN.citra.username }).click();
    await expect(page).toHaveURL(new RegExp(`/saya\\?m=${AKUN.citra.id}$`));
    await expect(page.getByTestId("judul-halaman")).toHaveText(`Tugas ${AKUN.citra.username}`);
    expect(rsc, "toggle /saya tidak boleh memicu RSC").toEqual([]);

    // Ctrl+klik = buka di tab baru (onNavigate tidak dipanggil); tab asal tidak berubah
    test.skip(diHp(page), "klik bermodifier khusus desktop");
    const [baru] = await Promise.all([context.waitForEvent("page"), page.getByTestId("tab-board").click({ modifiers: ["Control"] })]);
    await baru.waitForURL(new RegExp(`/saya\\?m=${AKUN.citra.id}&v=board$`));
    await expect(baru.getByTestId("papan-saya")).toBeVisible();
    await baru.close();
    await expect(page).toHaveURL(new RegExp(`/saya\\?m=${AKUN.citra.id}$`));
  });

  test("list Daftar↔Papan (pushState), arsip Jelajah, Cari tanpa RSC; Kembali/Maju memulihkan tampilan", async ({ page }) => {
    await masuk(page, AKUN.owner.email);
    await page.goto(`/l/${SEED.listApp}`);
    await expect(page.getByTestId("isi-list")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const rsc: string[] = [];
    page.on("request", (r) => {
      if (rscNavigasi(r)) rsc.push(r.url());
    });
    await page.getByTestId("tab-board").click();
    await expect(page).toHaveURL(new RegExp(`/l/${SEED.listApp}\\?v=board$`));
    await expect(page.getByTestId("papan")).toBeVisible();
    await page.getByTestId("tab-daftar").click();
    await expect(page).toHaveURL(new RegExp(`/l/${SEED.listApp}$`));
    await expect(page.getByTestId("isi-list")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\?v=board$/);
    await expect(page.getByTestId("tab-board")).toHaveAttribute("aria-selected", "true");
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/l/${SEED.listApp}$`));
    await expect(page.getByTestId("tab-daftar")).toHaveAttribute("aria-selected", "true");
    expect(rsc, "toggle list tidak boleh memicu RSC").toEqual([]);

    await page.goto("/jelajah");
    await expect(page.getByRole("link", { name: "Tampilkan arsip" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    rsc.length = 0;
    await page.getByRole("link", { name: "Tampilkan arsip" }).click();
    await expect(page).toHaveURL(/\/jelajah\?arsip=1$/);
    await expect(page.getByRole("link", { name: "Sembunyikan arsip" })).toBeVisible();

    await page.goto("/cari");
    await page.waitForLoadState("networkidle");
    rsc.length = 0;
    await page.getByLabel("Kata kunci").fill("Latihan");
    await page.getByTestId("tombol-cari").click();
    await expect(page).toHaveURL(/\/cari\?q=Latihan$/);
    await expect(page.getByTestId("baris-tugas").first()).toBeVisible();
    expect(rsc, "arsip & cari tidak boleh memicu RSC").toEqual([]);
  });

  test("Pipeline: tab & tampilan tanpa RSC", async ({ page }) => {
    const bersih = beriAksesPipeline(AKUN.owner.id, "admin");
    try {
      await masuk(page, AKUN.owner.email);
      await page.goto("/pipeline");
      await expect(page.getByTestId("cari-lead")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const rsc: string[] = [];
      page.on("request", (r) => {
        if (rscNavigasi(r)) rsc.push(r.url());
      });
      await page.getByRole("tablist", { name: "Saring lead" }).getByRole("tab", { name: "Penawaran" }).click();
      await expect(page).toHaveURL(/\/pipeline\?tab=penawaran$/);
      await page.getByTestId("tab-papan-lead").click();
      await expect(page).toHaveURL(/\/pipeline\?tab=penawaran&v=papan$/);
      await page.getByTestId("tab-daftar-lead").click();
      await expect(page).toHaveURL(/\/pipeline\?tab=penawaran$/);
      expect(rsc, "tab Pipeline tidak boleh memicu RSC").toEqual([]);
    } finally {
      bersih();
    }
  });

  test("muat langsung dengan parameter URL tampil benar", async ({ page }) => {
    await masuk(page, AKUN.owner.email);
    await page.goto(`/saya?m=${AKUN.citra.id}&v=board`);
    await expect(page.getByTestId("judul-halaman")).toHaveText(`Tugas ${AKUN.citra.username}`);
    await expect(page.getByTestId("papan-saya")).toBeVisible();
    await page.goto("/jelajah?arsip=1");
    await expect(page.getByRole("link", { name: "Sembunyikan arsip" })).toBeVisible();
    await page.goto("/cari?q=Latihan");
    await expect(page.getByLabel("Kata kunci")).toHaveValue("Latihan");
    await expect(page.getByTestId("baris-tugas").first()).toBeVisible();
  });
});

test("keluar lalu masuk akun lain di tab yang sama: tidak ada data akun lama (P11/P14)", async ({ page }) => {
  const hp = diHp(page);
  await masuk(page, AKUN.owner.email);
  await expect(page.getByText(/kartu terbuka/)).toBeVisible();
  await tautanNav(page, "/cari").click();
  await expect(page).toHaveURL(/\/cari$/);
  await tautanNav(page, "/saya").click();
  await expect(page).toHaveURL(/\/saya$/);
  await expect(page.getByText(/kartu terbuka/)).toBeVisible();
  await keluar(page, hp);

  await page.locator("#email").fill(AKUN.citra.email);
  await page.locator("#password").fill(SANDI);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/\/saya$/);
  await expect(page.getByText(/kartu terbuka/)).toBeVisible();
  const kartuAkun = async () => {
    if (!hp) return page.locator("aside").innerText();
    await page.getByTestId("tombol-menu").click();
    const t = await page.getByRole("dialog").innerText();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    return t;
  };
  const akun = await kartuAkun();
  expect(akun).toContain(AKUN.citra.email);
  expect(akun).not.toContain(AKUN.owner.email);
  const idDiTab = await page.locator("[data-uji=baris-tugas]").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));

  // kunjungan ulang lewat menu dalam 30 dtk (cache router) tetap data citra
  await tautanNav(page, "/cari").click();
  await expect(page).toHaveURL(/\/cari$/);
  await tautanNav(page, "/saya").click();
  await expect(page).toHaveURL(/\/saya$/);
  await expect(page.getByText(/kartu terbuka/)).toBeVisible();
  const idSesudahNav = await page.locator("[data-uji=baris-tugas]").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));

  await page.reload();
  await expect(page.getByText(/kartu terbuka/)).toBeVisible();
  const idSegar = await page.locator("[data-uji=baris-tugas]").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  expect(idDiTab).toEqual(idSegar);
  expect(idSesudahNav).toEqual(idSegar);
});

test("detail: dua simpan berturut-turut tanpa konflik palsu, web_detail 1× per simpan; toggle List web_daftar 1× (P13)", async ({ page }) => {
  const id = buatKartu("Performa · simpan berurutan");
  try {
    await masuk(page, AKUN.owner.email);
    await page.goto(`/t/${id}`);
    await expect(page.getByTestId("pilih-status")).toBeVisible();
    await page.waitForLoadState("networkidle");
    let detail = 0;
    let daftar = 0;
    page.on("request", (r) => {
      if (rpcKe(r, "web_detail")) detail++;
      if (rpcKe(r, "web_daftar")) daftar++;
    });
    const konflik = page.getByText(/sudah diubah orang lain/);

    await page.getByTestId("pilih-status").click();
    await page.getByRole("option", { name: "in progress" }).click();
    await expect(page.getByText("Status: in progress")).toBeVisible();
    await expect(page.getByTestId("pilih-status")).toContainText("in progress");
    expect(detail).toBe(1);

    await page.getByTestId("pilih-prioritas").click();
    await page.getByRole("option", { name: "Tinggi" }).click();
    await expect(page.getByText("Prioritas disimpan")).toBeVisible();
    await expect(page.getByTestId("pilih-prioritas")).toContainText("Tinggi");
    expect(detail).toBe(2);
    await expect(konflik).toHaveCount(0);
    expect(sqlLokal(`select status || ',' || priority from public.tasks where id = '${id}'`)).toBe("in progress,2");

    // List: toggle selesai = 1 web_daftar (muat ulang dari mutasi), tombol aktif lagi sesudah daftar segar tiba
    await page.goto(`/l/${SEED.listApp}`);
    const baris = page.locator(`[data-uji="baris-tugas"][data-id="${id}"]`);
    await expect(baris).toBeVisible();
    await page.waitForLoadState("networkidle");
    daftar = 0;
    await baris.getByRole("button", { name: /Tandai selesai/ }).click();
    await expect(page.getByText("Tugas ditandai selesai")).toBeVisible();
    await expect(baris).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(daftar).toBe(1);
    await expect(konflik).toHaveCount(0);
  } finally {
    hapusKartu(id);
  }
});

test("akses Pipeline dari server: menu di HTML untuk rep, tidak untuk tanpa akses; tanpa akses tanpa toast (P8)", async ({ page, browser }) => {
  const bersih = beriAksesPipeline(AKUN.citra.id, "rep");
  // dodi tanpa akses (jangan sentuh baris milik tes lain bila ada)
  try {
    await masuk(page, AKUN.citra.email);
    const html = await (await page.request.get("/saya")).text();
    expect(html).toContain('href="/pipeline"');

    const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, locale: "id-ID", timezoneId: "Asia/Jakarta" });
    const p2 = await ctx.newPage();
    try {
      await masuk(p2, AKUN.dodi.email);
      const ada = sqlLokal(`select count(*) from public.pipeline_akses where member_id = ${AKUN.dodi.id}`);
      test.skip(ada !== "0", "dodi sedang diberi akses oleh tes lain");
      const html2 = await (await p2.request.get("/saya")).text();
      expect(html2).not.toContain('href="/pipeline"');
      await p2.goto("/pipeline");
      await expect(p2.getByText("Tidak ada akses")).toBeVisible();
      await p2.waitForTimeout(500);
      await expect(p2.locator("[data-sonner-toast]")).toHaveCount(0);
      expect(new URL(p2.url()).pathname).toBe("/pipeline");
    } finally {
      await ctx.close();
    }
  } finally {
    bersih();
  }
});

test.describe("data awal dari server pada muat dokumen penuh (P1)", () => {
  const POLA_HIDRASI = /Hydration|hydrat|#418|#425|did not match/i;

  function catatGalat(page: Page) {
    const galat: string[] = [];
    page.on("console", (m) => {
      if ((m.type() === "error" || m.type() === "warning") && POLA_HIDRASI.test(m.text())) galat.push(m.text());
    });
    page.on("pageerror", (e) => {
      if (POLA_HIDRASI.test(e.message)) galat.push(e.message);
    });
    return galat;
  }

  test("HTML /saya memuat nama tugas; permintaan RSC tidak membawa data server", async ({ page }) => {
    const id = buatKartu("Performa · kartu di HTML");
    try {
      await masuk(page, AKUN.owner.email);
      const dok = await page.request.get("/saya", { headers: { "sec-fetch-dest": "document" } });
      expect(await dok.text()).toContain("Performa · kartu di HTML");
      const rsc = await page.request.get("/saya", { headers: { rsc: "1" } });
      expect(await rsc.text()).not.toContain("Performa · kartu di HTML");
      // ?v=board: papan langsung di HTML (bukan dialirkan lewat <template> Suspense yang tampil tertunda ±300 ms)
      const papan = await (await page.request.get("/saya?v=board", { headers: { "sec-fetch-dest": "document" } })).text();
      expect(papan).toContain('data-uji="papan-saya"');
      expect(papan).toContain("Performa · kartu di HTML");
      expect(papan).not.toMatch(/<template id="B:/);
      // ?m=… (anggota lain) tidak memakai data server
      const lain = await page.request.get(`/saya?m=${AKUN.citra.id}`, { headers: { "sec-fetch-dest": "document" } });
      expect(await lain.text()).not.toContain("Performa · kartu di HTML");
    } finally {
      hapusKartu(id);
    }
  });

  test("nol galat hidrasi pada muat penuh /saya, /saya?v=board, dan /t (komentar < 1 menit)", async ({ page }) => {
    const id = buatKartu("Performa · hidrasi", { markdown: "Deskripsi **tebal** dan [tautan](https://contoh.test)" });
    try {
      sebagai(AKUN.owner.id, `select public.web_komentar('${id}', 'komentar baru saja')`);
      await masuk(page, AKUN.owner.email);
      const galat = catatGalat(page);
      for (const url of ["/saya", "/saya?v=board", `/t/${id}`]) {
        await page.goto(url);
        await page.waitForLoadState("networkidle");
      }
      await expect(page.getByTestId("isi-komentar").first()).toContainText("komentar baru saja");
      await expect(page.getByTestId("desk-render").locator("strong")).toHaveText("tebal");
      expect(galat).toEqual([]);
    } finally {
      hapusKartu(id);
    }
  });

  test("deskripsi markdown tersaring (onerror/javascript:), tautan target=_blank rel=noopener", async ({ page }) => {
    const md = "Halo **tebal**\n\n<img src=x onerror=alert(1)>\n\n[jahat](javascript:alert(1)) [biasa](https://contoh.test/a)";
    const id = buatKartu("Performa · sanitasi", { markdown: md });
    try {
      await masuk(page, AKUN.owner.email);
      // HTML server: teks polos (DOMPurify tidak pernah jalan di server), tanpa elemen <img> mentah
      const html = await (await page.request.get(`/t/${id}`, { headers: { "sec-fetch-dest": "document" } })).text();
      expect(html).toContain("Performa · sanitasi");
      expect(html).not.toMatch(/<img[^>]*src="?x/i);
      await page.goto(`/t/${id}`);
      const desk = page.getByTestId("desk-render");
      await expect(desk.locator("strong")).toHaveText("tebal");
      await expect(desk.locator("[onerror]")).toHaveCount(0);
      await expect(desk.locator('a[href^="javascript:"]')).toHaveCount(0);
      const biasa = desk.locator('a[href="https://contoh.test/a"]');
      await expect(biasa).toHaveAttribute("target", "_blank");
      await expect(biasa).toHaveAttribute("rel", "noopener noreferrer");
    } finally {
      hapusKartu(id);
    }
  });
});

test("Pipeline volume (items ×60 lewat route): 50 baris dulu, tombol tampil-lagi, hitungan & rekap dari semua (P4)", async ({ page }) => {
  const PELANGGAN = "PT Uji Volume Performa";
  const acak = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  const [pl, order, baru] = [`pl${acak()}`, `ld${acak()}`, `ld${acak()}`];
  const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const ini = sqlLokal(`select to_char(public.hari_ini_wib(), 'YYYY-MM-DD')`);
  const noSp = `${800 + Math.floor(Math.random() * 99)}/UJP/${ROMAWI[Number(ini.slice(5, 7)) - 1]}/${ini.slice(0, 4)}`;
  const bersihAkses = beriAksesPipeline(AKUN.citra.id, "rep");
  const bersih = () =>
    sqlLokal(
      `delete from public.lead where pelanggan_id in (select id from public.pelanggan where nama = '${PELANGGAN}');` +
        ` delete from public.pelanggan where nama = '${PELANGGAN}';`,
    );
  bersih();
  sqlLokal(
    `insert into public.pelanggan (id, nama, kota) values ('${pl}', '${PELANGGAN}', 'Kediri');` +
      ` insert into public.lead (id, pelanggan_id, sumber, pemilik, tahap, no_sp, tanggal_sp, nilai_transaksi) values` +
      ` ('${order}', '${pl}', 'Google Ads', ${AKUN.citra.id}, 'ORDER', '${noSp}', '${ini}', 1000000),` +
      ` ('${baru}', '${pl}', 'Referral', ${AKUN.citra.id}, 'BARU', null, null, null);` +
      ` insert into public.lead_item (lead_id, produk, qty) values ('${order}', 'Roda', 2), ('${baru}', 'Roda', 3);`,
  );
  try {
    // jawaban web_pipeline_daftar asli digandakan 60× (id unik) — volume tanpa menulis ribuan baris ke DB bersama
    await page.route(/\/rest\/v1\/rpc\/web_pipeline_daftar/, async (route) => {
      const res = await route.fetch();
      const j = (await res.json()) as { items: { id: string; kode: string }[]; total: number };
      const items = Array.from({ length: 60 }, (_, i) => j.items.map((l) => ({ ...l, id: `${l.id}v${i}`, kode: `${l.kode}-${i}` }))).flat();
      await route.fulfill({ response: res, json: { ...j, items, total: items.length } });
    });
    await masuk(page, AKUN.citra.email);
    await page.goto("/pipeline");
    await page.getByTestId("cari-lead").fill(PELANGGAN);
    await expect(page).toHaveURL(/[?&]q=PT\+Uji\+Volume\+Performa/);
    const baris = page.getByTestId("baris-lead");
    await expect(baris).toHaveCount(50);
    await expect(page.getByText("120 lead", { exact: true })).toBeVisible();
    const lagi = page.getByTestId("tampil-lagi");
    await expect(lagi).toHaveText("Tampilkan 50 lagi (sisa 70)");
    await lagi.dispatchEvent("click"); // tanpa menggulir (sentinel gulir tidak ikut menambah)
    await expect(baris).toHaveCount(100);
    await expect(lagi).toHaveText("Tampilkan 20 lagi (sisa 20)");

    // tab Order: rekap dari SEMUA order (60 × Rp1.000.000), baris dirender bertahap
    await page.getByRole("tablist", { name: "Saring lead" }).getByRole("tab", { name: "Order" }).click();
    await expect(page.getByTestId("rekap-jumlah")).toHaveText("60");
    await expect(page.getByTestId("rekap-nominal")).toHaveText("Rp60.000.000");
    await expect(page.getByTestId("tampil-lagi")).toHaveText("Tampilkan 10 lagi (sisa 10)");
  } finally {
    bersih();
    bersihAkses();
  }
});

test.describe("version skew (P10)", () => {
  // service worker diblokir: permintaan yang dilayani SW tidak bisa dicegat page.route
  test.use({ serviceWorkers: "block" });

  test("chunk form hilang sesudah deploy (404): halaman dimuat ulang SEKALI, tanpa loop; lalu form terbuka", async ({ page }) => {
    test.skip(diHp(page), "cukup di desktop");
    await masuk(page, AKUN.owner.email);
    // chunk modul form Tugas baru dikenali dari isinya (pesan validasi zod) → 404 selama `blokir` (versi lama terhapus)
    let blokir = true;
    let ditolak = 0;
    await page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
      const res = await route.fetch();
      const isi = await res.text();
      if (blokir && isi.includes("Nama tugas wajib diisi")) {
        ditolak++;
        return route.fulfill({ status: 404, body: "" });
      }
      return route.fulfill({ response: res, body: isi });
    });
    let muat = 0; // muat dokumen penuh (bukan replaceState/pushState)
    page.on("load", () => muat++);

    await page.goto(`/l/${SEED.listApp}`);
    await expect(page.getByTestId("buat-tugas")).toBeVisible();
    await page.getByTestId("buat-tugas").click();
    // impor gagal → muat ulang sekali (penanda sessionStorage)
    await expect.poll(() => muat, { timeout: 15_000 }).toBe(2);
    await expect(page.getByTestId("buat-tugas")).toBeVisible();
    expect(ditolak).toBeGreaterThan(0);

    // masih 404 sesudah muat ulang → galat ditampilkan, TIDAK muat ulang lagi
    await page.getByTestId("buat-tugas").click();
    await expect(page.getByText("Terjadi kesalahan")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    expect(muat).toBe(2);

    // chunk tersedia lagi → form terbuka normal (penanda dibersihkan sesudah impor berhasil)
    blokir = false;
    await page.reload();
    await page.getByTestId("buat-tugas").click();
    await expect(page.getByTestId("dialog-buat-tugas")).toBeVisible();
    await expect(page.getByLabel("Nama tugas")).toBeVisible();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("anvil:muat-ulang-chunk"))).toBeNull();
  });
});
