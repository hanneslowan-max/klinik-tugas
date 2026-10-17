-- Perbaikan hak database pelanggan (17 Okt, temuan sesudah 20261017120000 diterapkan di produksi).
-- inti_pipeline_pelanggan_ubah & inti_pipeline_pelanggan_cari memeriksa `pipeline_peran_aktor() not in ('admin','rep')`;
-- anggota Anvil TANPA akses Pipeline punya peran NULL dan `NULL not in (…)` = NULL → pemeriksaan lolos, jadi lewat RPC
-- langsung (UI menyembunyikan menu) mereka bisa mengubah nama/kota pelanggan dan mencari pelanggan + kontak (nama PIC,
-- nomor HP). Kini coalesce(peran, '') → ditolak PT403 seperti peran 'baca'. Isi fungsi lain sama persis dengan
-- 20261017120000. Fungsi pelanggan lainnya sudah benar (`v_peran is null` / `is distinct from 'admin'`).
-- Pola yang sama di fungsi lama (inti_pipeline_lead_buat, pipeline_boleh_ubah) TIDAK diubah di sini (di luar PR ini).

create or replace function public.inti_pipeline_pelanggan_ubah(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id text := nullif(p->>'pelanggan_id', '');
begin
  if coalesce(public.pipeline_peran_aktor(), '') not in ('admin', 'rep') then   -- NULL (tanpa akses) juga ditolak
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if v_id is null or not exists (select 1 from public.pelanggan where id = v_id) then
    perform public.lempar('PT404', 'Pelanggan tidak ditemukan', 'ITEM_013');
  end if;
  if p ? 'nama' and nullif(btrim(coalesce(p->>'nama', '')), '') is null then
    perform public.lempar('PT400', 'Nama pelanggan wajib', 'INPUT_001');
  end if;
  if length(btrim(coalesce(p->>'nama', ''))) > 200 or length(btrim(coalesce(p->>'kota', ''))) > 300
     or length(btrim(coalesce(p->>'catatan', ''))) > 2000 then
    perform public.lempar('PT400', 'Teks terlalu panjang (nama ≤200, kota ≤300, catatan ≤2.000 karakter)', 'INPUT_001');
  end if;
  if p ? 'jenis' and coalesce(p->>'jenis', '') not in ('perusahaan', 'perorangan') then
    perform public.lempar('PT400', 'Jenis pelanggan tidak sah', 'INPUT_001');
  end if;
  update public.pelanggan set
    nama    = case when p ? 'nama' then btrim(p->>'nama') else nama end,
    kota    = case when p ? 'kota' then nullif(btrim(coalesce(p->>'kota', '')), '') else kota end,
    jenis   = case when p ? 'jenis' then p->>'jenis' else jenis end,
    catatan = case when p ? 'catatan' then nullif(btrim(coalesce(p->>'catatan', '')), '') else catatan end
   where id = v_id;
  return public.inti_pipeline_pelanggan(v_id);
end; $$;

create or replace function public.inti_pipeline_pelanggan_cari(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), ''); v_telp text; v_kunci text; v_pola text;
begin
  if coalesce(public.pipeline_peran_aktor(), '') not in ('admin', 'rep') then   -- NULL (tanpa akses) juga ditolak
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if v_q is null then return '[]'::jsonb; end if;
  v_telp := public.pipeline_telp_norm(v_q);
  v_kunci := public.pipeline_nama_kunci(v_q);
  v_pola := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return (
    with c as materialized (
      select pg.id, pg.nama, pg.kota, pg.jenis, pg.semu,
             case when v_telp is not null and exists (select 1 from public.kontak k where k.pelanggan_id = pg.id and k.telepon = v_telp) then 0
                  when v_kunci is not null and pg.kunci = v_kunci then 1
                  else 2 end as skor
        from public.pelanggan pg
       where (v_telp is not null and exists (select 1 from public.kontak k where k.pelanggan_id = pg.id and k.telepon = v_telp))
          or (not pg.semu
              and (pg.nama ilike v_pola
                   or (length(v_kunci) >= 3 and pg.kunci like '%' || v_kunci || '%')))
    ), s as materialized (select * from public.pipeline_pelanggan_stat(array(select c.id from c))),
    top as (
      select c.*, coalesce(s.jml_lead, 0) as jml_lead, coalesce(s.jml_order, 0) as jml_order, s.order_terakhir
        from c left join s on s.pelanggan_id = c.id
       order by c.skor, coalesce(s.jml_order, 0) desc, coalesce(s.jml_lead, 0) desc, c.nama, c.id
       limit 15
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'nama', t.nama, 'kota', t.kota, 'jenis', t.jenis, 'semu', t.semu,
      'jml_lead', t.jml_lead, 'jml_order', t.jml_order, 'order_terakhir', t.order_terakhir,
      'kontak', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'nama', k.nama,
                  'telepon', coalesce(k.telepon_tampil, k.telepon)) order by k.id), '[]'::jsonb)
                 from public.kontak k where k.pelanggan_id = t.id))
      order by t.skor, t.jml_order desc, t.jml_lead desc, t.nama, t.id), '[]'::jsonb)
      from top t);
end; $$;

-- hak tetap fail-closed (create or replace mempertahankan hak; diulang supaya eksplisit)
revoke all on function public.inti_pipeline_pelanggan_ubah(jsonb), public.inti_pipeline_pelanggan_cari(text)
from public, anon, authenticated, service_role;
