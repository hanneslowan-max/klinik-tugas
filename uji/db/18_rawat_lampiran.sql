-- 18 · Perawatan lampiran (x_rawat_lampiran / inti_rawat_lampiran): hapus lampiran app pada kartu SELESAI > N hari.
-- Hanya sumber='app' pada kartu sumber='app'; soft-delete (jejak activity 'lampiran_hapus'). Fungsi tak menyentuh
-- storage.objects (itu tugas Edge), jadi tes cukup pakai baris attachments + tasks. done_at mundur diset lewat
-- konteks sinkron (trigger menjaga closed_at/done_at verbatim).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- Kartu + lampiran app (dibuat jalur ui), lalu dimundurkan waktunya lewat sinkron.
select uji.konteks('ui', 100000001);                                    -- Budi (owner)
insert into public.tasks (id, list_id, name) values
  ('rtrawat001', 'rlujib0001', 'Uji rawat lama'),
  ('rtrawat002', 'rlujib0001', 'Uji rawat baru');
insert into public.attachments (task_id, title, mimetype, size, storage_path) values
  ('rtrawat001', 'lama.png', 'image/png', 1000, 't/rtrawat001/lama.png'),
  ('rtrawat002', 'baru.png', 'image/png', 1000, 't/rtrawat002/baru.png');

-- Kartu + lampiran ClickUp (sumber clickup) yang juga selesai lama — harus TIDAK tersentuh (lingkup app saja).
select uji.konteks('impor', 900000000002);
insert into public.tasks (id, list_id, name, status, sumber, closed_at, done_at, synced_at) values
  ('z8rwtcu001', '1100340000900101', 'Uji rawat clickup', 'complete', 'clickup',
   now() - interval '20 days', now() - interval '20 days', now());
insert into public.attachments (task_id, title, mimetype, size, storage_path, sumber) values
  ('z8rwtcu001', 'cu.png', 'image/png', 1000, 't/z8rwtcu001/cu.png', 'clickup');

-- Mundurkan tanggal selesai kartu app (verbatim di bawah sinkron): 001 = 10 hari lalu, 002 = 2 hari lalu.
select uji.konteks('sinkron', 900000000002);
update public.tasks set status = 'complete', closed_at = now() - interval '10 days', done_at = now() - interval '10 days'
  where id = 'rtrawat001';
update public.tasks set status = 'complete', closed_at = now() - interval '2 days', done_at = now() - interval '2 days'
  where id = 'rtrawat002';
select uji.cek((select status_type = 'closed' and done_at = now() - interval '10 days' from public.tasks where id = 'rtrawat001'),
  'siap: rtrawat001 selesai 10 hari lalu');

-- dry-run hari=7: kandidat hanya rtrawat001 (app, selesai >7h); tidak menghapus apa pun.
select uji.simpan('d7', public.x_rawat_lampiran(100000001, 7, true));
select uji.sama(uji.ambil('d7') ->> 'dry', 'true', 'dry-run: dry=true');
select uji.sama(uji.ambil('d7') ->> 'hari', '7', 'dry-run: hari=7');
select uji.sama(uji.ambil('d7') -> 'storage_paths', '["t/rtrawat001/lama.png"]'::jsonb, 'dry-run: hanya kartu app selesai lama');
select uji.cek((select deleted_at is null from public.attachments where storage_path = 't/rtrawat001/lama.png'),
  'dry-run tidak menghapus baris');

-- dry-run hari=1: rtrawat001 + rtrawat002 keduanya lolos (keduanya selesai >1 hari). Bukti parameter hari dipakai.
select uji.sama(jsonb_array_length((public.x_rawat_lampiran(100000001, 1, true)) -> 'storage_paths'), 2,
  'dry-run hari=1: kedua kartu app lolos');

-- Toggle mati: aktif=false → dilewati, tidak menghapus.
update public.app_settings set value = '{"aktif": false, "hari": 7}'::jsonb where key = 'rawat_lampiran';
select uji.sama((public.x_rawat_lampiran(100000001, null, false)) ->> 'dilewati', 'true', 'aktif=false → dilewati');
select uji.cek((select deleted_at is null from public.attachments where storage_path = 't/rtrawat001/lama.png'),
  'aktif=false tidak menghapus');

-- Toggle hidup: hari dari setelan (7). Jalankan nyata → rtrawat001 dihapus (soft), sisanya utuh.
update public.app_settings set value = '{"aktif": true, "hari": 7}'::jsonb where key = 'rawat_lampiran';
select uji.simpan('r', public.x_rawat_lampiran(100000001, null, false));
select uji.sama(uji.ambil('r') ->> 'hari', '7', 'nyata: hari dari setelan = 7');
select uji.sama(uji.ambil('r') ->> 'dihapus', '1', 'nyata: 1 lampiran dihapus');
select uji.cek((select deleted_at is not null and deleted_by = 100000001
                from public.attachments where storage_path = 't/rtrawat001/lama.png'),
  'nyata: rtrawat001 soft-delete, deleted_by = aktor');
select uji.cek(exists (select 1 from public.activity where task_id = 'rtrawat001' and jenis = 'lampiran_hapus'),
  'nyata: activity lampiran_hapus tercatat (jejak di riwayat)');
select uji.cek((select deleted_at is null from public.attachments where storage_path = 't/rtrawat002/baru.png'),
  'nyata: kartu app selesai 2 hari TIDAK dihapus');
select uji.cek((select deleted_at is null from public.attachments where storage_path = 't/z8rwtcu001/cu.png'),
  'nyata: lampiran kartu ClickUp TIDAK dihapus (lingkup app saja)');

-- Jalankan lagi: idempoten (sudah terhapus → 0).
select uji.sama((public.x_rawat_lampiran(100000001, null, false)) ->> 'dihapus', '0', 'ulang: tidak ada lagi → 0');

-- Bukan owner/bot → 403.
select uji.galat($$select public.x_rawat_lampiran(100000002, 7, false)$$,
  'PT403', 'non-owner ditolak', null, 'ACCESS_001');

rollback;
