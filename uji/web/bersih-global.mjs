// globalSetup & globalTeardown Playwright: buang SEMUA sisa data uji web (awalan "uji-b3") dari DB lokal bersama,
// supaya tes lain (uji/db yang menghitung jumlah space/token) tidak terganggu. Data seed tidak disentuh.
//  1. tugas "uji-b3 …" → web_hapus + web_purge sebagai owner (jalur resmi; activity append-only tetap ada)
//     + objek Storage-nya dihapus lewat Storage API (service role lokal)
//  2. psql (superuser DB LOKAL): token, hari libur, list/space, akun Auth & anggota uji — hanya milik tes web.
import { execFileSync } from 'node:child_process';
import { AKUN, DB_URL, rpcSebagai, klienSebagai, layanan } from './bantu.mjs';

async function purgeTugasUji() {
  const c = await klienSebagai(AKUN.owner.email);
  const { data, error } = await c.from('tasks').select('id,parent_id,deleted_at').like('name', 'uji-b3 %');
  if (error) throw new Error(`baca tugas uji: ${error.message}`);
  const paths = [];
  // induk dulu (purge induk ikut membuang sub-tugas); sisanya diabaikan bila sudah hilang
  const urut = [...data].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
  for (const t of urut) {
    try {
      if (!t.deleted_at) await rpcSebagai(AKUN.owner.email, 'web_hapus', { p_task: t.id });
      const r = await rpcSebagai(AKUN.owner.email, 'web_purge', { p_task: t.id });
      paths.push(...(r.storage_paths || []));
    } catch { /* sudah terhapus bersama induknya */ }
  }
  if (paths.length) await layanan('/storage/v1/object/lampiran', { method: 'DELETE', body: { prefixes: paths } });
  return data.length;
}

const SQL = `
begin;
select set_config('app.sumber', 'sistem', true);
delete from public.api_tokens where nama like 'uji-b3 %';
delete from public.hari_libur where nama like 'uji-b3%';
delete from public.lists l using public.spaces s
 where l.space_id = s.id and s.name = 'uji-b3 Ruang Playwright'
   and not exists (select 1 from public.tasks t where t.list_id = l.id);
delete from public.folders f using public.spaces s where f.space_id = s.id and s.name = 'uji-b3 Ruang Playwright'
   and not exists (select 1 from public.lists l where l.folder_id = f.id);
delete from public.spaces s where s.name = 'uji-b3 Ruang Playwright'
   and not exists (select 1 from public.lists l where l.space_id = s.id);
delete from auth.users where email like 'uji-b3-%@contoh.test';
do $$
declare m record;
begin
  for m in select id from public.members where username like 'uji-b3 %' loop
    begin
      delete from public.members where id = m.id;
    exception when foreign_key_violation then
      update public.members set aktif = false where id = m.id;      -- masih dirujuk: cukup nonaktif
    end;
  end loop;
end $$;
commit;
`;

export async function bersihkanSisa() {
  const n = await purgeTugasUji();
  execFileSync('psql', [DB_URL, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', SQL], { stdio: ['ignore', 'ignore', 'pipe'] });
  return n;
}

export default async function globalBersih() {
  try {
    await bersihkanSisa();
  } catch (e) {
    console.warn(`[uji/web] pembersihan data uji gagal: ${e.message}`);
  }
}
