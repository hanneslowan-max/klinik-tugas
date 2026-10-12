-- Modul Pipeline — fungsi tulis (aturan §3) + baca (dengan penyamaran §6). Pola inti_/web_/x_ seperti lampiran:
-- SEMUA logika di inti_* (pakai penilai()/aktor() → jalan di web JWT, API token, & uji DB app-context);
-- web_* = mulai_web() + inti ; x_* (baca saja, untuk routine) = mulai_api(…, 'baca') + inti. Ringkasan §4 di file terpisah.

-- kode SP rep (RSG/MCE) untuk membangun no_sp otomatis (K11). Aditif ke tabel pipeline_akses sendiri.
alter table public.pipeline_akses add column if not exists kode_sp text;

-- ============================================================ pembantu
-- Peran pipeline aktor (web: penilai()=member JWT; API/uji: penilai()=aktor()=app.actor_id). Owner & bot = 'admin'
-- (owner penuh; bot = routine/agent baca penuh tanpa penyamaran). Selain itu ambil dari pipeline_akses.
create or replace function public.pipeline_peran_aktor()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.members m where m.id = public.penilai() and m.aktif and m.role in ('owner', 'bot')) then 'admin'
    else (select pa.peran from public.pipeline_akses pa where pa.member_id = public.penilai())
  end
$$;

-- Normalisasi telepon Indonesia → "62…" (digit saja). <7 digit → null.
create or replace function public.pipeline_telp_norm(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text;
begin
  d := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
  if length(d) < 7 then return null; end if;
  if left(d, 2) = '62' then return d; end if;
  if left(d, 1) = '0' then return '62' || substr(d, 2); end if;
  if left(d, 1) = '8' then return '62' || d; end if;
  return d;
end; $$;

create or replace function public.pipeline_romawi(n int)
returns text language sql immutable set search_path = '' as $$
  select case when n between 1 and 12
    then (array['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'])[n] end
$$;

-- Pembentuk JSON satu lead (detail). p_mask = sembunyikan telepon + nama PIC (Yosie / peran 'baca', §6).
create or replace function public.j_pipeline_lead(p_id text, p_mask boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'kode', l.kode, 'tanggal_masuk', l.tanggal_masuk, 'tahap', l.tahap, 'sumber', l.sumber,
    'pemilik', l.pemilik, 'pemilik_nama', mp.username, 'pemilik_kode_sp', pa.kode_sp, 'dialihkan_ke', l.dialihkan_ke,
    'kebutuhan', l.kebutuhan, 'catatan', l.catatan, 'catatan_impor', l.catatan_impor,
    'nilai_penawaran', l.nilai_penawaran, 'tanggal_penawaran', l.tanggal_penawaran,
    'no_sp', l.no_sp, 'tanggal_sp', l.tanggal_sp, 'nilai_transaksi', l.nilai_transaksi,
    'alasan_batal', l.alasan_batal, 'alasan_batal_lain', l.alasan_batal_lain,
    'periksa', l.periksa, 'periksa_sebab', l.periksa_sebab, 'ref_sheet', l.ref_sheet,
    'diam_sejak', public.iso_utc(l.diam_sejak),
    'diam_hari', greatest(0, public.hari_ini_wib() - l.diam_sejak::date),
    'fu_berikutnya', l.fu_berikutnya,
    'dibuat_pada', public.iso_utc(l.dibuat_pada),
    'pelanggan', jsonb_build_object('id', pg.id, 'nama', pg.nama, 'jenis', pg.jenis, 'kota', pg.kota),
    'kontak', case when l.kontak_id is null then null else jsonb_build_object(
      'id', k.id,
      'nama', case when p_mask then null else k.nama end,
      'telepon', case when p_mask then null else coalesce(k.telepon_tampil, k.telepon) end,
      'jabatan', k.jabatan) end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'produk', i.produk, 'qty', i.qty, 'satuan', i.satuan,
        'spesifikasi', i.spesifikasi, 'periksa', i.periksa) order by i.id), '[]'::jsonb)
      from public.lead_item i where i.lead_id = l.id),
    'aktivitas', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'waktu', public.iso_utc(a.waktu), 'oleh', a.oleh, 'jenis', a.jenis,
        'hasil', a.hasil, 'rencana_berikutnya', a.rencana_berikutnya) order by a.waktu desc, a.id desc), '[]'::jsonb)
      from public.lead_aktivitas a where a.lead_id = l.id),
    'riwayat_tahap', (select coalesce(jsonb_agg(jsonb_build_object(
        'dari', r.dari, 'ke', r.ke, 'waktu', public.iso_utc(r.waktu)) order by r.id), '[]'::jsonb)
      from public.lead_riwayat_tahap r where r.lead_id = l.id))
  from public.lead l
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.kontak k on k.id = l.kontak_id
    left join public.members mp on mp.id = l.pemilik
    left join public.pipeline_akses pa on pa.member_id = l.pemilik
  where l.id = p_id
$$;

-- Baris ringkas untuk daftar. Nama perusahaan tetap tampil (perusahaan bukan rahasia utk Yosie); telepon/PIC tidak diikutkan.
create or replace function public.j_pipeline_lead_ringkas(p_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'kode', l.kode, 'tahap', l.tahap, 'sumber', l.sumber,
    'pelanggan', pg.nama, 'kota', pg.kota, 'pemilik', l.pemilik, 'pemilik_nama', mp.username,
    'tanggal_masuk', l.tanggal_masuk, 'diam_hari', greatest(0, public.hari_ini_wib() - l.diam_sejak::date),
    'fu_berikutnya', l.fu_berikutnya,
    'nilai_transaksi', l.nilai_transaksi, 'no_sp', l.no_sp, 'periksa', l.periksa,
    'produk', (select coalesce(jsonb_agg(jsonb_build_object('produk', i.produk, 'qty', i.qty, 'satuan', i.satuan) order by i.id), '[]'::jsonb)
      from public.lead_item i where i.lead_id = l.id))
  from public.lead l
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.members mp on mp.id = l.pemilik
  where l.id = p_id
$$;

-- Ambil lead + 404 bila tak ada. Dipakai fungsi tulis.
create or replace function public.pipeline_lead_wajib(p_id text)
returns public.lead language plpgsql stable security definer set search_path = '' as $$
declare r public.lead;
begin
  select * into r from public.lead where id = p_id;
  if not found then perform public.lempar('PT404', 'Lead tidak ditemukan', 'ITEM_013'); end if;
  return r;
end; $$;

-- Boleh ubah lead: owner/admin, ATAU pemilik = aktor, ATAU belum ada pemilik (boleh diklaim). Selain itu 403.
create or replace function public.pipeline_boleh_ubah(p_pemilik bigint)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if public.pipeline_peran_aktor() not in ('admin', 'rep') then
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if public.pipeline_peran_aktor() = 'admin' then return; end if;
  if p_pemilik is null or p_pemilik = public.aktor() then return; end if;
  perform public.lempar('PT403', 'Lead ini milik rep lain', 'ACCESS_001');
end; $$;

-- ============================================================ tulis: buat lead (+pelanggan/kontak)
create or replace function public.inti_pipeline_lead_buat(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_pel text; v_kontak text; v_id text;
  v_tgl date; v_pemilik bigint; v_telp text; v_item jsonb; v_n int := 0;
begin
  if v_peran not in ('admin', 'rep') then
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

-- ============================================================ tulis: catat follow-up
create or replace function public.inti_pipeline_fu_catat(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lead public.lead;
begin
  v_lead := public.pipeline_lead_wajib(p->>'lead_id');
  perform public.pipeline_boleh_ubah(v_lead.pemilik);
  insert into public.lead_aktivitas (lead_id, jenis, hasil, rencana_berikutnya, oleh)
    values (v_lead.id, coalesce(nullif(p->>'jenis', ''), 'Catatan'), nullif(p->>'hasil', ''),
            nullif(p->>'rencana_berikutnya', '')::date, public.aktor());
  return public.j_pipeline_lead(v_lead.id, false);
end; $$;

-- ============================================================ tulis: pindah tahap (penawaran/order/batal/alihkan)
create or replace function public.inti_pipeline_tahap(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_lead public.lead; v_aksi text := p->>'aksi';
  v_pemilik bigint; v_kode text; v_sp text; v_tgl_sp date; v_nilai bigint;
begin
  v_lead := public.pipeline_lead_wajib(p->>'lead_id');
  perform public.pipeline_boleh_ubah(v_lead.pemilik);

  if v_aksi = 'penawaran' then
    update public.lead set tahap = 'PENAWARAN',
      nilai_penawaran = coalesce(nullif(p->>'nilai_penawaran', '')::bigint, nilai_penawaran)
     where id = v_lead.id;

  elsif v_aksi = 'order' then
    v_tgl_sp := coalesce(nullif(p->>'tanggal_sp', '')::date, public.hari_ini_wib());
    if v_tgl_sp > public.hari_ini_wib() then perform public.lempar('PT400', 'Tanggal SP tidak boleh di masa depan', 'INPUT_001'); end if;
    v_nilai := nullif(p->>'nilai_transaksi', '')::bigint;
    if v_nilai is null or v_nilai <= 0 then perform public.lempar('PT400', 'Nilai transaksi wajib > 0 untuk order', 'INPUT_001'); end if;
    v_pemilik := coalesce(v_lead.pemilik, public.aktor());        -- klaim bila belum ada pemilik
    select kode_sp into v_kode from public.pipeline_akses where member_id = v_pemilik;
    if nullif(p->>'no_sp', '') is not null then
      v_sp := btrim(p->>'no_sp');
    else
      if nullif(p->>'nomor', '') is null then perform public.lempar('PT400', 'Nomor SP wajib', 'INPUT_001'); end if;
      if v_kode is null then perform public.lempar('PT400', 'Pemilik lead belum punya kode SP (RSG/MCE)', 'INPUT_001'); end if;
      v_sp := regexp_replace(p->>'nomor', '[^0-9]', '', 'g') || '/' || v_kode || '/'
            || public.pipeline_romawi(extract(month from v_tgl_sp)::int) || '/' || extract(year from v_tgl_sp)::text;
    end if;
    if v_sp !~ '^\d+/(RSG|MCE)/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/20\d\d$' then
      perform public.lempar('PT400', format('No SP tidak sesuai pola: %s', v_sp), 'INPUT_001');
    end if;
    if exists (select 1 from public.lead where no_sp = v_sp and id <> v_lead.id) then
      perform public.lempar('PT409', format('No SP sudah dipakai lead lain: %s', v_sp), 'KONFLIK_001');
    end if;
    update public.lead set tahap = 'ORDER', pemilik = v_pemilik, no_sp = v_sp,
      tanggal_sp = v_tgl_sp, nilai_transaksi = v_nilai where id = v_lead.id;

  elsif v_aksi = 'batal' then
    if nullif(p->>'alasan_batal', '') is null then perform public.lempar('PT400', 'Alasan batal wajib', 'INPUT_001'); end if;
    if p->>'alasan_batal' = 'Lainnya' and nullif(p->>'alasan_batal_lain', '') is null then
      perform public.lempar('PT400', 'Alasan batal "Lainnya" wajib diisi teks', 'INPUT_001');
    end if;
    update public.lead set tahap = 'BATAL', alasan_batal = p->>'alasan_batal',
      alasan_batal_lain = nullif(p->>'alasan_batal_lain', '') where id = v_lead.id;

  elsif v_aksi = 'alihkan' then
    if nullif(p->>'dialihkan_ke', '') is null then perform public.lempar('PT400', 'Tujuan pengalihan wajib diisi', 'INPUT_001'); end if;
    update public.lead set tahap = 'DIALIHKAN', dialihkan_ke = btrim(p->>'dialihkan_ke') where id = v_lead.id;

  else
    perform public.lempar('PT400', format('Aksi tahap tidak dikenal: %s', coalesce(v_aksi, '(kosong)')), 'INPUT_001');
  end if;

  return public.j_pipeline_lead(v_lead.id, false);
end; $$;

-- ============================================================ tulis: ubah field dasar + klaim
create or replace function public.inti_pipeline_lead_ubah(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lead public.lead; v_item jsonb;
begin
  v_lead := public.pipeline_lead_wajib(p->>'lead_id');
  perform public.pipeline_boleh_ubah(v_lead.pemilik);
  update public.lead set
    kebutuhan = case when p ? 'kebutuhan' then nullif(p->>'kebutuhan', '') else kebutuhan end,
    catatan   = case when p ? 'catatan'   then nullif(p->>'catatan', '')   else catatan end,
    sumber    = case when nullif(p->>'sumber', '') is not null then p->>'sumber' else sumber end,
    pemilik   = case when coalesce((p->>'klaim')::boolean, false) and pemilik is null then public.aktor() else pemilik end
   where id = v_lead.id;
  if jsonb_typeof(p->'items') = 'array' then
    if jsonb_array_length(p->'items') < 1 then perform public.lempar('PT400', 'Minimal 1 produk', 'INPUT_001'); end if;
    delete from public.lead_item where lead_id = v_lead.id;
    for v_item in select * from jsonb_array_elements(p->'items') loop
      if nullif(v_item->>'qty', '') is null or (v_item->>'qty')::numeric <= 0 then
        perform public.lempar('PT400', 'Qty wajib diisi (> 0)', 'INPUT_001');
      end if;
      insert into public.lead_item (lead_id, produk, qty, satuan, spesifikasi)
        values (v_lead.id, v_item->>'produk', (v_item->>'qty')::numeric,
                coalesce(nullif(v_item->>'satuan', ''), 'unit'), nullif(v_item->>'spesifikasi', ''));
    end loop;
  end if;
  return public.j_pipeline_lead(v_lead.id, false);
end; $$;

-- ============================================================ admin: kelola akses modul (owner)
create or replace function public.inti_pipeline_akses_simpan(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_mid bigint := nullif(p->>'member_id', '')::bigint;
begin
  if not exists (select 1 from public.members m where m.id = public.penilai() and m.role = 'owner' and m.aktif) then
    perform public.lempar('PT403', 'Hanya owner yang boleh mengatur akses Pipeline', 'ACCESS_001');
  end if;
  if v_mid is null then perform public.lempar('PT400', 'member_id wajib', 'INPUT_001'); end if;
  if coalesce((p->>'hapus')::boolean, false) then
    delete from public.pipeline_akses where member_id = v_mid;
  else
    if nullif(p->>'peran', '') not in ('admin', 'rep', 'baca') then perform public.lempar('PT400', 'Peran tidak sah', 'INPUT_001'); end if;
    insert into public.pipeline_akses (member_id, peran, kode_sp, ditambah_oleh)
      values (v_mid, p->>'peran', nullif(p->>'kode_sp', ''), public.aktor())
      -- rep: pertahankan kode SP lama bila tak dikirim (lindungi dari terhapus tak sengaja). admin/baca: ambil apa
      -- adanya, jadi ganti peran rep→baca/admin ikut mengosongkan kode SP (tak nyangkut & tak menyesatkan).
      on conflict (member_id) do update set peran = excluded.peran,
        kode_sp = case when excluded.peran = 'rep'
                    then coalesce(excluded.kode_sp, public.pipeline_akses.kode_sp)
                    else excluded.kode_sp end;
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('member_id', pa.member_id, 'username', m.username,
            'peran', pa.peran, 'kode_sp', pa.kode_sp) order by pa.member_id), '[]'::jsonb)
          from public.pipeline_akses pa join public.members m on m.id = pa.member_id);
end; $$;

-- ============================================================ baca: detail, daftar, cari pelanggan
create or replace function public.inti_pipeline_lead(p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_peran text := public.pipeline_peran_aktor(); v_j jsonb;
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  v_j := public.j_pipeline_lead(p_id, v_peran = 'baca');
  if v_j is null then perform public.lempar('PT404', 'Lead tidak ditemukan', 'ITEM_013'); end if;
  return v_j;
end; $$;

create or replace function public.inti_pipeline_daftar(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_tab text := coalesce(nullif(p->>'tab', ''), 'semua');
  v_pemilik bigint := nullif(p->>'pemilik', '')::bigint;
  v_q text := nullif(btrim(coalesce(p->>'q', '')), '');
  v_ids text[];
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  select array_agg(l.id order by
           case when l.diam_sejak is null then 1 else 0 end, l.diam_sejak asc, l.id)
    into v_ids
  from public.lead l
    join public.pelanggan pg on pg.id = l.pelanggan_id
  where (v_pemilik is null or l.pemilik = v_pemilik)
    and (v_tab <> 'diam'      or (l.tahap in ('BARU', 'PENAWARAN') and l.diam_sejak < now() - interval '7 days'))
    and (v_tab <> 'fu'        or (l.tahap in ('BARU', 'PENAWARAN') and l.fu_berikutnya is not null and l.fu_berikutnya <= public.hari_ini_wib()))
    and (v_tab <> 'pm'        or (l.tahap in ('BARU', 'PENAWARAN') and exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh')))
    and (v_tab <> 'penawaran' or l.tahap = 'PENAWARAN')
    and (v_tab <> 'order'     or l.tahap = 'ORDER')
    and (v_tab <> 'batal'     or l.tahap = 'BATAL')
    and (v_tab <> 'periksa'   or l.periksa)
    and (v_q is null or pg.nama ilike '%' || v_q || '%' or l.kode ilike '%' || v_q || '%'
         or l.cari @@ plainto_tsquery('simple'::regconfig, v_q));
  return jsonb_build_object(
    'total', coalesce(array_length(v_ids, 1), 0),
    'items', (select coalesce(jsonb_agg(public.j_pipeline_lead_ringkas(x)), '[]'::jsonb)
              from unnest(coalesce(v_ids, '{}')) as x));
end; $$;

create or replace function public.inti_pipeline_pelanggan_cari(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), ''); v_telp text;
begin
  if public.pipeline_peran_aktor() not in ('admin', 'rep') then
    perform public.lempar('PT403', 'Tidak punya akses tulis Pipeline', 'ACCESS_001');
  end if;
  if v_q is null then return '[]'::jsonb; end if;
  v_telp := public.pipeline_telp_norm(v_q);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id, 'nama', pg.nama, 'kota', pg.kota, 'jenis', pg.jenis,
      'kontak', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'nama', k.nama,
                  'telepon', coalesce(k.telepon_tampil, k.telepon)) order by k.id), '[]'::jsonb)
                 from public.kontak k where k.pelanggan_id = pg.id)) order by pg.nama), '[]'::jsonb)
    from public.pelanggan pg
    where pg.nama ilike '%' || v_q || '%'
       or (v_telp is not null and exists (select 1 from public.kontak k where k.pelanggan_id = pg.id and k.telepon = v_telp))
    limit 15);
end; $$;

-- ============================================================ bungkus web_ (JWT) & x_ (API baca, routine)
create or replace function public.web_pipeline_lead_buat(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_lead_buat(p); end; $$;
create or replace function public.web_pipeline_fu_catat(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_fu_catat(p); end; $$;
create or replace function public.web_pipeline_tahap(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_tahap(p); end; $$;
create or replace function public.web_pipeline_lead_ubah(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_lead_ubah(p); end; $$;
create or replace function public.web_pipeline_akses_simpan(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(true); return public.inti_pipeline_akses_simpan(p); end; $$;
create or replace function public.web_pipeline_lead(p_id text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_lead(p_id); end; $$;
create or replace function public.web_pipeline_daftar(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_daftar(p); end; $$;
create or replace function public.web_pipeline_pelanggan_cari(p_q text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan_cari(p_q); end; $$;

-- API baca (routine/agent via token service_role). Tidak menyamarkan (bot = 'admin').
create or replace function public.x_pipeline_daftar(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); return public.inti_pipeline_daftar(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_pipeline_lead(p_aktor bigint, p_id text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); return public.inti_pipeline_lead(p_id); end; $$;

-- ============================================================ hak (ARSITEKTUR §4): inti internal; web_→authenticated; x_→service_role
revoke all on function
  public.pipeline_peran_aktor(), public.pipeline_telp_norm(text), public.pipeline_romawi(int),
  public.j_pipeline_lead(text, boolean), public.j_pipeline_lead_ringkas(text), public.pipeline_lead_wajib(text),
  public.pipeline_boleh_ubah(bigint),
  public.inti_pipeline_lead_buat(jsonb), public.inti_pipeline_fu_catat(jsonb), public.inti_pipeline_tahap(jsonb),
  public.inti_pipeline_lead_ubah(jsonb), public.inti_pipeline_akses_simpan(jsonb),
  public.inti_pipeline_lead(text), public.inti_pipeline_daftar(jsonb), public.inti_pipeline_pelanggan_cari(text)
from public, anon, authenticated, service_role;

grant execute on function
  public.web_pipeline_lead_buat(jsonb), public.web_pipeline_fu_catat(jsonb), public.web_pipeline_tahap(jsonb),
  public.web_pipeline_lead_ubah(jsonb), public.web_pipeline_akses_simpan(jsonb), public.web_pipeline_lead(text),
  public.web_pipeline_daftar(jsonb), public.web_pipeline_pelanggan_cari(text)
to authenticated;

grant execute on function public.x_pipeline_daftar(bigint, jsonb), public.x_pipeline_lead(bigint, text) to service_role;
