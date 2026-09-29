// Admin: member tidak melihat Admin; owner kelola anggota + aktifkan login / reset password (Edge /x/admin/*,
// ditiru di tes bila Edge belum ada), token API tampil sekali lalu dicabut, tab lain tampil.
import { test, expect, masuk, keluar, foto, AKUN, rpcSebagai, layanan, pasangEdgeTiruan, AWALAN, RUN, siapkanPapan, buatTugas, bersihkanTugas } from './bantu.mjs';

test.afterAll(async () => { await bersihkanTugas(); });

const USER_UJI = `${AWALAN} penguji`;
const EMAIL_UJI = `${AWALAN}-penguji@contoh.test`;

test('member tidak melihat menu Admin/Sampah dan /admin ditolak', async ({ page }) => {
  await masuk(page, AKUN.dodi.email);
  await page.locator('#tombol-menu').click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toContainText('Keluar');
  await expect(menu.locator('[data-uji=menu-admin]')).toHaveCount(0);
  await expect(menu.locator('[data-uji=menu-sampah]')).toHaveCount(0);
  await foto(page, '16-menu-member');
  await page.keyboard.press('Escape');
  await page.goto('/admin');
  await expect(page.locator('[data-uji=khusus-owner]')).toHaveText('Halaman ini khusus owner.');
  await page.goto('/sampah');
  await expect(page.locator('[data-uji=khusus-owner]')).toBeVisible();
});

test('owner: tab admin tampil (anggota, status, struktur, libur, token, mode, sinkron)', async ({ page }) => {
  await masuk(page, AKUN.owner.email);
  await page.locator('#tombol-menu').click();
  await page.locator('[data-uji=menu-admin]').click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('[data-uji=daftar-anggota] [data-anggota="citra lestari"]')).toBeVisible();
  await foto(page, '17-admin-anggota');
  for (const [tab, cek] of [['status', '[data-uji=status-pilih-list]'], ['struktur', '[data-uji=tambah-list]'],
    ['libur', 'input[name=nama-libur]'], ['token', '[data-uji=buat-token]'], ['mode', '[data-uji=mode-sekarang]'], ['sinkron', '.admin-isi']]) {
    await page.locator(`.chip-pilih[data-tab=${tab}]`).click();
    await expect(page.locator(cek).first()).toBeVisible();
  }
  await expect(page.locator('[data-uji=mode-sekarang]')).toHaveCount(0);   // sudah pindah ke tab sinkron
  await page.locator('.chip-pilih[data-tab=mode]').click();
  const mode = (await rpcSebagai(AKUN.owner.email, 'web_saya')).mode;
  await expect(page.locator('[data-uji=mode-sekarang]')).toHaveText(mode);
  // tombol ganti mode meminta konfirmasi; dibatalkan (DB bersama — mode tidak diubah)
  await page.locator('[data-uji=ganti-mode]').click();
  await expect(page.getByRole('dialog', { name: 'Ganti mode' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Batal' }).click();
  expect((await rpcSebagai(AKUN.owner.email, 'web_saya')).mode).toBe(mode);
  await page.locator('.chip-pilih[data-tab=status]').click();
  await page.selectOption('[data-uji=status-pilih-list]', '1100340000900101');
  await expect(page.locator('.admin-isi .kotak-cermin')).toContainText('hanya-baca');
});

test('owner: token API tampil sekali lalu dicabut', async ({ page }) => {
  await masuk(page, AKUN.owner.email, undefined, '/admin?tab=token');
  const nama = `${AWALAN} token ${RUN}`;
  await page.selectOption('select[name=token-anggota]', String(900000000002));
  await page.fill('input[name=token-nama]', nama);
  await page.selectOption('select[name=token-scope]', 'baca');
  await page.locator('[data-uji=buat-token]').click();
  const token = await page.locator('[data-uji=token-mentah]').textContent();
  expect(token).toMatch(/^rtk_[0-9A-Za-z]{40}$/);
  await foto(page, '18-token-sekali');
  await page.getByRole('button', { name: 'Sudah disalin' }).click();
  const baris = page.locator(`[data-uji=daftar-token] li[data-token="${token.slice(0, 8)}"]`);
  await expect(baris).toContainText(nama);
  await expect(page.locator('body')).not.toContainText(token);             // token mentah tidak tampil lagi
  await baris.getByRole('button', { name: 'Cabut' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cabut' }).click();
  await expect(baris).toContainText('dicabut');
  const cek = await layanan('/rest/v1/rpc/api_token_cek', { method: 'POST', body: { p_hash: await sha256(token) } });
  expect(cek.isi).toBeNull();
});

test('owner: tambah/aktifkan anggota → login pertama wajib ganti password → reset password', async ({ page, browser }) => {
  // bersihkan akun login sisa run sebelumnya (anggota uji tetap ada, id-nya dipakai ulang)
  const lama = (await layanan(`/rest/v1/members?username=eq.${encodeURIComponent(USER_UJI)}&select=id,auth_user_id`)).isi[0];
  if (lama && lama.auth_user_id) await layanan(`/auth/v1/admin/users/${lama.auth_user_id}`, { method: 'DELETE' });
  const sisa = await layanan(`/auth/v1/admin/users?per_page=1000`);
  for (const u of (sisa.isi && sisa.isi.users) || []) {
    if (u.email === EMAIL_UJI) await layanan(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  }

  await pasangEdgeTiruan(page);
  await masuk(page, AKUN.owner.email, undefined, '/admin?tab=anggota');
  if (!lama) {
    await page.locator('[data-uji=tambah-anggota]').click();
    const d = page.getByRole('dialog', { name: 'Tambah anggota' });
    await d.locator('input[name=username]').fill(USER_UJI);
    await d.locator('input[name=nama]').fill('Penguji Web (uji)');
    await d.locator('input[name=email]').fill(EMAIL_UJI);
    await d.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.locator('.toast').last()).toContainText('Anggota ditambahkan');
  } else {
    await page.locator(`[data-anggota="${USER_UJI}"]`).getByRole('button', { name: /Ubah/ }).click();
    const d = page.getByRole('dialog');
    await d.locator('input[name=aktif]').check();
    await d.locator('input[name=email]').fill(EMAIL_UJI);
    await d.getByRole('button', { name: 'Simpan' }).click();
    await expect(page.locator('.toast').last()).toContainText('Anggota disimpan');
  }
  const item = page.locator(`[data-anggota="${USER_UJI}"]`);
  await expect(item).toContainText('belum ada login');

  // aktifkan login → Edge → password sementara tampil sekali
  await item.getByRole('button', { name: /Ubah/ }).click();
  await page.locator('[data-uji=aktifkan-login]').click();
  const dAkun = page.getByRole('dialog', { name: /Aktifkan login/ });
  await expect(dAkun.locator('input[name=email-login]')).toHaveValue(EMAIL_UJI);
  const sementara = await dAkun.locator('input[name=password-sementara]').inputValue();
  expect(sementara.length).toBeGreaterThanOrEqual(8);
  await dAkun.getByRole('button', { name: 'Aktifkan login' }).click();
  await expect(page.locator('[data-uji=sandi-sementara]')).toHaveText(sementara);
  await foto(page, '19-akun-diaktifkan');
  await page.getByRole('button', { name: 'Selesai' }).click();
  await expect(item).toContainText('bisa login');
  await expect(item).toContainText('wajib ganti password');

  // login pertama anggota baru (konteks terpisah) → dipaksa ganti password
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await masuk(p2, EMAIL_UJI, sementara);
  await expect(p2).toHaveURL(/\/ganti-password/);
  await expect(p2.locator('[data-uji=wajib-ganti]')).toBeVisible();
  await expect(p2.locator('#nav-bawah')).toBeHidden();
  await p2.goto('/saya');                                                 // tidak bisa melewati
  await expect(p2).toHaveURL(/\/ganti-password/);
  await foto(p2, '20-wajib-ganti-password');
  await p2.fill('input[name=password-baru]', 'pendek');
  await p2.fill('input[name=password-ulang]', 'pendek');
  await p2.getByRole('button', { name: 'Simpan password' }).click();
  await expect(p2.getByRole('alert')).toContainText('minimal 8');
  const baru = `baru-${RUN}-Uji9`;
  await p2.fill('input[name=password-baru]', baru);
  await p2.fill('input[name=password-ulang]', baru);
  await p2.getByRole('button', { name: 'Simpan password' }).click();
  await expect(p2).toHaveURL(/\/saya/);
  await expect(p2.locator('#judul')).toHaveText('Tugas Saya');

  // anggota baru menerima tugas → lonceng → tandai semua dibaca (notifikasinya hanya dari tes ini)
  const idPenguji = (await layanan(`/rest/v1/members?username=eq.${encodeURIComponent(USER_UJI)}&select=id`)).isi[0].id;
  const { listId } = await siapkanPapan();
  const tugas = await buatTugas(listId, { name: 'untuk penguji', assignees: [idPenguji] });
  await p2.goto('/notif');
  await expect(p2.locator('[data-uji=daftar-notif] li[data-jenis=assign]')).toContainText(tugas.name);
  await expect(p2.locator('#lonceng-angka')).toHaveText('1');
  await p2.getByRole('button', { name: 'Tandai semua dibaca' }).click();
  await expect(p2.locator('.toast').last()).toContainText('1 notifikasi ditandai dibaca');
  await expect(p2.locator('#lonceng-angka')).toBeHidden();
  await expect(p2.locator('[data-uji=daftar-notif] .chip.info')).toHaveCount(0);
  await ctx2.close();

  // reset password oleh owner
  await page.reload();
  await item.getByRole('button', { name: /Ubah/ }).click();
  await page.locator('[data-uji=reset-password]').click();
  const dReset = page.getByRole('dialog', { name: /Setel ulang password/ });
  const sandiReset = await dReset.locator('input[name=password-sementara]').inputValue();
  await dReset.getByRole('button', { name: 'Setel ulang password' }).click();
  await expect(page.locator('[data-uji=sandi-sementara]')).toHaveText(sandiReset);
  await page.getByRole('button', { name: 'Selesai' }).click();
  await expect(item).toContainText('wajib ganti password');

  // bersihkan: hapus akun login uji & nonaktifkan anggota uji
  const m = (await layanan(`/rest/v1/members?username=eq.${encodeURIComponent(USER_UJI)}&select=id,auth_user_id`)).isi[0];
  if (m.auth_user_id) await layanan(`/auth/v1/admin/users/${m.auth_user_id}`, { method: 'DELETE' });
  await rpcSebagai(AKUN.owner.email, 'web_admin_anggota_simpan', { p: { id: m.id, aktif: false } });
});

async function sha256(teks) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(teks).digest('hex');
}
