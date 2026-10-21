-- Pipeline: BUKTI SUMBER lead dari chat WA 0878 (Kapso Fase 1, ACC Hannes 21 Okt 2026).
-- Routine agent membaca chat 0878 lewat Kapso (baca saja) dan mencari bukti asal lead dengan POLA TETAP (tanpa AI):
-- template form situs, kode Ref (Ref: WEB-RH, Ref: GA-OY-7K3F, Ref PM-06), XS-PM/TIDUR, "Halo Bu Lastri", produk
-- katalog WA. Label `lead.sumber` dari sales tidak bisa dipegang (mis. 28 lead form situs berlabel "WA langsung").
-- Keputusan: agent TIDAK menimpa `lead.sumber` (isian sales); bukti ditulis ke kolom TERPISAH yang sales lihat
-- hanya-baca dan laporan bisa membandingkannya dengan `sumber`.
--
-- Isi:
--   * 4 kolom baru di lead (nullable, default null): sumber_bukti (kelas, allowlist di bawah), sumber_bukti_kode (kode
--     mentah, mis. GA-OY-7K3F / PM-06), sumber_bukti_chat_pada (pesan pertama pelanggan di chat itu),
--     sumber_bukti_diisi_pada (diisi fungsi, now()).
--   * x_pipeline_sumber_bukti_set(p_aktor, p) — SATU-SATUNYA penulis kolom itu (Edge POST /x/pipeline/sumber-bukti,
--     scope tulis; CLI `pipeline bukti-set`). Hanya aktor ber-peran Pipeline 'admin' (owner, bot routine, admin).
--     Maks 200 item; semua-atau-tidak (satu item tidak sah → galat, tidak ada yang ditulis); idempoten (nilai sama =
--     tidak ditulis); TIDAK menyentuh `sumber` atau kolom lain (diperbarui_pada pun dipertahankan).
--   * Penjaga trigger pipeline_lead_sumber_bukti: kolom bukti ditolak (PT403) bila diubah lewat jalur lain. Jalur tulis
--     lead yang ada (web_pipeline_lead_buat/_lead_ubah/_tahap/_fu_catat/_order_ubah, gabung pelanggan, alat impor)
--     memakai daftar kolom eksplisit dan tidak pernah menyentuh kolom ini; tabel lead tetap SELECT saja untuk role API
--     (20261013121000_pipeline_hak_ketat). Penjaga ini lapis kedua untuk jalur yang dibuat kelak.
--   * Baca: j_pipeline_lead (detail: web_pipeline_lead / x_pipeline_lead / hasil mutasi lead) dan baris ringkas
--     (j_pipeline_lead_ringkas + _banyak: web_pipeline_daftar / x_pipeline_daftar) menambah 4 field; field lain tetap.
--
-- TIDAK dicatat ke lead_aktivitas: itu riwayat yang dilihat sales di detail lead, dan trigger pipeline_aktivitas_sesudah
-- menggeser diam_sejak + menimpa fu_berikutnya → satu run agent (sampai 200 lead) akan membuat lead tampak "baru
-- di-follow-up" dan mengosongkan rencana FU. Jejak cukup di kolomnya sendiri (diisi_pada); aktor selalu token agent.
--
-- BERBASIS: j_pipeline_lead = versi 20261013150000_pipeline_order; j_pipeline_lead_ringkas & _banyak = versi
-- 20261017120000_pipeline_pelanggan (field ringkas ada di DUA fungsi itu; tes 23 menjaga bentuknya sama). Hanya field
-- bukti yang ditambah. ADITIF: tanpa UPDATE/DELETE data; lead lama = semua bukti null.

-- ============================================================ kelas bukti (SATU tempat; dipakai CHECK + fungsi tulis)
-- Kelas = keluaran pola tetap tools/kapso-catat.py rhj-brain (fungsi bukti_dari). Menambah kelas = ubah daftar ini
-- (superset; jangan buang kelas yang sudah terpakai) + label di web/src/features/pipeline/konstanta.ts (BUKTI_SUMBER).
--   situs-rh      template form situs rodahammerindo.com ("Halo Hammerindo, Nama saya …", tanpa Ref)
--   situs-oy      template form situs palletmeshindonesia.com / OYAMA ("seputar pallet mesh", tanpa Ref)
--   web-rh        Ref: WEB-RH   (tombol WA situs RH, kunjungan organik/langsung)
--   ga-rh         Ref: GA-RH-…  (situs RH, kunjungan dari Google Ads; kode lengkap di sumber_bukti_kode)
--   web-oy        Ref: WEB-OY   (tombol WA situs palletmesh)
--   ga-oy         Ref: GA-OY-…  (situs palletmesh dari Google Ads, mis. GA-OY-7K3F)
--   meta          Ref PM-xx / RD-xx (iklan Meta; kode mis. PM-06)
--   lastri        pesan pertama "Halo Bu Lastri"
--   katalog-wa    chat dibuka dari produk katalog WhatsApp
--   xs-pm         kode XS-PM (huruf besar atau utm_campaign)
--   tidur         kode TIDUR (huruf besar atau utm_campaign)
--   tanpa-sinyal  chat ketemu, tanpa bukti apa pun (kode wajib kosong)
create or replace function public.pipeline_sumber_bukti_kelas()
returns text[] language sql immutable set search_path = '' as $$
  select array['situs-rh', 'situs-oy', 'web-rh', 'ga-rh', 'web-oy', 'ga-oy', 'meta',
               'lastri', 'katalog-wa', 'xs-pm', 'tidur', 'tanpa-sinyal']::text[]
$$;

-- ============================================================ kolom
alter table public.lead
  add column if not exists sumber_bukti            text,
  add column if not exists sumber_bukti_kode       text,
  add column if not exists sumber_bukti_chat_pada  timestamptz,
  add column if not exists sumber_bukti_diisi_pada timestamptz;

alter table public.lead
  add constraint lead_sumber_bukti_sah check (sumber_bukti is null or sumber_bukti = any (public.pipeline_sumber_bukti_kelas())),
  add constraint lead_sumber_bukti_kode_pola check (sumber_bukti_kode is null or sumber_bukti_kode ~ '^[A-Z0-9-]{2,20}$'),
  -- tanpa kelas = tanpa bukti sama sekali; ada kelas = waktu isi wajib ada
  add constraint lead_sumber_bukti_konsisten check (
    (sumber_bukti is null and sumber_bukti_kode is null and sumber_bukti_chat_pada is null and sumber_bukti_diisi_pada is null)
    or (sumber_bukti is not null and sumber_bukti_diisi_pada is not null));

-- laporan "sumber sales vs bukti agent" menyaring per kelas
create index if not exists lead_sumber_bukti_idx on public.lead (sumber_bukti) where sumber_bukti is not null;

-- ============================================================ penjaga: kolom bukti hanya lewat x_pipeline_sumber_bukti_set
-- Fungsi tulis menyalakan app.sumber_bukti_tulis (lokal transaksi) tepat di sekitar UPDATE-nya. Tanpa itu, INSERT berisi
-- bukti atau UPDATE yang mengubah bukti → PT403 (berlaku juga untuk SQL manual sebagai postgres: set dulu
-- `select set_config('app.sumber_bukti_tulis', 'ya', true);` di transaksi yang sama). Trigger berjalan SESUDAH
-- pipeline_lead_sebelum (urut nama), jadi saat bukti ditulis agent diperbarui_pada dikembalikan ke nilai lama: bukti
-- agent bukan suntingan lead.
create or replace function public.pipeline_lead_sumber_bukti()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.sumber_bukti_tulis', true) = 'ya' then
    if tg_op = 'UPDATE' then new.diperbarui_pada := old.diperbarui_pada; end if;
    return new;
  end if;
  if (tg_op = 'INSERT' and (new.sumber_bukti, new.sumber_bukti_kode, new.sumber_bukti_chat_pada, new.sumber_bukti_diisi_pada)
                           is distinct from (null::text, null::text, null::timestamptz, null::timestamptz))
     or (tg_op = 'UPDATE' and (new.sumber_bukti, new.sumber_bukti_kode, new.sumber_bukti_chat_pada, new.sumber_bukti_diisi_pada)
                              is distinct from (old.sumber_bukti, old.sumber_bukti_kode, old.sumber_bukti_chat_pada, old.sumber_bukti_diisi_pada)) then
    perform public.lempar('PT403', 'Bukti sumber hanya diisi agent lewat x_pipeline_sumber_bukti_set', 'ACCESS_001');
  end if;
  return new;
end; $$;

drop trigger if exists pipeline_lead_sumber_bukti on public.lead;
create trigger pipeline_lead_sumber_bukti before insert or update on public.lead
  for each row execute function public.pipeline_lead_sumber_bukti();

-- ============================================================ tulis (agent): set bukti massal
-- p = {"items":[{"lead_id":"ld…", "bukti":"situs-rh", "kode":null, "chat_pada":"2026-10-16T10:32:00+07:00"}, …]}
--   * items: array, maks 200. Kunci lain di p / di item → PT400 (salah ketik tidak boleh diam-diam diabaikan).
--   * bukti: kelas dari pipeline_sumber_bukti_kelas(), atau null = HAPUS bukti lead itu (kode & chat_pada harus kosong).
--   * kode: null atau teks [A-Z0-9-]{2,20} (dirapikan: trim + huruf besar). web-rh/ga-rh/web-oy/ga-oy: diawali kelasnya
--     (GA-OY-7K3F untuk ga-oy); meta: PM-… / RD-…; tanpa-sinyal: wajib kosong.
--   * chat_pada: null atau waktu ISO DENGAN zona (Z / +07:00; tanpa zona ditolak supaya tidak bergeser 7 jam), tidak
--     di masa depan.
--   * lead_id wajib ada (PT404) dan tidak boleh ganda dalam satu panggilan.
-- Item = keadaan bukti LENGKAP lead itu (bukan tambalan): nilai sama dengan yang tersimpan → tidak ditulis
-- (diubah=false, diisi_pada tetap); beda → keempat kolom ditimpa, diisi_pada = now(). Satu item tidak sah → galat
-- (pesan menyebut items[i] + lead_id) dan TIDAK ada yang ditulis; kirim ulang aman karena idempoten.
-- Hasil: {"diproses":n, "diubah":x, "sama":n-x, "items":[{"lead_id","ok":true,"diubah"}]} (urutan = urutan items).
create or replace function public.inti_pipeline_sumber_bukti_set(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_kelas text[] := public.pipeline_sumber_bukti_kelas();
  v_item jsonb; v_i int := -1; v_k text; v_ref text;
  v_id text; v_bukti text; v_kode text; v_chat timestamptz; v_teks text;
  v_lama record; v_ubah boolean;
  v_ids text[] := '{}'; v_hasil jsonb := '[]'::jsonb; v_n_ubah int := 0;
begin
  if coalesce(public.pipeline_peran_aktor(), '') <> 'admin' then   -- rep/baca/tanpa akses: bukti bukan isian sales
    perform public.lempar('PT403', 'Bukti sumber hanya bisa diisi agent atau admin Pipeline', 'ACCESS_001');
  end if;
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'items') is distinct from 'array' then
    perform public.lempar('PT400', 'items wajib berupa array {lead_id, bukti, kode?, chat_pada?}', 'INPUT_001');
  end if;
  select k into v_k from jsonb_object_keys(p) k where k <> 'items' limit 1;
  if v_k is not null then perform public.lempar('PT400', format('Kunci tidak dikenal: %s (yang sah: items)', v_k), 'INPUT_001'); end if;
  if jsonb_array_length(p->'items') > 200 then
    perform public.lempar('PT400', format('Maksimal 200 item per panggilan (dikirim %s); pecah jadi beberapa panggilan',
      jsonb_array_length(p->'items')), 'INPUT_001');
  end if;

  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_i := v_i + 1;
    v_ref := format('items[%s]', v_i);
    if jsonb_typeof(v_item) is distinct from 'object' then
      perform public.lempar('PT400', format('%s: harus objek {lead_id, bukti, kode?, chat_pada?}', v_ref), 'INPUT_001');
    end if;
    select k into v_k from jsonb_object_keys(v_item) k where k not in ('lead_id', 'bukti', 'kode', 'chat_pada') limit 1;
    if v_k is not null then
      perform public.lempar('PT400', format('%s: kunci tidak dikenal: %s (yang sah: lead_id, bukti, kode, chat_pada)', v_ref, v_k), 'INPUT_001');
    end if;
    v_id := nullif(btrim(coalesce(v_item->>'lead_id', '')), '');
    if v_id is null or jsonb_typeof(v_item->'lead_id') <> 'string' then
      perform public.lempar('PT400', format('%s: lead_id wajib (teks)', v_ref), 'INPUT_001');
    end if;
    v_ref := format('items[%s] (%s)', v_i, v_id);
    if v_id = any (v_ids) then perform public.lempar('PT400', format('%s: lead_id ganda dalam satu panggilan', v_ref), 'INPUT_001'); end if;
    v_ids := v_ids || v_id;

    -- kelas
    if not v_item ? 'bukti' then
      perform public.lempar('PT400', format('%s: bukti wajib (kelas, atau null untuk menghapus)', v_ref), 'INPUT_001');
    end if;
    if jsonb_typeof(v_item->'bukti') not in ('string', 'null') then
      perform public.lempar('PT400', format('%s: bukti harus teks atau null', v_ref), 'INPUT_001');
    end if;
    v_bukti := v_item->>'bukti';
    if v_bukti is not null and not (v_bukti = any (v_kelas)) then
      perform public.lempar('PT400', format('%s: kelas bukti tidak dikenal: "%s" (yang sah: %s)', v_ref, v_bukti,
        array_to_string(v_kelas, ', ')), 'INPUT_001');
    end if;

    -- kode
    if jsonb_typeof(v_item->'kode') not in ('string', 'null') then
      perform public.lempar('PT400', format('%s: kode harus teks atau null', v_ref), 'INPUT_001');
    end if;
    v_kode := upper(nullif(btrim(coalesce(v_item->>'kode', '')), ''));
    if v_kode is not null then
      if v_kode !~ '^[A-Z0-9-]{2,20}$' then
        perform public.lempar('PT400', format('%s: kode tidak sah: "%s" (huruf/angka/tanda -, 2–20 karakter)', v_ref, v_item->>'kode'), 'INPUT_001');
      end if;
      if v_bukti is null or v_bukti = 'tanpa-sinyal' then
        perform public.lempar('PT400', format('%s: kode harus kosong untuk bukti %s', v_ref, coalesce(v_bukti, 'null')), 'INPUT_001');
      end if;
      if v_bukti in ('web-rh', 'ga-rh', 'web-oy', 'ga-oy') and v_kode <> upper(v_bukti) and v_kode not like upper(v_bukti) || '-%' then
        perform public.lempar('PT400', format('%s: kode %s tidak cocok dengan kelas %s (harus diawali %s)', v_ref, v_kode, v_bukti, upper(v_bukti)), 'INPUT_001');
      end if;
      if v_bukti = 'meta' and v_kode !~ '^(PM|RD)-' then
        perform public.lempar('PT400', format('%s: kode %s tidak cocok dengan kelas meta (harus PM-… / RD-…)', v_ref, v_kode), 'INPUT_001');
      end if;
    end if;

    -- waktu chat
    if jsonb_typeof(v_item->'chat_pada') not in ('string', 'null') then
      perform public.lempar('PT400', format('%s: chat_pada harus teks ISO atau null', v_ref), 'INPUT_001');
    end if;
    v_teks := nullif(btrim(coalesce(v_item->>'chat_pada', '')), '');
    v_chat := null;
    if v_teks is not null then
      if v_bukti is null then perform public.lempar('PT400', format('%s: chat_pada harus kosong untuk bukti null', v_ref), 'INPUT_001'); end if;
      if v_teks !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
        perform public.lempar('PT400', format('%s: chat_pada harus waktu ISO dengan zona, mis. 2026-10-16T10:32:00+07:00 (dikirim "%s")', v_ref, v_teks), 'INPUT_001');
      end if;
      begin
        v_chat := v_teks::timestamptz;
      exception when others then
        perform public.lempar('PT400', format('%s: chat_pada tidak valid: "%s"', v_ref, v_teks), 'INPUT_001');
      end;
      if v_chat > now() + interval '5 minutes' then
        perform public.lempar('PT400', format('%s: chat_pada tidak boleh di masa depan', v_ref), 'INPUT_001');
      end if;
    end if;

    -- lead + bandingkan (baris dikunci: dua run bersamaan tidak saling menyalip)
    select l.sumber_bukti, l.sumber_bukti_kode, l.sumber_bukti_chat_pada into v_lama
      from public.lead l where l.id = v_id for update;
    if not found then perform public.lempar('PT404', format('%s: lead tidak ditemukan', v_ref), 'ITEM_013'); end if;
    v_ubah := (v_lama.sumber_bukti, v_lama.sumber_bukti_kode, v_lama.sumber_bukti_chat_pada) is distinct from (v_bukti, v_kode, v_chat);
    if v_ubah then
      perform set_config('app.sumber_bukti_tulis', 'ya', true);
      update public.lead set
          sumber_bukti = v_bukti, sumber_bukti_kode = v_kode, sumber_bukti_chat_pada = v_chat,
          sumber_bukti_diisi_pada = case when v_bukti is null then null else now() end
       where id = v_id;
      perform set_config('app.sumber_bukti_tulis', '', true);
      v_n_ubah := v_n_ubah + 1;
    end if;
    v_hasil := v_hasil || jsonb_build_object('lead_id', v_id, 'ok', true, 'diubah', v_ubah);
  end loop;

  return jsonb_build_object('diproses', v_i + 1, 'diubah', v_n_ubah, 'sama', v_i + 1 - v_n_ubah, 'items', v_hasil);
end; $$;

-- Bungkus API (routine/agent via token service_role, scope 'tulis'), pola x_pipeline_fu_set. Tanpa web_: sales tidak
-- mengisi bukti.
create or replace function public.x_pipeline_sumber_bukti_set(p_aktor bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); return public.inti_pipeline_sumber_bukti_set(coalesce(p, '{}'::jsonb)); end; $$;

-- ============================================================ JSON detail (= 20261013150000 + 4 field bukti)
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
    'sumber_bukti', l.sumber_bukti, 'sumber_bukti_kode', l.sumber_bukti_kode,
    'sumber_bukti_chat_pada', public.iso_utc(l.sumber_bukti_chat_pada),
    'sumber_bukti_diisi_pada', public.iso_utc(l.sumber_bukti_diisi_pada),
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

-- ============================================================ baris ringkas (= 20261017120000 + 4 field bukti; KEDUA fungsi sama, tes 23)
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
    'pelanggan_id', l.pelanggan_id,
    'order_sebelumnya', (select count(*)::int from public.lead o
                          where o.pelanggan_id = l.pelanggan_id and o.id <> l.id and o.tahap = 'ORDER'
                            and case when l.tahap = 'ORDER'
                                  then (coalesce(o.tanggal_sp, o.tanggal_masuk), o.kode) < (coalesce(l.tanggal_sp, l.tanggal_masuk), l.kode)
                                  else coalesce(o.tanggal_sp, o.tanggal_masuk) <= l.tanggal_masuk end),
    'sumber_bukti', l.sumber_bukti, 'sumber_bukti_kode', l.sumber_bukti_kode,
    'sumber_bukti_chat_pada', public.iso_utc(l.sumber_bukti_chat_pada),
    'sumber_bukti_diisi_pada', public.iso_utc(l.sumber_bukti_diisi_pada),
    'produk', (select coalesce(jsonb_agg(jsonb_build_object('produk', i.produk, 'qty', i.qty, 'satuan', i.satuan) order by i.id), '[]'::jsonb)
      from public.lead_item i where i.lead_id = l.id))
  from public.lead l
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.members mp on mp.id = l.pemilik
    left join public.pipeline_akses pa on pa.member_id = l.pemilik
  where l.id = p_id
$$;

create or replace function public.j_pipeline_lead_ringkas_banyak(p_ids text[])
returns table (n bigint, id text, j jsonb)
language sql stable security definer set search_path = '' as $$
  with h as materialized (select public.hari_ini_wib() as hari),     -- sekali, bukan per baris
  u as (select x.id, x.n from unnest(p_ids) with ordinality as x(id, n)),
  it as (select i.lead_id,
                jsonb_agg(jsonb_build_object('produk', i.produk, 'qty', i.qty, 'satuan', i.satuan) order by i.id) as produk
           from u join public.lead_item i on i.lead_id = u.id
          group by i.lead_id)
  select u.n, l.id, jsonb_build_object(
    'id', l.id, 'kode', l.kode, 'tahap', l.tahap, 'sumber', l.sumber,
    'pelanggan', pg.nama, 'kota', pg.kota, 'pemilik', l.pemilik, 'pemilik_nama', mp.username, 'pemilik_kode_sp', pa.kode_sp,
    'tanggal_masuk', l.tanggal_masuk, 'diam_hari', greatest(0, h.hari - l.diam_sejak::date),
    'fu_berikutnya', l.fu_berikutnya,
    'nilai_transaksi', l.nilai_transaksi, 'no_sp', l.no_sp, 'tanggal_sp', l.tanggal_sp, 'no_po', l.no_po,
    'bayar_status', l.bayar_status, 'bayar_dp', l.bayar_dp, 'tanggal_dp', l.tanggal_dp, 'tanggal_lunas', l.tanggal_lunas,
    'periksa', l.periksa,
    'pelanggan_id', l.pelanggan_id,
    'order_sebelumnya', (select count(*)::int from public.lead o
                          where o.pelanggan_id = l.pelanggan_id and o.id <> l.id and o.tahap = 'ORDER'
                            and case when l.tahap = 'ORDER'
                                  then (coalesce(o.tanggal_sp, o.tanggal_masuk), o.kode) < (coalesce(l.tanggal_sp, l.tanggal_masuk), l.kode)
                                  else coalesce(o.tanggal_sp, o.tanggal_masuk) <= l.tanggal_masuk end),
    'sumber_bukti', l.sumber_bukti, 'sumber_bukti_kode', l.sumber_bukti_kode,
    'sumber_bukti_chat_pada', public.iso_utc(l.sumber_bukti_chat_pada),
    'sumber_bukti_diisi_pada', public.iso_utc(l.sumber_bukti_diisi_pada),
    'produk', coalesce(it.produk, '[]'::jsonb))
  from u
    join public.lead l on l.id = u.id
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.members mp on mp.id = l.pemilik
    left join public.pipeline_akses pa on pa.member_id = l.pemilik
    left join it on it.lead_id = l.id
    cross join h
$$;

-- ============================================================ hak (fail-closed, pola 20261013121000_pipeline_hak_ketat)
-- pipeline_sumber_bukti_kelas dipakai CHECK: dievaluasi sebagai pemilik fungsi penulis (postgres), jadi tetap internal.
revoke all on function
  public.pipeline_sumber_bukti_kelas(), public.pipeline_lead_sumber_bukti(), public.inti_pipeline_sumber_bukti_set(jsonb),
  public.x_pipeline_sumber_bukti_set(bigint, jsonb),
  public.j_pipeline_lead(text, boolean), public.j_pipeline_lead_ringkas(text), public.j_pipeline_lead_ringkas_banyak(text[])
from public, anon, authenticated, service_role;
grant execute on function public.x_pipeline_sumber_bukti_set(bigint, jsonb) to service_role;
