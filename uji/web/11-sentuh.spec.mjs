// Target sentuh ≥ 44×44 px di layar utama (390px). Pengecualian: tautan di tengah kalimat (komentar, markdown) dan
// input checkbox/berkas yang dibungkus label ≥ 44px. Tautan remah (list induk) TIDAK dikecualikan lagi (poles #6).
import { test, expect, masuk, AKUN, siapkanPapan, buatTugas, bersihkanTugas, tanggalWib } from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

async function kecil(page) {
  return page.evaluate(() => {
    const hasil = [];
    const sel = 'button, a[href], select, input, textarea, summary, [role=tab]';
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('.komentar-teks, .md, .sr, .lompat, dialog:not([open])')) continue;
      if (el.matches('input[type=checkbox], input[type=file], input[type=radio]')) {
        const lab = el.closest('label');
        if (lab && lab.getBoundingClientRect().height >= 44) continue;
      }
      const r = el.getBoundingClientRect();
      const gaya = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || gaya.visibility === 'hidden' || el.closest('[hidden]')) continue;
      const tinggi = Math.round(r.height);
      const lebar = Math.round(r.width);
      if (tinggi < 44 || lebar < 44) hasil.push(`${el.tagName.toLowerCase()}.${el.className || ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${lebar}×${tinggi}`);
    }
    return hasil;
  });
}

test('semua kontrol di layar utama ≥ 44px', async ({ page }) => {
  const { listId } = await siapkanPapan();
  const t = await buatTugas(listId, { name: 'target sentuh', due: tanggalWib(1), assignees: [AKUN.owner.id], markdown: 'Isi **uji**.' });
  await masuk(page, AKUN.owner.email);
  const layar = ['/saya', '/jelajah', `/l/${listId}`, `/l/${listId}?v=board`, `/t/${t.id}`, '/cari?q=uji', '/notif',
    '/admin?tab=anggota', '/admin?tab=token', '/admin?tab=libur', '/sampah'];
  const temuan = {};
  for (const p of layar) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    const k = await kecil(page);
    if (k.length) temuan[p] = k;
  }
  // menu (lembar)
  await page.goto('/saya');
  await page.locator('#tombol-menu').click();
  const km = await kecil(page);
  if (km.length) temuan.menu = km;
  expect(temuan).toEqual({});
});
