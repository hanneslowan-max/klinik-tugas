-- 02 · Waktu WIB: wib_date, due_wib (trigger), hari_kerja, hari_ini_wib, beban.
begin;
\ir _bantu.sql

-- ---------------------------------------------------------------- wib_date (= wibDate clickup.mjs)
select uji.sama(public.wib_date('2026-09-30 00:00:00+07'), date '2026-09-30', 'wib_date: 00:00 WIB tidak mundur');
select uji.sama(public.wib_date('2026-09-29 17:00:00+00'), date '2026-09-30', 'wib_date: 17:00 UTC = besok WIB');
select uji.sama(public.wib_date('2026-09-29 16:59:59.999+00'), date '2026-09-29', 'wib_date: 16:59:59.999 UTC masih hari yang sama');
select uji.sama(public.wib_date('2026-09-30 23:59:59+07'), date '2026-09-30', 'wib_date: 23:59:59 WIB');
select uji.sama(public.wib_date('2026-09-30 12:00:00+07'), date '2026-09-30', 'wib_date: 12:00 WIB (gaya toMs clickup.mjs)');
select uji.sama(public.wib_date(to_timestamp(1790701200000 / 1000.0)), date '2026-09-30',
  'wib_date: ms ClickUp 1790701200000 (00:00 WIB 30/9) → 2026-09-30');
select uji.cek(public.wib_date(null) is null, 'wib_date(null) = null');

-- ---------------------------------------------------------------- due_wib lewat trigger
select uji.konteks('ui', 100000001);
insert into public.tasks (id, list_id, name, due_at, due_has_time)
  values ('rtwaktu001', 'rlujib0001', 'Uji due tengah malam', '2026-09-30 00:00:00+07', false);
select uji.sama((select due_wib from public.tasks where id = 'rtwaktu001'), date '2026-09-30',
  'due_wib: due 00:00 WIB tersimpan 2026-09-30 (tidak mundur)');

update public.tasks set due_at = '2026-09-30 23:59:00+07', due_has_time = true where id = 'rtwaktu001';
select uji.sama((select due_wib from public.tasks where id = 'rtwaktu001'), date '2026-09-30', 'due_wib: 23:59 WIB');

update public.tasks set due_at = to_timestamp(1790744400000 / 1000.0), due_has_time = false where id = 'rtwaktu001';
select uji.sama((select due_wib from public.tasks where id = 'rtwaktu001'), date '2026-09-30',
  'due_wib: ms 12:00 WIB (1790744400000) → 2026-09-30');

update public.tasks set due_wib = '2000-01-01' where id = 'rtwaktu001';
select uji.sama((select due_wib from public.tasks where id = 'rtwaktu001'), date '2026-09-30',
  'due_wib tidak bisa ditimpa manual (selalu turunan due_at)');

update public.tasks set due_at = null, due_has_time = true where id = 'rtwaktu001';
select uji.cek((select due_wib is null and not due_has_time from public.tasks where id = 'rtwaktu001'),
  'due null (parkir) → due_wib null, due_has_time false');

-- ---------------------------------------------------------------- hari_kerja (contoh Senin 28/9/2026)
select uji.sama(extract(isodow from date '2026-09-28')::int, 1, '28/9/2026 = Senin');
select uji.sama(public.hari_kerja('2026-09-28', '2026-09-29'), 1, 'Senin 28/9 → due 29/9: sisa 1');
select uji.sama(public.hari_kerja('2026-09-28', '2026-09-30'), 2, 'Senin 28/9 → due 30/9: sisa 2');
select uji.sama(public.hari_kerja('2026-09-28', '2026-10-01'), 3, 'Senin 28/9 → due 1/10: sisa 3');
select uji.sama(public.hari_kerja('2026-09-28', '2026-09-28'), 0, 'due hari ini: sisa 0');
select uji.sama(public.hari_kerja('2026-10-02', '2026-10-05'), 1, 'Jumat 2/10 → Senin 5/10: sisa 1');
select uji.sama(public.hari_kerja('2026-10-02', '2026-10-03'), 0, 'Jumat → Sabtu: 0');
select uji.sama(public.hari_kerja('2026-10-02', '2026-10-04'), 0, 'Jumat → Minggu: 0');
select uji.sama(public.hari_kerja('2026-09-28', '2026-10-05'), 5, 'Senin → Senin berikutnya: 5');
select uji.sama(public.hari_kerja('2026-09-30', '2026-09-28'), -2, 'b < a: negatif (30/9 → 28/9 = -2)');
select uji.sama(public.hari_kerja('2026-10-05', '2026-10-02'), -1, 'Senin → Jumat sebelumnya = -1');
select uji.cek(public.hari_kerja(null, '2026-09-28') is null, 'hari_kerja(null, x) = null');

insert into public.hari_libur (tanggal, nama) values ('2026-09-30', 'Libur uji (sintetis)');
select uji.sama(public.hari_kerja('2026-09-28', '2026-10-01'), 2, 'hari_libur dikurangi: 28/9 → 1/10 = 2');
select uji.sama(public.hari_kerja('2026-09-28', '2026-09-30'), 1, 'hari_libur di ujung b tidak dihitung');
delete from public.hari_libur where tanggal = '2026-09-30';

-- ---------------------------------------------------------------- hari_ini_wib
select uji.sama(public.hari_ini_wib(), (now() at time zone 'Asia/Jakarta')::date, 'hari_ini_wib = tanggal Asia/Jakarta');
select set_config('app.hari_ini', '2026-09-28', true);
select uji.sama(public.hari_ini_wib(), date '2026-09-28', 'hari_ini_wib bisa dipatok (app.hari_ini) untuk tes');
select set_config('app.hari_ini', '', true);

-- ---------------------------------------------------------------- beban (B5)
select uji.konteks('ui', 100000001);
insert into public.lists (id, space_id, name, tidak_ditagih) values ('rlbeban001', 'rsujib0001', 'List beban uji', false);
insert into public.lists (id, space_id, name, tidak_ditagih) values ('rlbeban002', 'rsujib0001', 'List beban tak ditagih', true);
insert into public.tasks (id, list_id, name, due_at) values
  ('rtbeban001', 'rlbeban001', 'B1', '2027-01-06 12:00:00+07'),
  ('rtbeban002', 'rlbeban001', 'B2', '2027-01-06 00:00:00+07'),
  ('rtbeban003', 'rlbeban001', 'B3 selesai', '2027-01-06 12:00:00+07'),
  ('rtbeban004', 'rlbeban001', 'B4 arsip', '2027-01-06 12:00:00+07'),
  ('rtbeban005', 'rlbeban001', 'B5 dihapus', '2027-01-06 12:00:00+07'),
  ('rtbeban006', 'rlbeban002', 'B6 tidak ditagih', '2027-01-06 12:00:00+07'),
  ('rtbeban007', 'rlbeban001', 'B7 hari lain', '2027-01-07 12:00:00+07'),
  ('rtbeban008', 'rlbeban001', 'B8 bersama', '2027-01-06 18:00:00+07');
insert into public.task_assignees (task_id, member_id)
  select id, 100000002 from public.tasks where id like 'rtbeban%';
insert into public.task_assignees (task_id, member_id) values ('rtbeban008', 100000003);
update public.tasks set status = 'complete' where id = 'rtbeban003';
update public.tasks set archived = true where id = 'rtbeban004';
update public.tasks set deleted_at = now() where id = 'rtbeban005';

select uji.sama(public.beban(100000002, '2027-01-06'), 3,
  'beban Citra 6/1/2027 = 3 (B1, B2, B8; tanpa selesai/arsip/hapus/tidak_ditagih/hari lain)');
select uji.sama(public.beban(100000003, '2027-01-06'), 1, 'beban Dodi 6/1/2027 = 1 (kartu bersama +1 per assignee)');
select uji.sama(public.beban(100000002, '2027-01-08'), 0, 'beban hari kosong = 0');

reset role;
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.sama(public.beban(100000002, '2027-01-06'), 3, 'beban bisa dipanggil member (authenticated)');
reset role;
select uji.jadi('99999999-9999-4999-8999-999999999999');
select uji.cek(public.beban(100000002, '2027-01-06') is null, 'beban → null untuk authenticated non-member');
reset role;

rollback;
