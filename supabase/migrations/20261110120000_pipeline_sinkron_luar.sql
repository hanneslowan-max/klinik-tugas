-- Sinkron dari luar Anvil: SP ERP → ORDER, chat WA 0878 → lead otomatis (keputusan Hannes 10 Nov 2026 di sesi rhj-brain,
-- LOG-PAGAR "Sinkron SP ERP → Anvil + lead otomatis dari WA": "biar mereka ga kerja 2 kali"). PR ini = PINTU-nya; yang
-- menjalankan sinkron = agent/routine rhj-brain lewat token app (scope tulis, role bot) yang memanggil Edge `api`.
-- Routine BELUM dinyalakan: nomor SP di ERP-dev sedang dibetulkan Hannes (LOG-PAGAR 10 Nov); sidik memuat no_sp, jadi SP
-- yang nomornya dibetulkan sesudah tertaut ikut diperbarui.
--
-- ALUR
--   (A) Routine membaca ERP-dev (sales_orders / sales_order_lines / customers, BACA SAJA) dan mengirim satu baris per SP
--       ke POST /x/pipeline/order-erp → x_pipeline_order_erp. SP dihitung ORDER saat SP DIBUAT (bukan saat disetujui);
--       SP batal di ERP → order batal di Anvil; nomor SP Anvil = nomor ERP. Hanya SP tim online (kode SP di
--       pipeline_akses.kode_sp: RSG = Riksa, MCE = Michael); SP sales lain → 'dilewati_bukan_online' tanpa menulis.
--   (B) Routine memilah chat WA 0878 (agent penilai: hanya CALON PEMBELI; pemasok/ekspedisi/spam dilewati) dan mengirim
--       POST /x/pipeline/lead-otomatis → x_pipeline_lead_otomatis. Nomor yang sudah punya lead TERBUKA (BARU/PENAWARAN)
--       tidak dibuatkan lead lagi. Pemilik ditebak agent dari nama sales di balasan; tidak ketemu → bergiliran.
--   (C) Audit: GET /x/pipeline/tautan?jenis=&sejak=&batas= → x_pipeline_tautan.
--
-- KUNCI LUAR (idempoten; tabel pipeline_tautan_luar)
--   erp-sp:<so_id>                  satu SP ERP (so_id = id baris sales_orders; huruf/angka/_/-, ≤ 64). Satu SP ↔ satu lead,
--                                   dan satu lead ↔ paling banyak satu SP ERP (indeks unik parsial).
--   wa:<kode chat>:<YYYY-MM-DD>     satu chat WA per hari WIB. Kode chat = K-xxxxxx rhj-brain (HMAC nomor, tanpa nomor),
--                                   pola K-[0-9A-Za-z]{4,16}. Chat yang sama besoknya = kunci baru → dicek ulang ke lead
--                                   terbuka (dapat catatan "Chat WA baru <tgl>") atau dibuatkan lead baru bila lead lama
--                                   sudah tertutup.
--   sidik = md5 isi yang menentukan tulisan (ERP: no_sp, tanggal_sp, nilai, no_po, batal). Sidik sama = tidak dibaca ulang
--   ke lead (status 'tidak_berubah'); beda = dibandingkan dengan lead lalu hanya kolom yang berbeda yang diubah.
--
-- MENULIS LEWAT JALUR YANG SUDAH ADA (aturan & jejak sama dengan sales di web):
--   inti_pipeline_lead_buat (lead + pelanggan + kontak + produk), inti_pipeline_tahap aksi 'order' / 'batal_order',
--   inti_pipeline_order_ubah (nominal, tanggal SP, No SP, No PO; catatan "Data order diubah: …" dibuat fungsi itu),
--   inti_pipeline_sumber_bukti_set (bukti sumber lead WA). Tambahan langsung di sini hanya: pemilik lead ERP (= sales SP,
--   tercatat lead_riwayat_pemilik lewat trigger), no_po saat order pertama, dan satu aktivitas "SP … dari ERP
--   (otomatis)" / "Lead otomatis dari WA 0878 (agent) …" / "Chat WA baru <tgl> (agent)".
--
-- HAK: hanya aktor ber-peran Pipeline 'admin' (owner, bot routine, admin), token scope tulis (baca untuk tautan). Tabel
-- tautan RLS ON tanpa hak tabel untuk role API. ADITIF: tabel + fungsi baru; tidak ada UPDATE/DELETE data lama.
-- PRIVASI: tautan tidak menyimpan nomor/nama (kunci WA = kode HMAC); HP & nama pelanggan disimpan di lead/kontak seperti
-- isian sales selama ini. Fungsi tidak menulis log berisi HP.

-- ============================================================ tabel tautan
create table public.pipeline_tautan_luar (
  kunci_luar  text primary key,
  jenis       text not null,
  lead_id     text not null references public.lead (id) on delete cascade,
  sidik       text not null,
  cara        text not null,          -- bagaimana lead dipilih saat tautan dibuat
  hasil_akhir text not null,          -- status tulisan terakhir
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now(),
  constraint pipeline_tautan_jenis_sah check (jenis in ('erp_sp', 'wa')),
  constraint pipeline_tautan_kunci_pola check (
    (jenis = 'erp_sp' and kunci_luar ~ '^erp-sp:[A-Za-z0-9_-]{1,64}$')
    or (jenis = 'wa' and kunci_luar ~ '^wa:K-[0-9A-Za-z]{4,16}:\d{4}-\d{2}-\d{2}$')),
  constraint pipeline_tautan_sidik_pola check (sidik ~ '^[0-9a-f]{32}$'),
  -- no_sp = lead ber-No SP sama; hp = lead terbuka bernomor sama; baru = lead dibuat; hp_terbuka = (WA) lead terbuka ada
  constraint pipeline_tautan_cara_sah check (cara in ('no_sp', 'hp', 'baru', 'hp_terbuka')),
  constraint pipeline_tautan_hasil_sah check (hasil_akhir in ('dibuat', 'diperbarui', 'tidak_berubah', 'lead_terbuka_ada'))
);
comment on table public.pipeline_tautan_luar is
  'Tautan idempoten data luar (SP ERP erp-sp:<so_id>, chat WA wa:<K-kode>:<tgl>) ↔ lead. Ditulis hanya lewat '
  'x_pipeline_order_erp / x_pipeline_lead_otomatis. Tanpa nomor/nama pelanggan.';

create unique index pipeline_tautan_luar_erp_lead_uniq on public.pipeline_tautan_luar (lead_id) where jenis = 'erp_sp';
create index pipeline_tautan_luar_lead_idx on public.pipeline_tautan_luar (lead_id);
create index pipeline_tautan_luar_diubah_idx on public.pipeline_tautan_luar (diubah_pada);

alter table public.pipeline_tautan_luar enable row level security;
revoke all on public.pipeline_tautan_luar from public, anon, authenticated, service_role;

-- ============================================================ pembantu validasi
-- Nilai sah (cermin CHECK lead.sumber / lead_item.produk; CHECK tetap penjaga terakhir).
create or replace function public.pipeline_sumber_sah()
returns text[] language sql immutable set search_path = '' as $$
  select array['Google Ads', 'Meta Ads', 'Website organik', 'Instagram/TikTok organik', 'WA langsung', 'Telepon',
               'Referral', 'Repeat order', 'Lainnya']::text[]
$$;
create or replace function public.pipeline_produk_sah()
returns text[] language sql immutable set search_path = '' as $$
  select array['Roda', 'Pallet Mesh', 'Airport Trolley', 'Shopping Cart', 'Lemari Arsip', 'Material Handling',
               'Locker', 'Lainnya']::text[]
$$;
-- Nama produk tanpa peka huruf besar/kecil → bentuk baku, atau null bila bukan kategori PRODUK.
create or replace function public.pipeline_produk_baku(p text)
returns text language sql immutable set search_path = '' as $$
  select x from unnest(public.pipeline_produk_sah()) x where lower(x) = lower(btrim(coalesce(p, ''))) limit 1
$$;

-- Kunci objek yang tidak dikenal → PT400 (salah ketik tidak boleh diam-diam diabaikan).
create or replace function public.pipeline_luar_kunci(p jsonb, p_sah text[], p_ref text)
returns void language plpgsql immutable set search_path = '' as $$
declare v_k text;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    perform public.lempar('PT400', format('%s harus objek JSON', p_ref), 'INPUT_001');
  end if;
  select k into v_k from jsonb_object_keys(p) k where not (k = any (p_sah)) order by k limit 1;
  if v_k is not null then
    perform public.lempar('PT400', format('%s: kunci tidak dikenal: %s (yang sah: %s)', p_ref, v_k, array_to_string(p_sah, ', ')), 'INPUT_001');
  end if;
end; $$;

-- Teks opsional: null/absen → null; bukan teks → PT400; spasi dirapikan; > p_maks karakter → PT400.
create or replace function public.pipeline_luar_teks(p jsonb, p_k text, p_maks int)
returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  if not p ? p_k or jsonb_typeof(p -> p_k) = 'null' then return null; end if;
  if jsonb_typeof(p -> p_k) <> 'string' then
    perform public.lempar('PT400', format('%s harus teks', p_k), 'INPUT_001');
  end if;
  v := nullif(btrim(regexp_replace(p ->> p_k, '\s+', ' ', 'g')), '');
  if char_length(v) > p_maks then
    perform public.lempar('PT400', format('%s maksimal %s karakter', p_k, p_maks), 'INPUT_001');
  end if;
  return v;
end; $$;

-- Nomor HP → bentuk 62… (pipeline_telp_norm, sama dengan kontak.telepon & cek dobel web); wajib 8–15 digit.
create or replace function public.pipeline_luar_hp(p jsonb, p_wajib boolean)
returns text language plpgsql immutable set search_path = '' as $$
declare v_raw text := public.pipeline_luar_teks(p, 'hp', 40); v text;
begin
  if v_raw is null then
    if p_wajib then perform public.lempar('PT400', 'hp wajib', 'INPUT_001'); end if;
    return null;
  end if;
  v := public.pipeline_telp_norm(v_raw);
  if v is null or v !~ '^\d{8,15}$' then
    perform public.lempar('PT400', 'hp tidak sah (8–15 digit sesudah dinormalisasi ke 62…)', 'INPUT_001');
  end if;
  return v;
end; $$;

-- Pemilik lead SP ERP: kode SP di no_sp (NNN/RSG/XI/2026) → anggota pipeline_akses ber-kode itu; kode tanpa pemilik
-- online → null (SP sales lain). Tanpa kode yang terbaca (no_sp tidak berpola) → cocokkan nama sales dengan username/nama
-- anggota ber-kode SP (utuh atau kata pertama); harus tepat satu.
create or replace function public.pipeline_sales_dari_sp(p_no_sp text, p_sales text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare v_kode text := substring(coalesce(p_no_sp, '') from '^\d+/([A-Za-z]+)/'); v_nama text; v_ids bigint[];
begin
  if v_kode is not null then
    return (select pa.member_id from public.pipeline_akses pa
             where upper(pa.kode_sp) = upper(v_kode) and public.pipeline_sales_sah(pa.member_id)
             order by pa.member_id limit 1);
  end if;
  v_nama := lower(btrim(coalesce(p_sales, '')));
  if v_nama = '' then return null; end if;
  select array_agg(pa.member_id) into v_ids
    from public.pipeline_akses pa join public.members m on m.id = pa.member_id
   where pa.kode_sp is not null and public.pipeline_sales_sah(pa.member_id)
     and v_nama in (lower(m.username), lower(coalesce(m.nama, '')), split_part(lower(m.username), ' ', 1),
                    split_part(lower(coalesce(m.nama, '')), ' ', 1));
  return case when cardinality(v_ids) = 1 then v_ids[1] end;
end; $$;

-- ============================================================ SP ERP → ORDER (satu SP)
-- Terapkan keadaan SP ke lead (dipakai tautan pertama & pembaruan). Hasil 'diperbarui' | 'tidak_berubah'.
--   * lead BATAL karena "Order dibatalkan" (final di Anvil): SP batal → tidak_berubah; SP aktif → PT409 (periksa manual).
--   * SP batal + lead ORDER → inti_pipeline_tahap 'batal_order' (alasan "SP … dibatalkan di ERP (sinkron otomatis)").
--     SP batal + lead belum ORDER → tidak_berubah (tidak ada order yang dibatalkan).
--   * lead ORDER → inti_pipeline_order_ubah hanya untuk kolom yang berbeda (nilai, tanggal SP, No SP, No PO bila ERP
--     mengisinya); tidak ada yang berbeda → tidak_berubah.
--   * lead belum ORDER → pemilik = sales SP (bila berbeda), inti_pipeline_tahap 'order', No PO, aktivitas "SP … dari ERP".
create or replace function public.pipeline_erp_terapkan(
  p_lead_id text, p_sp text, p_tgl date, p_nilai bigint, p_po text, p_batal boolean, p_member bigint, p_cara text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_lead public.lead; v_ubah jsonb := '{}'::jsonb; v_ket text;
begin
  select * into v_lead from public.lead where id = p_lead_id for update;
  if not found then perform public.lempar('PT404', 'Lead tidak ditemukan', 'ITEM_013'); end if;

  if v_lead.tahap = 'BATAL' and v_lead.alasan_batal = 'Order dibatalkan' then
    if p_batal then return 'tidak_berubah'; end if;
    perform public.lempar('PT409', format('Order %s sudah dibatalkan di Anvil (final), tetapi SP %s di ERP aktif: periksa manual',
      v_lead.kode, p_sp), 'KONFLIK_001');
  end if;

  if p_batal then
    if v_lead.tahap <> 'ORDER' then return 'tidak_berubah'; end if;
    perform public.inti_pipeline_tahap(jsonb_build_object('lead_id', v_lead.id, 'aksi', 'batal_order',
      'alasan', format('SP %s dibatalkan di ERP (sinkron otomatis)', coalesce(v_lead.no_sp, p_sp))));
    return 'diperbarui';
  end if;

  if v_lead.tahap = 'ORDER' then
    if v_lead.nilai_transaksi is distinct from p_nilai then v_ubah := v_ubah || jsonb_build_object('nilai_transaksi', p_nilai); end if;
    if v_lead.tanggal_sp is distinct from p_tgl then v_ubah := v_ubah || jsonb_build_object('tanggal_sp', p_tgl); end if;
    if v_lead.no_sp is distinct from p_sp then v_ubah := v_ubah || jsonb_build_object('no_sp', p_sp); end if;
    if p_po is not null and v_lead.no_po is distinct from p_po then v_ubah := v_ubah || jsonb_build_object('no_po', p_po); end if;
    if v_ubah = '{}'::jsonb then return 'tidak_berubah'; end if;
    perform public.inti_pipeline_order_ubah(v_ubah || jsonb_build_object('lead_id', v_lead.id));
    return 'diperbarui';
  end if;

  if p_member is not null and v_lead.pemilik is distinct from p_member then
    update public.lead set pemilik = p_member where id = v_lead.id;
  end if;
  perform public.inti_pipeline_tahap(jsonb_build_object('lead_id', v_lead.id, 'aksi', 'order',
    'no_sp', p_sp, 'tanggal_sp', p_tgl, 'nilai_transaksi', p_nilai));
  if p_po is not null then update public.lead set no_po = p_po where id = v_lead.id; end if;
  v_ket := case p_cara
    when 'no_sp' then 'No SP sudah ada di lead ini'
    when 'hp' then 'dicocokkan dengan lead terbuka bernomor WA sama'
    else 'lead dibuat otomatis karena belum ada lead untuk nomor ini' end;
  -- rencana FU dipertahankan (pola inti_pipeline_order_ubah): trigger aktivitas menyalinnya ke lead.fu_berikutnya
  insert into public.lead_aktivitas (lead_id, oleh, jenis, hasil, rencana_berikutnya)
  values (v_lead.id, public.aktor(), 'Catatan',
          format('SP %s dari ERP (otomatis): %s, tanggal SP %s; %s', p_sp, public.pipeline_rupiah(p_nilai),
                 to_char(p_tgl, 'DD-MM-YYYY'), v_ket),
          (select l.fu_berikutnya from public.lead l where l.id = v_lead.id));
  return 'diperbarui';
end; $$;

-- p = {erp_so_id, no_sp, tanggal_sp, nilai, batal?, no_po?, sales?, pelanggan?, hp?, kota?, items?, produk?}
--   * erp_so_id (wajib): teks/angka [A-Za-z0-9_-]{1,64} → kunci 'erp-sp:<erp_so_id>'.
--   * no_sp (wajib): spasi dibuang, huruf besar; harus NNN/(RSG|MCE)/ROMAWI/20YY untuk SP tim online.
--   * tanggal_sp (wajib): YYYY-MM-DD (awalan 10 karakter dari waktu ISO diterima), tidak di masa depan (WIB).
--   * nilai (wajib): angka ≥ 0 (dibulatkan ke rupiah); SP aktif wajib > 0 (aturan ORDER).
--   * batal: boolean (default false). no_po: teks ≤ 60 (kosong = tidak mengubah No PO di Anvil).
--   * sales: nama sales ERP (dipakai bila kode SP di no_sp tidak terbaca). pelanggan ≤ 200, kota ≤ 100, hp (62…).
--   * items: [{deskripsi?, qty?, jenis?, produk?}] ≤ 200 — HANYA dipakai bila lead baru dibuat: produk = item.produk /
--     item.jenis bila kategori PRODUK, selain itu `produk` atas (bila tepat satu), selain itu 'Lainnya'; qty per produk
--     dijumlah (qty kosong/≤ 0 dilewati); spesifikasi = deskripsi digabung (≤ 500).
--   * produk: kategori PRODUK (teks atau array teks), opsional.
-- Hasil {status, lead_id, kode, cara?}: status 'dibuat' | 'diperbarui' | 'tidak_berubah' | 'dilewati_bukan_online' |
-- 'dilewati_batal' (SP batal yang belum pernah tertaut dan tidak ada lead ber-No SP itu → tidak ditulis).
create or replace function public.inti_pipeline_order_erp(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_so text; v_kunci text; v_sp text; v_tgl date; v_teks text; v_nilai bigint; v_batal boolean; v_po text;
  v_sales text; v_pel text; v_kota text; v_telp text; v_hp_raw text;
  v_produk text[] := '{}'; v_x jsonb; v_p text; v_qty numeric;
  v_member bigint; v_sidik text; v_t public.pipeline_tautan_luar; v_lead_id text; v_cara text; v_status text;
  v_pel_id text; v_items jsonb; v_baru jsonb; v_i int := -1;
begin
  if coalesce(public.pipeline_peran_aktor(), '') <> 'admin' then
    perform public.lempar('PT403', 'Sinkron SP ERP hanya untuk agent atau admin Pipeline', 'ACCESS_001');
  end if;
  perform public.pipeline_luar_kunci(p, array['erp_so_id', 'no_sp', 'tanggal_sp', 'nilai', 'batal', 'no_po', 'sales',
    'pelanggan', 'hp', 'kota', 'items', 'produk'], 'SP ERP');

  -- id SP ERP
  if coalesce(jsonb_typeof(p -> 'erp_so_id'), '') not in ('string', 'number') then
    perform public.lempar('PT400', 'erp_so_id wajib (teks atau angka)', 'INPUT_001');
  end if;
  v_so := btrim(p ->> 'erp_so_id');
  if coalesce(v_so, '') !~ '^[A-Za-z0-9_-]{1,64}$' then
    perform public.lempar('PT400', 'erp_so_id tidak sah (huruf/angka/_/-, 1–64 karakter)', 'INPUT_001');
  end if;
  v_kunci := 'erp-sp:' || v_so;

  -- No SP
  v_sp := upper(regexp_replace(coalesce(public.pipeline_luar_teks(p, 'no_sp', 60), ''), '\s+', '', 'g'));
  if v_sp = '' then perform public.lempar('PT400', 'no_sp wajib', 'INPUT_001'); end if;

  -- tanggal SP
  v_teks := public.pipeline_luar_teks(p, 'tanggal_sp', 40);
  if v_teks is null or v_teks !~ '^\d{4}-\d{2}-\d{2}' then
    perform public.lempar('PT400', 'tanggal_sp wajib (YYYY-MM-DD)', 'INPUT_001');
  end if;
  begin
    v_tgl := left(v_teks, 10)::date;
  exception when others then
    perform public.lempar('PT400', 'tanggal_sp tidak valid', 'INPUT_001');
  end;
  if v_tgl > public.hari_ini_wib() then perform public.lempar('PT400', 'tanggal_sp tidak boleh di masa depan', 'INPUT_001'); end if;

  -- nilai
  if coalesce(jsonb_typeof(p -> 'nilai'), '') not in ('number', 'string') or coalesce(p ->> 'nilai', '') !~ '^\d{1,15}(\.\d+)?$' then
    perform public.lempar('PT400', 'nilai wajib (angka rupiah ≥ 0)', 'INPUT_001');
  end if;
  v_nilai := round((p ->> 'nilai')::numeric)::bigint;

  -- batal
  if jsonb_typeof(p -> 'batal') not in ('boolean', 'null') then perform public.lempar('PT400', 'batal harus true/false', 'INPUT_001'); end if;
  v_batal := coalesce((p ->> 'batal')::boolean, false);
  if not v_batal and v_nilai <= 0 then perform public.lempar('PT400', 'nilai wajib > 0 untuk SP aktif', 'INPUT_001'); end if;

  v_po := public.pipeline_luar_teks(p, 'no_po', 60);
  v_sales := public.pipeline_luar_teks(p, 'sales', 100);
  v_pel := public.pipeline_luar_teks(p, 'pelanggan', 200);
  v_kota := public.pipeline_luar_teks(p, 'kota', 100);
  v_hp_raw := public.pipeline_luar_teks(p, 'hp', 40);
  v_telp := public.pipeline_luar_hp(p, false);

  -- produk atas
  if jsonb_typeof(p -> 'produk') = 'string' then
    v_x := jsonb_build_array(p -> 'produk');
  elsif jsonb_typeof(p -> 'produk') = 'array' then
    v_x := p -> 'produk';
  elsif jsonb_typeof(p -> 'produk') is not null and jsonb_typeof(p -> 'produk') <> 'null' then
    perform public.lempar('PT400', 'produk harus teks atau array teks', 'INPUT_001');
  end if;
  if v_x is not null then
    for v_p in select x from jsonb_array_elements_text(v_x) x loop
      if public.pipeline_produk_baku(v_p) is null then
        perform public.lempar('PT400', format('produk tidak dikenal: "%s" (yang sah: %s)', v_p,
          array_to_string(public.pipeline_produk_sah(), ', ')), 'INPUT_001');
      end if;
      if not public.pipeline_produk_baku(v_p) = any (v_produk) then v_produk := v_produk || public.pipeline_produk_baku(v_p); end if;
    end loop;
  end if;

  -- items (validasi selalu; dipakai hanya untuk lead baru)
  if jsonb_typeof(p -> 'items') is not null and jsonb_typeof(p -> 'items') not in ('array', 'null') then
    perform public.lempar('PT400', 'items harus array', 'INPUT_001');
  end if;
  if jsonb_typeof(p -> 'items') = 'array' then
    if jsonb_array_length(p -> 'items') > 200 then perform public.lempar('PT400', 'items maksimal 200 baris', 'INPUT_001'); end if;
    for v_x in select * from jsonb_array_elements(p -> 'items') loop
      v_i := v_i + 1;
      perform public.pipeline_luar_kunci(v_x, array['deskripsi', 'qty', 'jenis', 'produk'], format('items[%s]', v_i));
      perform public.pipeline_luar_teks(v_x, 'deskripsi', 300);
      perform public.pipeline_luar_teks(v_x, 'jenis', 100);
      perform public.pipeline_luar_teks(v_x, 'produk', 100);
      if jsonb_typeof(v_x -> 'qty') not in ('number', 'string', 'null') or (nullif(v_x ->> 'qty', '') is not null
         and v_x ->> 'qty' !~ '^-?\d{1,12}(\.\d+)?$') then
        perform public.lempar('PT400', format('items[%s]: qty harus angka', v_i), 'INPUT_001');
      end if;
    end loop;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_kunci, 0));
  v_sidik := md5(jsonb_build_object('no_sp', v_sp, 'tanggal_sp', v_tgl, 'nilai', v_nilai, 'no_po', v_po, 'batal', v_batal)::text);

  -- sudah tertaut → perbarui hanya bila sidik berubah
  select * into v_t from public.pipeline_tautan_luar t where t.kunci_luar = v_kunci for update;
  if found then
    if v_t.sidik = v_sidik then
      v_status := 'tidak_berubah';
    else
      v_status := public.pipeline_erp_terapkan(v_t.lead_id, v_sp, v_tgl, v_nilai, v_po, v_batal,
                                               public.pipeline_sales_dari_sp(v_sp, v_sales), v_t.cara);
      update public.pipeline_tautan_luar set sidik = v_sidik, hasil_akhir = v_status, diubah_pada = now()
       where kunci_luar = v_kunci;
    end if;
    return jsonb_build_object('status', v_status, 'lead_id', v_t.lead_id, 'cara', v_t.cara,
      'kode', (select l.kode from public.lead l where l.id = v_t.lead_id));
  end if;

  -- belum tertaut: hanya SP tim online
  v_member := public.pipeline_sales_dari_sp(v_sp, v_sales);
  if v_member is null then
    return jsonb_build_object('status', 'dilewati_bukan_online', 'lead_id', null, 'kode', null);
  end if;
  if v_sp !~ '^\d+/(RSG|MCE)/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/20\d\d$' then
    perform public.lempar('PT400', format('No SP tidak sesuai pola: %s', v_sp), 'INPUT_001');
  end if;

  -- (a) lead ber-No SP sama (sales sudah mengisinya di Anvil)
  select l.id into v_lead_id from public.lead l where l.no_sp = v_sp
   order by l.periksa, l.dibuat_pada desc, l.id limit 1;
  if v_lead_id is not null then
    v_cara := 'no_sp';
    if exists (select 1 from public.pipeline_tautan_luar t where t.lead_id = v_lead_id and t.jenis = 'erp_sp') then
      perform public.lempar('PT409', format('No SP %s sudah tertaut ke SP ERP lain', v_sp), 'KONFLIK_001');
    end if;
  elsif v_batal then
    return jsonb_build_object('status', 'dilewati_batal', 'lead_id', null, 'kode', null);
  else
    -- (b) lead TERBUKA bernomor sama: utamakan milik sales SP, lalu yang terbaru
    if v_telp is not null then
      select l.id into v_lead_id
        from public.lead l join public.kontak k on k.id = l.kontak_id
       where k.telepon = v_telp and l.tahap in ('BARU', 'PENAWARAN')
       order by (l.pemilik is not distinct from v_member) desc, l.tanggal_masuk desc, l.dibuat_pada desc, l.id desc
       limit 1;
    end if;
    if v_lead_id is not null then
      v_cara := 'hp';
    else
      -- (c) lead baru: pelanggan lama bernomor sama dipakai ulang; sumber Repeat order bila nomor pernah ORDER
      v_cara := 'baru';
      if v_telp is not null then
        select k.pelanggan_id into v_pel_id from public.kontak k where k.telepon = v_telp
         order by k.dibuat_pada desc, k.id desc limit 1;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('produk', g.produk, 'qty', g.qty, 'satuan', 'unit',
               'spesifikasi', nullif(left(g.spes, 500), '')) order by g.urut), '[]'::jsonb)
        into v_items
        from (select b.produk, sum(b.qty) as qty, min(b.n) as urut,
                     string_agg(b.deskripsi, '; ' order by b.n) as spes
                from (select e.n,
                             coalesce(public.pipeline_produk_baku(e.v ->> 'produk'), public.pipeline_produk_baku(e.v ->> 'jenis'),
                                      case when cardinality(v_produk) = 1 then v_produk[1] end, 'Lainnya') as produk,
                             nullif(e.v ->> 'qty', '')::numeric as qty,
                             nullif(btrim(regexp_replace(coalesce(e.v ->> 'deskripsi', ''), '\s+', ' ', 'g')), '') as deskripsi
                        from jsonb_array_elements(coalesce(case when jsonb_typeof(p -> 'items') = 'array' then p -> 'items' end,
                                                           '[]'::jsonb)) with ordinality e (v, n)) b
               where b.qty > 0
               group by b.produk) g;
      if v_items = '[]'::jsonb then
        v_items := jsonb_build_array(jsonb_build_object('produk', coalesce(v_produk[1], 'Lainnya'), 'qty', 1, 'satuan', 'unit',
          'spesifikasi', format('Dari SP ERP %s (rincian barang tidak terkirim)', v_sp)));
      end if;
      v_baru := public.inti_pipeline_lead_buat(jsonb_strip_nulls(jsonb_build_object(
        'sumber', case when v_telp is not null and exists (
                         select 1 from public.lead l join public.kontak k on k.id = l.kontak_id
                          where k.telepon = v_telp and l.tahap = 'ORDER') then 'Repeat order' else 'Lainnya' end,
        'pemilik', v_member, 'tanggal_masuk', v_tgl, 'konfirmasi', true,
        'pelanggan_id', v_pel_id,
        'pelanggan', case when v_pel_id is null then jsonb_build_object('nama', coalesce(v_pel, '-'), 'kota', v_kota) end,
        'kontak', case when v_telp is not null then jsonb_build_object('telepon', v_hp_raw) end,
        'items', v_items)));
      v_lead_id := v_baru ->> 'id';
    end if;
  end if;

  v_status := public.pipeline_erp_terapkan(v_lead_id, v_sp, v_tgl, v_nilai, v_po, v_batal, v_member, v_cara);
  if v_cara = 'baru' then v_status := 'dibuat'; end if;
  insert into public.pipeline_tautan_luar (kunci_luar, jenis, lead_id, sidik, cara, hasil_akhir)
  values (v_kunci, 'erp_sp', v_lead_id, v_sidik, v_cara, v_status);
  return jsonb_build_object('status', v_status, 'lead_id', v_lead_id, 'cara', v_cara,
    'kode', (select l.kode from public.lead l where l.id = v_lead_id));
end; $$;

-- ============================================================ chat WA → lead otomatis (satu chat)
-- p = {kunci_luar, hp, sumber, pelanggan?, kontak_nama?, kota?, produk?, kebutuhan?, catatan?, sumber_bukti?,
--      sumber_bukti_kode?, chat_pada?, pemilik?, alasan_pemilik?}
--   * kunci_luar (wajib): 'wa:K-<kode chat>:<YYYY-MM-DD>' (tanggal WIB chat, tidak di masa depan) = tanggal masuk lead.
--   * hp (wajib) → 62… (8–15 digit). pelanggan ≤ 200 (kosong → "-"), kontak_nama ≤ 100, kota ≤ 100.
--   * produk: [{produk (kategori PRODUK), qty?, satuan? unit|set|pcs, spesifikasi? ≤ 300}] ≤ 10; kosong → Lainnya.
--     qty kosong → 1 dengan spesifikasi diawali "(qty belum pasti)".
--   * kebutuhan ≤ 500, catatan ≤ 1000. sumber (wajib) = nilai SUMBER sah.
--   * sumber_bukti / sumber_bukti_kode / chat_pada → x_pipeline_sumber_bukti_set (aturan kelas & kode sama).
--   * pemilik: id anggota sales sah (pipeline_sales_sah) atau null; alasan_pemilik 'balasan' | 'giliran' |
--     'pelanggan_lama' (wajib bila pemilik diisi).
-- Aturan: kunci sudah tertaut → 'sudah_ada' (tidak menulis). Nomor punya lead TERBUKA (BARU/PENAWARAN, terbaru) → tidak
-- membuat lead; aktivitas WA "Chat WA baru <DD-MM-YYYY> (agent)" bila belum ada untuk tanggal itu; tautan dicatat →
-- 'lead_terbuka_ada'. Selain itu lead dibuat (pelanggan lama bernomor sama dipakai ulang) → 'dibuat'.
-- Hasil {status, lead_id, kode, pemilik, aktivitas_baru?}.
create or replace function public.inti_pipeline_lead_otomatis(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_kunci text; v_tgl date; v_telp text; v_hp_raw text; v_sumber text; v_pel text; v_kontak text; v_kota text;
  v_keb text; v_cat text; v_bukti text; v_bkode text; v_chat text; v_pemilik bigint; v_alasan text;
  v_items jsonb := '[]'::jsonb; v_x jsonb; v_i int := -1; v_prod text; v_sat text; v_spes text; v_qty numeric;
  v_t public.pipeline_tautan_luar; v_lead_id text; v_pel_id text; v_baru jsonb; v_hasil text; v_akt boolean := false;
  v_sidik text; v_label text;
begin
  if coalesce(public.pipeline_peran_aktor(), '') <> 'admin' then
    perform public.lempar('PT403', 'Lead otomatis hanya untuk agent atau admin Pipeline', 'ACCESS_001');
  end if;
  perform public.pipeline_luar_kunci(p, array['kunci_luar', 'hp', 'sumber', 'pelanggan', 'kontak_nama', 'kota', 'produk',
    'kebutuhan', 'catatan', 'sumber_bukti', 'sumber_bukti_kode', 'chat_pada', 'pemilik', 'alasan_pemilik'], 'Lead WA');

  v_kunci := public.pipeline_luar_teks(p, 'kunci_luar', 60);
  if v_kunci is null or v_kunci !~ '^wa:K-[0-9A-Za-z]{4,16}:\d{4}-\d{2}-\d{2}$' then
    perform public.lempar('PT400', 'kunci_luar wajib berformat wa:K-xxxxxx:YYYY-MM-DD', 'INPUT_001');
  end if;
  begin
    v_tgl := right(v_kunci, 10)::date;
  exception when others then
    perform public.lempar('PT400', 'tanggal di kunci_luar tidak valid', 'INPUT_001');
  end;
  if v_tgl > public.hari_ini_wib() then perform public.lempar('PT400', 'tanggal di kunci_luar tidak boleh di masa depan', 'INPUT_001'); end if;

  perform pg_advisory_xact_lock(hashtextextended(v_kunci, 0));
  select * into v_t from public.pipeline_tautan_luar t where t.kunci_luar = v_kunci;
  if found then
    return jsonb_build_object('status', 'sudah_ada', 'lead_id', v_t.lead_id,
      'kode', (select l.kode from public.lead l where l.id = v_t.lead_id),
      'pemilik', (select l.pemilik from public.lead l where l.id = v_t.lead_id));
  end if;

  v_hp_raw := public.pipeline_luar_teks(p, 'hp', 40);
  v_telp := public.pipeline_luar_hp(p, true);
  v_sumber := public.pipeline_luar_teks(p, 'sumber', 40);
  if v_sumber is null or not (v_sumber = any (public.pipeline_sumber_sah())) then
    perform public.lempar('PT400', format('sumber wajib, salah satu dari: %s', array_to_string(public.pipeline_sumber_sah(), ', ')), 'INPUT_001');
  end if;
  v_pel := public.pipeline_luar_teks(p, 'pelanggan', 200);
  v_kontak := public.pipeline_luar_teks(p, 'kontak_nama', 100);
  v_kota := public.pipeline_luar_teks(p, 'kota', 100);
  v_keb := public.pipeline_luar_teks(p, 'kebutuhan', 500);
  v_cat := public.pipeline_luar_teks(p, 'catatan', 1000);
  v_bukti := public.pipeline_luar_teks(p, 'sumber_bukti', 40);
  v_bkode := public.pipeline_luar_teks(p, 'sumber_bukti_kode', 40);
  v_chat := public.pipeline_luar_teks(p, 'chat_pada', 40);
  if v_bukti is null and (v_bkode is not null or v_chat is not null) then
    perform public.lempar('PT400', 'sumber_bukti_kode / chat_pada hanya bersama sumber_bukti', 'INPUT_001');
  end if;

  -- produk
  if jsonb_typeof(p -> 'produk') is not null and jsonb_typeof(p -> 'produk') not in ('array', 'null') then
    perform public.lempar('PT400', 'produk harus array [{produk, qty?, satuan?, spesifikasi?}]', 'INPUT_001');
  end if;
  if jsonb_typeof(p -> 'produk') = 'array' then
    if jsonb_array_length(p -> 'produk') > 10 then perform public.lempar('PT400', 'produk maksimal 10', 'INPUT_001'); end if;
    for v_x in select * from jsonb_array_elements(p -> 'produk') loop
      v_i := v_i + 1;
      perform public.pipeline_luar_kunci(v_x, array['produk', 'qty', 'satuan', 'spesifikasi'], format('produk[%s]', v_i));
      v_prod := public.pipeline_produk_baku(public.pipeline_luar_teks(v_x, 'produk', 100));
      if v_prod is null then
        perform public.lempar('PT400', format('produk[%s]: produk wajib salah satu dari: %s', v_i,
          array_to_string(public.pipeline_produk_sah(), ', ')), 'INPUT_001');
      end if;
      if jsonb_typeof(v_x -> 'qty') not in ('number', 'string', 'null') or (nullif(v_x ->> 'qty', '') is not null
         and v_x ->> 'qty' !~ '^\d{1,9}(\.\d+)?$') then
        perform public.lempar('PT400', format('produk[%s]: qty harus angka > 0', v_i), 'INPUT_001');
      end if;
      v_qty := nullif(v_x ->> 'qty', '')::numeric;
      if v_qty is not null and v_qty <= 0 then perform public.lempar('PT400', format('produk[%s]: qty harus > 0', v_i), 'INPUT_001'); end if;
      v_sat := lower(coalesce(public.pipeline_luar_teks(v_x, 'satuan', 10), 'unit'));
      if v_sat not in ('unit', 'set', 'pcs') then
        perform public.lempar('PT400', format('produk[%s]: satuan harus unit, set, atau pcs', v_i), 'INPUT_001');
      end if;
      v_spes := public.pipeline_luar_teks(v_x, 'spesifikasi', 300);
      if v_qty is null then v_spes := btrim('(qty belum pasti) ' || coalesce(v_spes, '')); end if;
      v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'produk', v_prod, 'qty', coalesce(v_qty, 1), 'satuan', v_sat, 'spesifikasi', v_spes)));
    end loop;
  end if;
  if v_items = '[]'::jsonb then
    v_items := jsonb_build_array(jsonb_build_object('produk', 'Lainnya', 'qty', 1, 'satuan', 'unit', 'spesifikasi', '(qty belum pasti)'));
  end if;

  -- pemilik
  if jsonb_typeof(p -> 'pemilik') not in ('number', 'string', 'null') or coalesce(p ->> 'pemilik', '') !~ '^[0-9]{0,18}$' then
    perform public.lempar('PT400', 'pemilik harus id anggota atau null', 'INPUT_001');
  end if;
  v_pemilik := nullif(p ->> 'pemilik', '')::bigint;
  if v_pemilik is not null and not (public.pipeline_sales_sah(v_pemilik)
     and exists (select 1 from public.members m where m.id = v_pemilik and m.role in ('owner', 'member'))) then
    perform public.lempar('PT400', 'pemilik harus sales aktif dengan akses Pipeline admin/rep', 'INPUT_001');
  end if;
  v_alasan := public.pipeline_luar_teks(p, 'alasan_pemilik', 20);
  if v_alasan is not null and v_alasan not in ('balasan', 'giliran', 'pelanggan_lama') then
    perform public.lempar('PT400', 'alasan_pemilik harus balasan, giliran, atau pelanggan_lama', 'INPUT_001');
  end if;
  if v_pemilik is not null and v_alasan is null then
    perform public.lempar('PT400', 'alasan_pemilik wajib bila pemilik diisi', 'INPUT_001');
  end if;
  if v_pemilik is null and v_alasan is not null then
    perform public.lempar('PT400', 'alasan_pemilik hanya bersama pemilik', 'INPUT_001');
  end if;

  v_sidik := md5(jsonb_build_object('hp', v_telp, 'sumber', v_sumber, 'pelanggan', v_pel, 'produk', v_items,
    'pemilik', v_pemilik, 'bukti', v_bukti, 'kode', v_bkode)::text);

  -- dedupe nomor: lead terbuka terbaru
  perform pg_advisory_xact_lock(hashtextextended('hp:' || v_telp, 0));
  select l.id into v_lead_id
    from public.lead l join public.kontak k on k.id = l.kontak_id
   where k.telepon = v_telp and l.tahap in ('BARU', 'PENAWARAN')
   order by l.tanggal_masuk desc, l.dibuat_pada desc, l.id desc limit 1;
  if v_lead_id is not null then
    if not exists (select 1 from public.lead_aktivitas a where a.lead_id = v_lead_id and a.jenis = 'WA'
                     and a.hasil like format('Chat WA baru %s%%', to_char(v_tgl, 'DD-MM-YYYY'))) then
      insert into public.lead_aktivitas (lead_id, oleh, jenis, hasil, rencana_berikutnya)
      values (v_lead_id, public.aktor(), 'WA', format('Chat WA baru %s (agent)', to_char(v_tgl, 'DD-MM-YYYY')),
              (select l.fu_berikutnya from public.lead l where l.id = v_lead_id));
      v_akt := true;
    end if;
    insert into public.pipeline_tautan_luar (kunci_luar, jenis, lead_id, sidik, cara, hasil_akhir)
    values (v_kunci, 'wa', v_lead_id, v_sidik, 'hp_terbuka', 'lead_terbuka_ada');
    return (select jsonb_build_object('status', 'lead_terbuka_ada', 'lead_id', l.id, 'kode', l.kode, 'pemilik', l.pemilik,
                                      'aktivitas_baru', v_akt)
              from public.lead l where l.id = v_lead_id);
  end if;

  -- lead baru
  select k.pelanggan_id into v_pel_id from public.kontak k where k.telepon = v_telp order by k.dibuat_pada desc, k.id desc limit 1;
  v_baru := public.inti_pipeline_lead_buat(jsonb_strip_nulls(jsonb_build_object(
    'sumber', v_sumber, 'pemilik', v_pemilik, 'tanggal_masuk', v_tgl,
    'pelanggan_id', v_pel_id,
    'pelanggan', case when v_pel_id is null then jsonb_build_object('nama', coalesce(v_pel, '-'), 'kota', v_kota) end,
    'kontak', jsonb_strip_nulls(jsonb_build_object('nama', v_kontak, 'telepon', v_hp_raw)),
    'kebutuhan', v_keb, 'catatan', v_cat, 'items', v_items)));
  v_lead_id := v_baru ->> 'id';

  v_label := case v_alasan
    when 'balasan' then format('%s (ditebak dari nama sales di balasan)', (select m.username from public.members m where m.id = v_pemilik))
    when 'giliran' then format('%s (bergiliran)', (select m.username from public.members m where m.id = v_pemilik))
    when 'pelanggan_lama' then format('%s (pemilik lead lama nomor ini)', (select m.username from public.members m where m.id = v_pemilik))
    else 'belum ditentukan' end;
  insert into public.lead_aktivitas (lead_id, oleh, jenis, hasil, rencana_berikutnya)
  values (v_lead_id, public.aktor(), 'WA', format('Lead otomatis dari WA 0878 (agent), pemilik: %s', v_label), null);

  if v_bukti is not null then
    perform public.inti_pipeline_sumber_bukti_set(jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'lead_id', v_lead_id, 'bukti', v_bukti, 'kode', v_bkode, 'chat_pada', v_chat))));
  end if;

  insert into public.pipeline_tautan_luar (kunci_luar, jenis, lead_id, sidik, cara, hasil_akhir)
  values (v_kunci, 'wa', v_lead_id, v_sidik, 'baru', 'dibuat');
  return (select jsonb_build_object('status', 'dibuat', 'lead_id', l.id, 'kode', l.kode, 'pemilik', l.pemilik)
            from public.lead l where l.id = v_lead_id);
end; $$;

-- ============================================================ satu atau banyak (batch)
-- p = satu item (objek ber-kunci pengenal: erp_so_id / kunci_luar) → hasil item; galat item → galat panggilan (PTxxx →
--     HTTP xxx).
-- p = {"items":[…]} tanpa kunci pengenal (1–100) → tiap item di sub-transaksi sendiri: item gagal dibatalkan sendiri, item lain tetap.
--   Hasil {diproses, ok, gagal, per_status:{status:n}, items:[{i, ok:true, status, lead_id, kode, …} |
--          {i, ok:false, status_http, err, ECODE}]} (urut = urut items). Galat selain PTxxx/22xxx/23xxx → seluruh
--   panggilan gagal (salah server, bukan salah data).
create or replace function public.pipeline_luar_banyak(p jsonb, p_jenis text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb; v_i int := -1; v_r jsonb; v_hasil jsonb := '[]'::jsonb;
  v_state text; v_msg text; v_hint text; v_http int; v_ok int := 0;
begin
  if coalesce(public.pipeline_peran_aktor(), '') <> 'admin' then
    perform public.lempar('PT403', 'Sinkron Pipeline hanya untuk agent atau admin Pipeline', 'ACCESS_001');
  end if;
  if jsonb_typeof(p) is distinct from 'object' then perform public.lempar('PT400', 'Body harus objek JSON', 'INPUT_001'); end if;
  -- satu item = ada kunci pengenal (SP ERP punya field `items` sendiri = baris barang, jadi `items` saja tidak cukup)
  if not p ? 'items' or p ? (case p_jenis when 'wa' then 'kunci_luar' else 'erp_so_id' end) then
    return case p_jenis when 'wa' then public.inti_pipeline_lead_otomatis(p) else public.inti_pipeline_order_erp(p) end;
  end if;
  perform public.pipeline_luar_kunci(p, array['items'], 'Body');
  if jsonb_typeof(p -> 'items') <> 'array' or jsonb_array_length(p -> 'items') < 1 then
    perform public.lempar('PT400', 'items wajib array berisi minimal 1 item', 'INPUT_001');
  end if;
  if jsonb_array_length(p -> 'items') > 100 then
    perform public.lempar('PT400', format('Maksimal 100 item per panggilan (dikirim %s); pecah jadi beberapa panggilan',
      jsonb_array_length(p -> 'items')), 'INPUT_001');
  end if;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_i := v_i + 1;
    begin
      v_r := case p_jenis when 'wa' then public.inti_pipeline_lead_otomatis(v_item) else public.inti_pipeline_order_erp(v_item) end;
      v_hasil := v_hasil || jsonb_build_array(jsonb_build_object('i', v_i, 'ok', true) || v_r);
      v_ok := v_ok + 1;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
      if v_state ~ '^PT\d{3}$' then v_http := substr(v_state, 3)::int;
      elsif v_state ~ '^22' then v_http := 400;
      elsif v_state ~ '^23' then v_http := 409;
      else raise;
      end if;
      v_hasil := v_hasil || jsonb_build_array(jsonb_build_object('i', v_i, 'ok', false, 'status_http', v_http,
        'err', format('items[%s]: %s', v_i, v_msg),
        'ECODE', coalesce(nullif(v_hint, ''), case v_http when 401 then 'OAUTH_019' when 403 then 'ACCESS_001'
                                                   when 404 then 'ITEM_013' when 409 then 'KONFLIK_001' else 'INPUT_001' end)));
    end;
  end loop;

  return jsonb_build_object('diproses', v_i + 1, 'ok', v_ok, 'gagal', v_i + 1 - v_ok,
    'per_status', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from (
        select coalesce(e ->> 'status', 'gagal') as s, count(*) as n from jsonb_array_elements(v_hasil) e group by 1) x),
    'items', v_hasil);
end; $$;

-- ============================================================ audit tautan (baca)
-- p = {jenis? erp_sp|wa, sejak? YYYY-MM-DD (WIB) | ISO dengan zona (default 7 hari lalu), batas? 1–1000 (default 200)}
-- Hasil {total, sejak, items:[{kunci_luar, jenis, lead_id, kode, tahap, no_sp, pemilik, pemilik_nama, cara, hasil_akhir,
-- dibuat_pada, diubah_pada}]} urut diubah_pada terbaru. Tanpa nomor/nama pelanggan.
create or replace function public.inti_pipeline_tautan(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_jenis text; v_teks text; v_sejak timestamptz; v_batas int;
begin
  if coalesce(public.pipeline_peran_aktor(), '') <> 'admin' then
    perform public.lempar('PT403', 'Audit sinkron hanya untuk agent atau admin Pipeline', 'ACCESS_001');
  end if;
  perform public.pipeline_luar_kunci(p, array['jenis', 'sejak', 'batas'], 'Parameter');
  v_jenis := public.pipeline_luar_teks(p, 'jenis', 10);
  if v_jenis is not null and v_jenis not in ('erp_sp', 'wa') then
    perform public.lempar('PT400', 'jenis harus erp_sp atau wa', 'INPUT_001');
  end if;
  v_teks := public.pipeline_luar_teks(p, 'sejak', 40);
  if v_teks is null then
    v_sejak := now() - interval '7 days';
  elsif v_teks ~ '^\d{4}-\d{2}-\d{2}$' then
    begin v_sejak := v_teks::date::timestamp at time zone 'Asia/Jakarta';
    exception when others then perform public.lempar('PT400', 'sejak tidak valid', 'INPUT_001'); end;
  elsif v_teks ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
    begin v_sejak := v_teks::timestamptz;
    exception when others then perform public.lempar('PT400', 'sejak tidak valid', 'INPUT_001'); end;
  else
    perform public.lempar('PT400', 'sejak harus YYYY-MM-DD atau waktu ISO dengan zona', 'INPUT_001');
  end if;
  if jsonb_typeof(p -> 'batas') not in ('number', 'string', 'null') or coalesce(p ->> 'batas', '') !~ '^\d{0,4}$' then
    perform public.lempar('PT400', 'batas harus angka 1–1000', 'INPUT_001');
  end if;
  v_batas := coalesce(nullif(p ->> 'batas', '')::int, 200);
  if v_batas < 1 or v_batas > 1000 then perform public.lempar('PT400', 'batas harus angka 1–1000', 'INPUT_001'); end if;

  return (
    with t as (
      select t.* from public.pipeline_tautan_luar t
       where t.diubah_pada >= v_sejak and (v_jenis is null or t.jenis = v_jenis))
    select jsonb_build_object(
      'total', (select count(*) from t),
      'sejak', public.iso_utc(v_sejak),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'kunci_luar', x.kunci_luar, 'jenis', x.jenis, 'lead_id', x.lead_id, 'kode', l.kode, 'tahap', l.tahap,
                 'no_sp', l.no_sp, 'pemilik', l.pemilik, 'pemilik_nama', m.username, 'cara', x.cara,
                 'hasil_akhir', x.hasil_akhir, 'dibuat_pada', public.iso_utc(x.dibuat_pada),
                 'diubah_pada', public.iso_utc(x.diubah_pada)) order by x.diubah_pada desc, x.kunci_luar)
          from (select * from t order by t.diubah_pada desc, t.kunci_luar limit v_batas) x
          join public.lead l on l.id = x.lead_id
          left join public.members m on m.id = l.pemilik), '[]'::jsonb)));
end; $$;

-- ============================================================ bungkus API (routine/agent, token service_role)
create or replace function public.x_pipeline_order_erp(p_aktor bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); return public.pipeline_luar_banyak(coalesce(p, '{}'::jsonb), 'erp_sp'); end; $$;
create or replace function public.x_pipeline_lead_otomatis(p_aktor bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); return public.pipeline_luar_banyak(coalesce(p, '{}'::jsonb), 'wa'); end; $$;
create or replace function public.x_pipeline_tautan(p_aktor bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); return public.inti_pipeline_tautan(coalesce(p, '{}'::jsonb)); end; $$;

-- ============================================================ hak (fail-closed): pembantu & inti internal; x_ → service_role
revoke all on function
  public.pipeline_sumber_sah(), public.pipeline_produk_sah(), public.pipeline_produk_baku(text),
  public.pipeline_luar_kunci(jsonb, text[], text), public.pipeline_luar_teks(jsonb, text, int), public.pipeline_luar_hp(jsonb, boolean),
  public.pipeline_sales_dari_sp(text, text),
  public.pipeline_erp_terapkan(text, text, date, bigint, text, boolean, bigint, text),
  public.inti_pipeline_order_erp(jsonb), public.inti_pipeline_lead_otomatis(jsonb), public.pipeline_luar_banyak(jsonb, text),
  public.inti_pipeline_tautan(jsonb),
  public.x_pipeline_order_erp(bigint, jsonb), public.x_pipeline_lead_otomatis(bigint, jsonb), public.x_pipeline_tautan(bigint, jsonb)
from public, anon, authenticated, service_role;
grant execute on function
  public.x_pipeline_order_erp(bigint, jsonb), public.x_pipeline_lead_otomatis(bigint, jsonb), public.x_pipeline_tautan(bigint, jsonb)
to service_role;
