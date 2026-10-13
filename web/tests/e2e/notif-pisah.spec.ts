// Notifikasi dipisah "Dari tim" / "Dari agent" (revisi #2). Penerima uji = Dodi (owner & Citra dipakai tes lain).
// Notifikasi agent disiapkan lewat fungsi api_* sebagai bot "claude (agent)" dan sebagai Citra (token API milik
// manusia → tetap agent, berlabel "lewat API"); notifikasi tim = notifikasi seed Dodi. Semua dibersihkan di finally.
import { expect, test, type Page } from "@playwright/test";

import { AKUN, SEED, diHp, masuk, sqlLokal } from "./bantu";

const BOT = 900000000002;

function sebagaiBudi(sql: string) {
  const uid = sqlLokal(`select auth_user_id from public.members where id = ${AKUN.owner.id}`);
  sqlLokal(`begin; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); set local role authenticated; ${sql}; commit;`);
}

/** Komentar lewat API (jalur Edge /api: mulai_api sumber 'api') atas nama `aktor`; hasil id komentar. */
function komentarApi(aktor: number, teks: string): string {
  const body = JSON.stringify({ comment_text: teks, notify_all: false }).replace(/'/g, "''");
  return sqlLokal(`select (public.api_create_comment(${aktor}, '${SEED.tugasApp}', '${body}'::jsonb))->>'id'`);
}

function belumDodi(dariAgent: boolean): number {
  return Number(
    sqlLokal(
      `select count(*) from public.notifications n left join public.members a on a.id = n.actor_id
        where n.member_id = ${AKUN.dodi.id} and n.read_at is null
          and (coalesce(n.sumber = 'api', false) or coalesce(a.role = 'bot', false)) = ${dariAgent}`,
    ),
  );
}

function labelLonceng(n: number) {
  return n ? `Notifikasi, ${n} belum dibaca` : "Notifikasi";
}

async function tanpaGulirSamping(page: Page) {
  const lebar = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(lebar).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
}

test("tab Dari tim / Dari agent: angka per tab, URL ?dari=agent, tandai dibaca hanya tab aktif", async ({ page }) => {
  const belumAwal = sqlLokal(`select string_agg(id::text, ',') from public.notifications where member_id = ${AKUN.dodi.id} and read_at is null`);
  const komentar: string[] = [];
  try {
    const unik = Date.now().toString(36);
    komentar.push(komentarApi(BOT, `[Claude] uji tab agent ${unik}`));
    komentar.push(komentarApi(AKUN.citra.id, `catatan otomatis lewat token ${unik}`));
    const tim = belumDodi(false);
    const agent = belumDodi(true);
    expect(agent).toBe(2);

    await masuk(page, AKUN.dodi.email);
    const lonceng = page.getByTestId("lonceng").first();
    await expect(lonceng).toHaveAttribute("aria-label", labelLonceng(tim + agent)); // lonceng tetap TOTAL

    // tab bawaan: Dari tim
    await page.goto("/notif");
    const tabTim = page.getByTestId("tab-notif-tim");
    const tabAgent = page.getByTestId("tab-notif-agent");
    await expect(tabTim).toHaveAttribute("aria-selected", "true");
    await expect(tabAgent).toHaveAttribute("aria-selected", "false");
    await expect(page.getByTestId("angka-tab-notif-agent")).toHaveText(/^2/);
    if (tim > 0) {
      await expect(page.getByTestId("angka-tab-notif-tim")).toHaveText(new RegExp(`^${tim}`));
      await expect(page.locator("[data-dari=tim]").first()).toBeVisible();
    }
    await expect(page.locator("[data-dari=agent]")).toHaveCount(0);
    // aksi tab tidak di kepala halaman → judul "Notifikasi" tetap terbaca di HP
    expect((await page.getByTestId("judul-halaman").boundingBox())?.width ?? 0).toBeGreaterThan(60);
    if (diHp(page)) {
      await tanpaGulirSamping(page);
      for (const t of [tabTim, tabAgent]) expect((await t.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }

    // pindah ke Dari agent: URL berubah tanpa memuat ulang halaman
    await tabAgent.click();
    await expect(page).toHaveURL(/\/notif\?dari=agent$/);
    await expect(tabAgent).toHaveAttribute("aria-selected", "true");
    const itemAgent = page.locator("[data-dari=agent]");
    await expect(itemAgent).toHaveCount(2);
    await expect(itemAgent.getByTestId("notif-baru")).toHaveCount(2);
    await expect(page.getByTestId("ringkas-tab-notif")).toHaveText("2 belum dibaca");
    await expect(page.locator("[data-dari=tim]")).toHaveCount(0);
    const bot = itemAgent.filter({ hasText: "claude (agent)" });
    await expect(bot).toContainText(`[Claude] uji tab agent ${unik}`);
    await expect(bot).not.toContainText("lewat API");
    await expect(itemAgent.filter({ hasText: AKUN.citra.username })).toContainText("lewat API");
    if (diHp(page)) await tanpaGulirSamping(page);

    // tandai semua dibaca hanya tab agent: lonceng turun tepat 2, notifikasi tim tetap belum dibaca
    await page.getByRole("button", { name: "Tandai semua dibaca" }).click();
    await expect(lonceng).toHaveAttribute("aria-label", labelLonceng(tim));
    await expect(page.getByTestId("angka-tab-notif-agent")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tandai semua dibaca" })).toBeDisabled();
    await expect(itemAgent.getByTestId("notif-baru")).toHaveCount(0);
    await expect(page.getByTestId("ringkas-tab-notif")).toHaveText("Semua sudah dibaca");
    expect(belumDodi(true)).toBe(0);
    expect(belumDodi(false)).toBe(tim);

    // URL langsung ?dari=agent membuka tab agent; kembali ke tab tim
    await page.goto("/notif?dari=agent");
    await expect(tabAgent).toHaveAttribute("aria-selected", "true");
    await tabTim.click();
    await expect(page).toHaveURL(/\/notif$/);
    await expect(tabTim).toHaveAttribute("aria-selected", "true");
    if (tim > 0) await expect(page.getByRole("button", { name: "Tandai semua dibaca" })).toBeEnabled();
  } finally {
    for (const id of komentar.filter(Boolean)) {
      sqlLokal(`delete from public.notifications where comment_id = '${id}'`);
      sebagaiBudi(`select public.web_komentar_hapus('${id}')`);
    }
    if (belumAwal) sqlLokal(`update public.notifications set read_at = null where id in (${belumAwal})`);
  }
});
