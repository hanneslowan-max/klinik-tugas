-- Hak Pipeline: tolak peran NULL (temuan sampingan PR #14 / 20261015120000, dibuktikan di DB lokal).
-- pipeline_boleh_ubah, inti_pipeline_lead_buat, dan inti_pipeline_fu_set memeriksa `peran not in ('admin','rep')`;
-- anggota Anvil TANPA akses Pipeline punya peran NULL dan `NULL not in (…)` = NULL → pemeriksaan lolos. Lewat RPC
-- langsung (UI menyembunyikan menu) mereka bisa membuat lead, mencatat FU / pindah tahap / ubah lead TANPA pemilik
-- (pipeline_boleh_ubah dipakai web_pipeline_fu_catat, _tahap, _lead_ubah, _order_ubah), dan mengatur
-- rencana FU. Kini coalesce(peran, '') → PT403 seperti peran 'baca'. Isi fungsi lain sama persis dengan definisi
-- terakhirnya (20261011120100 / 20261011120400). Pemanggil sah tidak terdampak: owner & bot = 'admin', rep/admin dari
-- pipeline_akses, impor berjalan dengan aktor owner. Pasangan untuk fungsi pelanggan: 20261017130000.

create or replace function public.pipeline_boleh_ubah(p_pemilik bigint)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.pipeline_peran_aktor(), '') not in ('admin', 'rep') then   -- NULL (tanpa akses) juga ditolak
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if public.pipeline_peran_aktor() = 'admin' then return; end if;
  if p_pemilik is null or p_pemilik = public.aktor() then return; end if;
  perform public.lempar('PT403', 'Lead ini milik rep lain', 'ACCESS_001');
end; $$;

create or replace function public.inti_pipeline_lead_buat(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_pel text; v_kontak text; v_id text;
  v_tgl date; v_pemilik bigint; v_telp text; v_item jsonb; v_n int := 0;
begin
  if coalesce(v_peran, '') not in ('admin', 'rep') then   -- NULL (tanpa akses) juga ditolak
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if nullif(p->>'sumber', '') is null then perform public.lempar('PT400', 'Sumber lead wajib diisi', 'INPUT_001'); end if;

  v_tgl := coalesce(nullif(p->>'tanggal_masuk', '')::date, public.hari_ini_wib());
  if v_tgl > public.hari_ini_wib() then perform public.lempar('PT400', 'Tanggal masuk tidak boleh di masa depan', 'INPUT_001'); end if;
  if v_tgl < public.hari_ini_wib() - 60 and coalesce((p->>'konfirmasi')::boolean, false) is not true then
    perform public.lempar('PT400', 'Tanggal masuk lebih dari 60 hari lalu — konfirmasi dulu', 'INPUT_001');
  end if;

  -- pelanggan: pakai yang ada atau buat baru
  if nullif(p->>'pelanggan_id', '') is not null then
    select id into v_pel from public.pelanggan where id = p->>'pelanggan_id';
    if v_pel is null then perform public.lempar('PT404', 'Pelanggan tidak ditemukan', 'ITEM_013'); end if;
  else
    if nullif(p#>>'{pelanggan,nama}', '') is null then perform public.lempar('PT400', 'Nama pelanggan wajib', 'INPUT_001'); end if;
    insert into public.pelanggan (nama, jenis, kota)
      values (btrim(p#>>'{pelanggan,nama}'),
              coalesce(nullif(p#>>'{pelanggan,jenis}', ''), 'perusahaan'),
              nullif(p#>>'{pelanggan,kota}', ''))
      returning id into v_pel;
  end if;

  -- kontak (opsional): dedup telepon dalam pelanggan yang sama
  if nullif(p#>>'{kontak,nama}', '') is not null or nullif(p#>>'{kontak,telepon}', '') is not null then
    v_telp := public.pipeline_telp_norm(p#>>'{kontak,telepon}');
    if v_telp is not null then
      select id into v_kontak from public.kontak where pelanggan_id = v_pel and telepon = v_telp limit 1;
    end if;
    if v_kontak is null then
      insert into public.kontak (pelanggan_id, nama, telepon, telepon_tampil, jabatan)
        values (v_pel, nullif(p#>>'{kontak,nama}', ''), v_telp,
                nullif(p#>>'{kontak,telepon}', ''), nullif(p#>>'{kontak,jabatan}', ''))
        returning id into v_kontak;
    end if;
  end if;

  -- pemilik: rep SELALU dirinya (abaikan payload, cegah palsukan kepemilikan); admin/owner boleh set eksplisit atau kosong (K1/§6)
  if v_peran = 'rep' then
    v_pemilik := public.aktor();
  else
    v_pemilik := nullif(p->>'pemilik', '')::bigint;
  end if;
  if v_pemilik is not null and not exists (
    select 1 from public.members m where m.id = v_pemilik and m.aktif and m.role in ('owner', 'member')
  ) then
    perform public.lempar('PT400', 'Pemilik tidak dikenal / tidak aktif', 'INPUT_001');
  end if;

  insert into public.lead (pelanggan_id, kontak_id, sumber, pemilik, tanggal_masuk, kebutuhan, catatan, ref_sheet)
    values (v_pel, v_kontak, p->>'sumber', v_pemilik, v_tgl,
            nullif(p->>'kebutuhan', ''), nullif(p->>'catatan', ''), nullif(p->>'ref_sheet', ''))
    returning id into v_id;

  -- items: minimal 1, qty wajib > 0 semua produk (K5)
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') < 1 then
    perform public.lempar('PT400', 'Minimal 1 produk', 'INPUT_001');
  end if;
  for v_item in select * from jsonb_array_elements(p->'items') loop
    if nullif(v_item->>'qty', '') is null or (v_item->>'qty')::numeric <= 0 then
      perform public.lempar('PT400', 'Qty wajib diisi (> 0) untuk tiap produk', 'INPUT_001');
    end if;
    insert into public.lead_item (lead_id, produk, qty, satuan, spesifikasi)
      values (v_id, v_item->>'produk', (v_item->>'qty')::numeric,
              coalesce(nullif(v_item->>'satuan', ''), 'unit'), nullif(v_item->>'spesifikasi', ''));
    v_n := v_n + 1;
  end loop;

  return public.j_pipeline_lead(v_id, false);
end; $$;

create or replace function public.inti_pipeline_fu_set(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_lead public.lead; v_tgl date; v_n int := 0;
begin
  if coalesce(public.pipeline_peran_aktor(), '') not in ('admin', 'rep') then   -- NULL (tanpa akses) juga ditolak
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if jsonb_typeof(p->'items') is distinct from 'array' then
    perform public.lempar('PT400', 'items wajib berupa array {lead_id, tanggal?}', 'INPUT_001');
  end if;
  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_lead := public.pipeline_lead_wajib(v_item->>'lead_id');   -- 404 bila lead tak ada
    perform public.pipeline_boleh_ubah(v_lead.pemilik);          -- admin/bot: semua; rep: lead sendiri
    v_tgl := coalesce(nullif(v_item->>'tanggal', '')::date, public.hari_ini_wib());
    update public.lead set fu_berikutnya = v_tgl where id = v_lead.id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('diset', v_n);
end; $$;

-- hak tetap fail-closed (create or replace mempertahankan hak; diulang supaya eksplisit)
revoke all on function public.pipeline_boleh_ubah(bigint), public.inti_pipeline_lead_buat(jsonb), public.inti_pipeline_fu_set(jsonb)
from public, anon, authenticated, service_role;
