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

function hapusKartu(id: string) {
  sebagai(AKUN.owner.id, `select public.web_hapus('${id}')`);
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
