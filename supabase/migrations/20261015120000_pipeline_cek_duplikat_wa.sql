-- Pipeline: PERINGATAN lead dobel berdasarkan nomor WA/telepon (IMP-CMO-261015-1, ACC Hannes 15 Okt 2026).
-- Data Okt: 50 dari 170 lead bernama pelanggan "-", jadi kunci dobel = NOMOR, bukan nama. Form "Lead baru" memanggil
-- web_pipeline_cek_duplikat saat kolom Telepon/WA ditinggalkan dan sebelum simpan; bila ada lead lain dengan nomor
-- yang sama, web menampilkan PERINGATAN (bukan blokir) — rep tetap boleh menyimpan.
--
-- Normalisasi = public.pipeline_telp_norm (sama dengan yang dipakai saat simpan kontak & alat impor, jadi cocok dengan
-- kontak.telepon yang tersimpan): digit saja (spasi, strip, titik, "+" dibuang), awalan "0" → "62", awalan "8" → "628".
-- Nomor < 8 digit sesudah normalisasi diabaikan (hasil kosong, bukan galat).
--
-- Hak: sama dengan web_pipeline_pelanggan_cari (pencarian dedup di form yang sama) — hanya admin/owner/bot + rep.
-- Peran 'baca' (Yosie) TIDAK: baginya telepon & nama PIC disamarkan (§6), jadi cari-lewat-nomor tidak dibuka. Rep sudah
-- melihat semua lead lewat RLS (boleh_pipeline_penuh), jadi hasil ini tidak memperluas akses.
-- ADITIF: 2 fungsi baru, tanpa ubah tabel/data. Hak fail-closed (pola 20261013121000_pipeline_hak_ketat).

create or replace function public.inti_pipeline_cek_duplikat(p_telepon text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_telp text := public.pipeline_telp_norm(p_telepon);
begin
  -- coalesce: peran NULL (tanpa akses Pipeline) juga ditolak
  if coalesce(public.pipeline_peran_aktor(), '') not in ('admin', 'rep') then
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if v_telp is null or length(v_telp) < 8 then
    return jsonb_build_object('telepon', null, 'total', 0, 'items', '[]'::jsonb);
  end if;
  return (
    with cocok as (
      select l.id, l.kode, l.tahap, l.tanggal_masuk, l.dibuat_pada, pg.nama as pelanggan,
             l.pemilik, mp.username as pemilik_nama, k.nama as kontak_nama
        from public.kontak k
        join public.lead l on l.kontak_id = k.id
        join public.pelanggan pg on pg.id = l.pelanggan_id
        left join public.members mp on mp.id = l.pemilik
       where k.telepon = v_telp)
    select jsonb_build_object(
      'telepon', v_telp,
      'total', (select count(*)::int from cocok),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'kode', c.kode, 'pelanggan', c.pelanggan, 'tahap', c.tahap,
                 'pemilik', c.pemilik, 'pemilik_nama', c.pemilik_nama, 'kontak_nama', c.kontak_nama,
                 'tanggal_masuk', c.tanggal_masuk, 'dibuat_pada', public.iso_utc(c.dibuat_pada))
               order by c.tanggal_masuk desc, c.dibuat_pada desc, c.kode desc)
          from (select * from cocok order by tanggal_masuk desc, dibuat_pada desc, kode desc limit 5) c),
        '[]'::jsonb)));
end; $$;

create or replace function public.web_pipeline_cek_duplikat(p_telepon text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_cek_duplikat(p_telepon); end; $$;

-- ============================================================ hak: inti internal; web_ → authenticated saja
revoke all on function public.inti_pipeline_cek_duplikat(text) from public, anon, authenticated, service_role;
revoke all on function public.web_pipeline_cek_duplikat(text) from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_cek_duplikat(text) to authenticated;
