-- Modul Pipeline — revisi #3–#7 (13 Okt 2026): tab "Order" untuk memantau pesanan customer.
--   #4 pencarian: nama perusahaan, PIC (nama customer), produk, No SP, No PO, kode lead (+ kebutuhan/catatan seperti dulu)
--   #5 nominal order & #6 No SP: sudah ada (nilai_transaksi, no_sp, tanggal_sp, diisi saat lead jadi ORDER) — kini bisa
--      diubah sesudahnya lewat web_pipeline_order_ubah (mis. order impor yang nilainya kosong)
--   No PO customer (keputusan Hannes: kolom terpisah dari No SP RHJ) → kolom baru no_po
--   #7 pelunasan (keputusan Hannes: Belum / DP / Lunas) → bayar_status + bayar_dp + tanggal_dp + tanggal_lunas + jejak
--      siapa/kapan. Order yang SUDAH ada sebelum migrasi ini: bayar_status NULL = "belum dicatat" (status bayarnya tidak
--      diketahui; tidak dihitung sebagai piutang). Lead yang menjadi ORDER sesudah ini otomatis 'BELUM' (trigger).
-- Hak ubah (keputusan Hannes): rep pemilik lead + admin/owner = pipeline_boleh_ubah (sama dengan ubah lead lain); 'baca' melihat saja.
-- ADITIF: kolom nullable/default, fungsi baru, redefinisi pembentuk JSON (field bertambah saja) & daftar (pencarian lebih luas).

-- ============================================================ kolom
alter table public.lead
  add column if not exists no_po              text,
  add column if not exists bayar_status       text,
  add column if not exists bayar_dp           bigint,
  add column if not exists tanggal_dp         date,
  add column if not exists tanggal_lunas      date,
  add column if not exists bayar_diubah_oleh  bigint references public.members (id),
  add column if not exists bayar_diubah_pada  timestamptz;

alter table public.lead
  add constraint lead_no_po_panjang check (no_po is null or length(no_po) between 1 and 60),
  add constraint lead_bayar_status_sah check (bayar_status is null or bayar_status in ('BELUM', 'DP', 'LUNAS')),
  add constraint lead_bayar_dp_positif check (bayar_dp is null or bayar_dp > 0),
  -- DP wajib punya nominal & tanggal DP; LUNAS wajib punya tanggal lunas
  add constraint lead_bayar_konsisten check (
    (bayar_status is distinct from 'DP' or (bayar_dp is not null and tanggal_dp is not null))
    and (bayar_status is distinct from 'LUNAS' or tanggal_lunas is not null));

create index if not exists lead_bayar_status_idx on public.lead (bayar_status) where tahap = 'ORDER';

-- Lead yang masuk ORDER (insert atau ubah tahap) tanpa status bayar → 'BELUM'. Order lama tetap NULL (belum dicatat).
create or replace function public.pipeline_lead_bayar_awal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tahap = 'ORDER' and new.bayar_status is null
     and (tg_op = 'INSERT' or old.tahap is distinct from 'ORDER') then
    new.bayar_status := 'BELUM';
  end if;
  return new;
end; $$;

drop trigger if exists pipeline_lead_bayar_awal on public.lead;
create trigger pipeline_lead_bayar_awal before insert or update of tahap on public.lead
  for each row execute function public.pipeline_lead_bayar_awal();

-- ============================================================ JSON: detail & ringkas (field bertambah saja)
create or replace function public.j_pipeline_lead(p_id text, p_mask boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'kode', l.kode, 'tanggal_masuk', l.tanggal_masuk, 'tahap', l.tahap, 'sumber', l.sumber,
    'pemilik', l.pemilik, 'pemilik_nama', mp.username, 'pemilik_kode_sp', pa.kode_sp, 'dialihkan_ke', l.dialihkan_ke,
    'kebutuhan', l.kebutuhan, 'catatan', l.catatan, 'catatan_impor', l.catatan_impor,
    'nilai_penawaran', l.nilai_penawaran, 'tanggal_penawaran', l.tanggal_penawaran,
    'no_sp', l.no_sp, 'tanggal_sp', l.tanggal_sp, 'nilai_transaksi', l.nilai_transaksi,
    'no_po', l.no_po, 'bayar_status', l.bayar_status, 'bayar_dp', l.bayar_dp, 'tanggal_dp', l.tanggal_dp,
    'tanggal_lunas', l.tanggal_lunas, 'bayar_diubah_oleh_nama', mb.username, 'bayar_diubah_pada', public.iso_utc(l.bayar_diubah_pada),
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
    left join public.members mb on mb.id = l.bayar_diubah_oleh
  where l.id = p_id
$$;

create or replace function public.j_pipeline_lead_ringkas(p_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'kode', l.kode, 'tahap', l.tahap, 'sumber', l.sumber,
    'pelanggan', pg.nama, 'kota', pg.kota, 'pemilik', l.pemilik, 'pemilik_nama', mp.username, 'pemilik_kode_sp', pa.kode_sp,
    'tanggal_masuk', l.tanggal_masuk, 'diam_hari', greatest(0, public.hari_ini_wib() - l.diam_sejak::date),
    'fu_berikutnya', l.fu_berikutnya,
    'nilai_transaksi', l.nilai_transaksi, 'no_sp', l.no_sp, 'tanggal_sp', l.tanggal_sp, 'no_po', l.no_po,
    'bayar_status', l.bayar_status, 'bayar_dp', l.bayar_dp, 'tanggal_dp', l.tanggal_dp, 'tanggal_lunas', l.tanggal_lunas,
    'periksa', l.periksa,
    'produk', (select coalesce(jsonb_agg(jsonb_build_object('produk', i.produk, 'qty', i.qty, 'satuan', i.satuan) order by i.id), '[]'::jsonb)
      from public.lead_item i where i.lead_id = l.id))
  from public.lead l
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.members mp on mp.id = l.pemilik
    left join public.pipeline_akses pa on pa.member_id = l.pemilik
  where l.id = p_id
$$;

-- ============================================================ daftar: pencarian lebih luas (#4)
-- q cocok dengan: nama perusahaan/pelanggan, kode lead, No SP, No PO (sebagian), produk & spesifikasinya, kebutuhan/catatan
-- (tsvector), dan nama PIC — PIC hanya untuk admin/rep (peran 'baca' tidak melihat PIC, §6, jadi tidak boleh mencarinya).
create or replace function public.inti_pipeline_daftar(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_tab text := coalesce(nullif(p->>'tab', ''), 'semua');
  v_pemilik bigint := nullif(p->>'pemilik', '')::bigint;
  v_q text := nullif(btrim(coalesce(p->>'q', '')), '');
  v_pola text;
  v_ids text[];
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  -- % dan _ dari pengguna dicari apa adanya (bukan wildcard)
  v_pola := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
    and (v_q is null
         or pg.nama ilike v_pola or l.kode ilike v_pola or l.no_sp ilike v_pola or l.no_po ilike v_pola
         or l.cari @@ plainto_tsquery('simple'::regconfig, v_q)
         or exists (select 1 from public.lead_item i
                     where i.lead_id = l.id and (i.produk ilike v_pola or i.spesifikasi ilike v_pola))
         or (v_peran in ('admin', 'rep') and exists (select 1 from public.kontak k
                     where (k.id = l.kontak_id or k.pelanggan_id = l.pelanggan_id) and k.nama ilike v_pola)));
  return jsonb_build_object(
    'total', coalesce(array_length(v_ids, 1), 0),
    'items', (select coalesce(jsonb_agg(public.j_pipeline_lead_ringkas(x)), '[]'::jsonb)
              from unnest(coalesce(v_ids, '{}')) as x));
end; $$;

-- ============================================================ pembantu teks catatan riwayat
-- 'Rp12.500.000' (atau '—'); dipakai catatan aktivitas perubahan data order.
create or replace function public.pipeline_rupiah(n bigint)
returns text language sql stable set search_path = '' as $$
  select case when n is null then '—' else 'Rp' || replace(to_char(n, 'FM999,999,999,999,999,999'), ',', '.') end
$$;

-- 'Belum dicatat' | 'Belum bayar' | 'DP Rp5.000.000 (02-10-2026)' | 'Lunas (12-10-2026)'
create or replace function public.pipeline_bayar_teks(p_status text, p_dp bigint, p_tgl_dp date, p_tgl_lunas date)
returns text language sql stable set search_path = '' as $$
  select case p_status
    when 'BELUM' then 'Belum bayar'
    when 'DP' then format('DP %s (%s)', public.pipeline_rupiah(p_dp), coalesce(to_char(p_tgl_dp, 'DD-MM-YYYY'), '—'))
    when 'LUNAS' then format('Lunas (%s)', coalesce(to_char(p_tgl_lunas, 'DD-MM-YYYY'), '—'))
    else 'Belum dicatat' end
$$;

-- ============================================================ ubah data order (#5 nominal, #6 No SP, No PO, #7 pelunasan)
-- p = {lead_id, nilai_transaksi?, tanggal_sp?, nomor? | no_sp?, no_po?, bayar_status?, bayar_dp?, tanggal_dp?, tanggal_lunas?}
-- Hanya kunci yang ADA di p yang diubah. No SP: 'nomor' (angka) → dibangun ulang nomor/KODE/ROMAWI/TAHUN dari tanggal SP
-- (pola sama dengan web_pipeline_tahap); 'no_sp' = teks lengkap (divalidasi pola). Tanpa keduanya No SP tidak disentuh.
-- Pembayaran: BELUM (hapus DP & tanggal) | DP (nominal DP > 0 dan < nominal order, tanggal DP) | LUNAS (tanggal lunas;
-- riwayat DP dipertahankan). bayar_dp/tanggal_dp/tanggal_lunas hanya bersama bayar_status. Tanggal tidak boleh di masa depan.
-- Baris lead dikunci (FOR UPDATE) supaya dua pengubah bersamaan tidak saling menimpa. Setiap perubahan dicatat sebagai
-- aktivitas 'Catatan' (siapa, lama → baru) — nominal & tanggal SP menentukan omzet per rep di Ringkasan. Jejak bayar
-- (bayar_diubah_oleh/pada) diperbarui bila data pembayaran berubah.
create or replace function public.inti_pipeline_order_ubah(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_lead public.lead;
  v_hari date := public.hari_ini_wib();
  v_nilai bigint; v_tgl_sp date; v_sp text; v_kode text; v_po text;
  v_status text; v_dp bigint; v_tgl_dp date; v_tgl_lunas date;
  v_catat text[] := '{}';
begin
  v_lead := public.pipeline_lead_wajib(p->>'lead_id');
  select * into v_lead from public.lead where id = v_lead.id for update;   -- serialkan pengubah bersamaan
  perform public.pipeline_boleh_ubah(v_lead.pemilik);
  if v_lead.tahap <> 'ORDER' then
    perform public.lempar('PT409', 'Data order hanya untuk lead berstatus ORDER', 'KONFLIK_001');
  end if;

  -- nominal
  v_nilai := v_lead.nilai_transaksi;
  if p ? 'nilai_transaksi' then
    if coalesce(p->>'nilai_transaksi', '') !~ '^\d{1,15}$' then
      perform public.lempar('PT400', 'Nominal order wajib angka bulat > 0', 'INPUT_001');
    end if;
    v_nilai := (p->>'nilai_transaksi')::bigint;
    if v_nilai <= 0 then perform public.lempar('PT400', 'Nominal order wajib > 0', 'INPUT_001'); end if;
  end if;

  -- tanggal SP
  v_tgl_sp := v_lead.tanggal_sp;
  if p ? 'tanggal_sp' then
    v_tgl_sp := nullif(p->>'tanggal_sp', '')::date;
    if v_tgl_sp is null then perform public.lempar('PT400', 'Tanggal SP wajib', 'INPUT_001'); end if;
    if v_tgl_sp > v_hari then perform public.lempar('PT400', 'Tanggal SP tidak boleh di masa depan', 'INPUT_001'); end if;
  end if;

  -- No SP
  v_sp := v_lead.no_sp;
  if nullif(p->>'nomor', '') is not null then
    if v_tgl_sp is null then perform public.lempar('PT400', 'Tanggal SP wajib untuk membentuk No SP', 'INPUT_001'); end if;
    -- kode SP: pertahankan kode di No SP lama (nomor dokumen asli; pemilik bisa berbeda pada order impor), baru kode pemilik
    v_kode := coalesce(substring(v_lead.no_sp from '^\d+/(RSG|MCE)/'),
                       (select kode_sp from public.pipeline_akses where member_id = v_lead.pemilik));
    if v_kode is null then perform public.lempar('PT400', 'Pemilik lead belum punya kode SP (RSG/MCE)', 'INPUT_001'); end if;
    v_sp := regexp_replace(p->>'nomor', '[^0-9]', '', 'g') || '/' || v_kode || '/'
          || public.pipeline_romawi(extract(month from v_tgl_sp)::int) || '/' || extract(year from v_tgl_sp)::text;
  elsif nullif(p->>'no_sp', '') is not null then
    v_sp := btrim(p->>'no_sp');
  end if;
  if v_sp is distinct from v_lead.no_sp then
    if v_sp !~ '^\d+/(RSG|MCE)/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/20\d\d$' then
      perform public.lempar('PT400', format('No SP tidak sesuai pola: %s', v_sp), 'INPUT_001');
    end if;
    if exists (select 1 from public.lead where no_sp = v_sp and id <> v_lead.id) then
      perform public.lempar('PT409', format('No SP sudah dipakai lead lain: %s', v_sp), 'KONFLIK_001');
    end if;
  end if;

  -- No PO customer
  v_po := v_lead.no_po;
  if p ? 'no_po' then
    v_po := nullif(btrim(regexp_replace(coalesce(p->>'no_po', ''), '\s+', ' ', 'g')), '');
    if length(v_po) > 60 then perform public.lempar('PT400', 'No PO maksimal 60 karakter', 'INPUT_001'); end if;
  end if;

  -- pembayaran
  v_status := v_lead.bayar_status; v_dp := v_lead.bayar_dp; v_tgl_dp := v_lead.tanggal_dp; v_tgl_lunas := v_lead.tanggal_lunas;
  if (p ? 'bayar_dp' or p ? 'tanggal_dp' or p ? 'tanggal_lunas') and not p ? 'bayar_status' then
    perform public.lempar('PT400', 'Data pembayaran harus dikirim bersama bayar_status', 'INPUT_001');
  end if;
  if nullif(p->>'bayar_dp', '') is not null and p->>'bayar_dp' !~ '^\d{1,15}$' then
    perform public.lempar('PT400', 'Nominal DP wajib angka bulat > 0', 'INPUT_001');
  end if;
  if p ? 'bayar_status' then
    v_status := nullif(p->>'bayar_status', '');
    if v_status is null or v_status not in ('BELUM', 'DP', 'LUNAS') then
      perform public.lempar('PT400', 'Status pembayaran harus BELUM, DP, atau LUNAS', 'INPUT_001');
    end if;
    if v_status = 'BELUM' then
      v_dp := null; v_tgl_dp := null; v_tgl_lunas := null;
    elsif v_status = 'DP' then
      v_dp := coalesce(nullif(p->>'bayar_dp', '')::bigint, case when p ? 'bayar_dp' then null else v_dp end);
      v_tgl_dp := coalesce(nullif(p->>'tanggal_dp', '')::date, v_tgl_dp, v_hari);
      v_tgl_lunas := null;
    else
      if p ? 'bayar_dp' then v_dp := nullif(p->>'bayar_dp', '')::bigint; end if;
      if p ? 'tanggal_dp' then v_tgl_dp := nullif(p->>'tanggal_dp', '')::date; end if;
      v_tgl_lunas := coalesce(nullif(p->>'tanggal_lunas', '')::date, v_tgl_lunas, v_hari);
    end if;
  end if;
  if v_status = 'DP' then
    if v_dp is null or v_dp <= 0 then perform public.lempar('PT400', 'Nominal DP wajib > 0', 'INPUT_001'); end if;
    if v_nilai is not null and v_dp >= v_nilai then
      perform public.lempar('PT400', 'Nominal DP harus lebih kecil dari nominal order (bila sudah penuh, tandai Lunas)', 'INPUT_001');
    end if;
  end if;
  if v_dp is not null and v_dp <= 0 then perform public.lempar('PT400', 'Nominal DP wajib > 0', 'INPUT_001'); end if;
  if v_status = 'LUNAS' and v_dp is not null and v_nilai is not null and v_dp >= v_nilai then
    perform public.lempar('PT400', 'Nominal DP yang tercatat harus lebih kecil dari nominal order', 'INPUT_001');
  end if;
  if v_tgl_dp > v_hari or v_tgl_lunas > v_hari then
    perform public.lempar('PT400', 'Tanggal pembayaran tidak boleh di masa depan', 'INPUT_001');
  end if;

  update public.lead set
      nilai_transaksi = v_nilai, tanggal_sp = v_tgl_sp, no_sp = v_sp, no_po = v_po,
      bayar_status = v_status, bayar_dp = v_dp, tanggal_dp = v_tgl_dp, tanggal_lunas = v_tgl_lunas,
      bayar_diubah_oleh = case when (v_status, v_dp, v_tgl_dp, v_tgl_lunas)
                                    is distinct from (v_lead.bayar_status, v_lead.bayar_dp, v_lead.tanggal_dp, v_lead.tanggal_lunas)
                               then public.aktor() else bayar_diubah_oleh end,
      bayar_diubah_pada = case when (v_status, v_dp, v_tgl_dp, v_tgl_lunas)
                                    is distinct from (v_lead.bayar_status, v_lead.bayar_dp, v_lead.tanggal_dp, v_lead.tanggal_lunas)
                               then now() else bayar_diubah_pada end
   where id = v_lead.id;

  -- catatan riwayat (lama → baru) untuk setiap isian yang berubah
  if v_nilai is distinct from v_lead.nilai_transaksi then
    v_catat := v_catat || format('Nominal %s → %s', public.pipeline_rupiah(v_lead.nilai_transaksi), public.pipeline_rupiah(v_nilai));
  end if;
  if v_tgl_sp is distinct from v_lead.tanggal_sp then
    v_catat := v_catat || format('Tanggal SP %s → %s', coalesce(to_char(v_lead.tanggal_sp, 'DD-MM-YYYY'), '—'), to_char(v_tgl_sp, 'DD-MM-YYYY'));
  end if;
  if v_sp is distinct from v_lead.no_sp then
    v_catat := v_catat || format('No SP %s → %s', coalesce(v_lead.no_sp, '—'), v_sp);
  end if;
  if v_po is distinct from v_lead.no_po then
    v_catat := v_catat || format('No PO %s → %s', coalesce(v_lead.no_po, '—'), coalesce(v_po, '—'));
  end if;
  if (v_status, v_dp, v_tgl_dp, v_tgl_lunas) is distinct from (v_lead.bayar_status, v_lead.bayar_dp, v_lead.tanggal_dp, v_lead.tanggal_lunas) then
    v_catat := v_catat || format('Pembayaran %s → %s',
      public.pipeline_bayar_teks(v_lead.bayar_status, v_lead.bayar_dp, v_lead.tanggal_dp, v_lead.tanggal_lunas),
      public.pipeline_bayar_teks(v_status, v_dp, v_tgl_dp, v_tgl_lunas));
  end if;
  if cardinality(v_catat) > 0 then
    -- rencana_berikutnya dipertahankan: trigger aktivitas menyalinnya ke lead.fu_berikutnya
    insert into public.lead_aktivitas (lead_id, oleh, jenis, hasil, rencana_berikutnya)
    values (v_lead.id, public.aktor(), 'Catatan', 'Data order diubah: ' || array_to_string(v_catat, '; '), v_lead.fu_berikutnya);
  end if;

  return public.j_pipeline_lead(v_lead.id, false);
exception when unique_violation then
  perform public.lempar('PT409', format('No SP sudah dipakai lead lain: %s', v_sp), 'KONFLIK_001');
end; $$;

create or replace function public.web_pipeline_order_ubah(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_order_ubah(p); end; $$;

-- ============================================================ hak (fail-closed, pola 20261013121000)
revoke all on function
  public.pipeline_lead_bayar_awal(), public.inti_pipeline_order_ubah(jsonb), public.web_pipeline_order_ubah(jsonb),
  public.pipeline_rupiah(bigint), public.pipeline_bayar_teks(text, bigint, date, date)
from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_order_ubah(jsonb) to authenticated;
