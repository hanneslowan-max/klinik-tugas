-- Modul Pipeline — Dasbor Pipeline TAHAP 2 (lanjutan 20261029130000; mockup "Dashboard Pipeline Anvil" bagian 5–10 +
-- kartu sales "Pembayaran order saya" & "Rapikan lead saya"). Keputusan Hannes 29 Okt 2026: biaya iklan disimpan di
-- Anvil (tabel baru), diisi agent (Agen Data Harian, API token) dengan cadangan tempel CSV oleh admin.
--
-- AKSES (ditegakkan DI SINI): web_pipeline_dasbor_lanjut → admin/baca: bagian 5–10 penuh; rep: HANYA kartu miliknya
-- (bayar_saya, rapikan) — tanpa biaya iklan, tanpa angka sales lain. Tanpa akses Pipeline → 403. Biaya iklan ditulis
-- hanya oleh peran Pipeline 'admin' (owner, bot routine, admin) lewat x_/web_pipeline_biaya_iklan_set.
--
-- DEFINISI (WIB; bulan = bulan dipilih; "hari ini" = hari_ini_wib()):
--   5 Sumber   : lead masuk bulan itu per `sumber` (isian sales): lead, order (tahap ORDER sekarang), omzet lead itu.
--                Bukti sumber = kelas sumber_bukti lead masuk bulan itu (null = belum dicocokkan agent).
--                Biaya iklan = tabel iklan_biaya tgl 1 s/d hari terakhir yang ada datanya (≤ hari ini); lead Google Ads =
--                lead masuk di rentang yang SAMA dengan `sumber` = 'Google Ads'.
--   6 Bayar    : order (ORDER) dengan tanggal SP dalam 90 hari terakhir (> hari ini − 90) yang bayar_status bukan LUNAS
--                (null = belum dicatat). Umur SP > 30 hari dihitung terpisah.
--   7 Batal    : lead yang SEKARANG BATAL dan perubahan tahap terakhirnya ke BATAL tercatat di Anvil bulan itu (riwayat
--                dengan dari ≠ null). Status BATAL hasil impor (riwayat dari = null, tanggal impor) TIDAK dihitung karena
--                tanggal batal aslinya tidak diketahui — jumlahnya dikirim terpisah untuk catatan. FU = aktivitas selain
--                'Catatan impor' sampai saat batal. Lonjakan = ≥5 batal per sales (pemilik lead) per tanggal.
--   8 Kualitas : lead masuk bulan itu dengan nama pelanggan "-" / sumber "Lainnya" / tanpa bukti sumber (null atau
--                tanpa-sinyal); order bulan itu (tanggal SP) tanpa status bayar; pelanggan dengan >1 lead terbuka.
--   9 Produk   : kategori = produk item PERTAMA lead (tanpa item = Lainnya). Lead = masuk bulan itu; order & omzet =
--                order dengan tanggal SP bulan itu. Produk dengan <5 lead dan 0 order digabung ke "Lainnya".
--                Order pelanggan lama = order bulan itu yang pelanggannya punya order lain lebih dulu (= order_sebelumnya
--                di daftar lead). Pelanggan tidur = pernah order, tidak ada lead masuk 90 hari terakhir, tanpa lead terbuka.
--  10 Tren     : 13 minggu (mulai Senin) sampai minggu yang memuat hari terakhir bulan dipilih (atau hari ini); omzet
--                harian bulan dipilih & bulan lalu (untuk kumulatif).
--
-- Klik angka → web_pipeline_dasbor_ids (diganti di sini: metrik Tahap 1 TETAP sama persis + metrik baru).
-- ADITIF: tabel & fungsi baru; inti_pipeline_dasbor_ids diganti (superset). Tidak ada UPDATE/DELETE data lama.

-- ============================================================ tabel biaya iklan (harian per campaign)
create table public.iklan_biaya (
  tanggal    date not null,
  platform   text not null check (platform in ('google', 'meta')),
  campaign   text not null check (char_length(campaign) between 1 and 120 and campaign = btrim(campaign)),
  biaya      numeric(14, 2) not null check (biaya >= 0),
  klik       integer not null default 0 check (klik >= 0),
  tayang     bigint not null default 0 check (tayang >= 0),
  konversi   numeric(12, 2) not null default 0 check (konversi >= 0),
  diisi_pada timestamptz not null default now(),
  diisi_oleh bigint references public.members (id),
  primary key (tanggal, platform, campaign)
);
comment on table public.iklan_biaya is
  'Biaya iklan harian per campaign (Google/Meta). Ditulis hanya lewat inti_pipeline_biaya_iklan_set (agent / admin Pipeline).';

-- Tanpa akses langsung untuk pengguna web: biaya iklan = angka tim (rep tidak boleh melihat) → hanya lewat
-- web_pipeline_dasbor_lanjut (admin/baca). service_role (Edge/alat) boleh membaca.
alter table public.iklan_biaya enable row level security;
revoke all on public.iklan_biaya from public, anon, authenticated, service_role;
grant select on public.iklan_biaya to service_role;

-- ============================================================ tulis biaya iklan
-- p = {"items":[{"tanggal":"2026-10-27", "platform":"google", "campaign":"General Roda", "biaya":512345,
--                "klik":120, "tayang":3400, "konversi":31.5}, …]}  maks 1000 item.
--   * Item per (tanggal, platform) = keadaan LENGKAP hari itu di platform itu: campaign yang tidak dikirim untuk
--     (tanggal, platform) yang ada di payload DIHAPUS (campaign ganti nama / tarik ulang tidak menyisakan baris lama).
--     Tanggal/platform yang tidak ada di payload tidak disentuh. Kirim ulang payload yang sama = tidak ada perubahan.
--   * tanggal 'YYYY-MM-DD' (≥ 2024-01-01, ≤ hari ini WIB); platform 'google' | 'meta'; campaign 1–120 karakter;
--     biaya ≥ 0 (rupiah, maks 2 desimal); klik/tayang bilangan bulat ≥ 0; konversi ≥ 0 (boleh pecahan, mis. 423,5).
--     Kunci lain → PT400; (tanggal, platform, campaign) ganda dalam satu payload → PT400. Satu item tidak sah →
--     tidak ada yang ditulis.
-- Hasil: {"diproses", "baru", "diubah", "sama", "dihapus", "dari", "sampai"}.
create or replace function public.inti_pipeline_biaya_iklan_set(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hari date := public.hari_ini_wib();
  v_item jsonb; v_i int := -1; v_k text; v_ref text;
  v_tgl date; v_plat text; v_camp text; v_biaya numeric; v_klik bigint; v_tayang bigint; v_konv numeric;
  v_lama public.iklan_biaya; v_kunci text[] := '{}'; v_baris jsonb := '[]'::jsonb;
  v_baru int := 0; v_ubah int := 0; v_sama int := 0; v_hapus int := 0;
  v_dari date; v_sampai date;
begin
  if coalesce(public.pipeline_peran_aktor(), '') <> 'admin' then
    perform public.lempar('PT403', 'Biaya iklan hanya bisa diisi agent atau admin Pipeline', 'ACCESS_001');
  end if;
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'items') is distinct from 'array' then
    perform public.lempar('PT400', 'items wajib berupa array {tanggal, platform, campaign, biaya, klik?, tayang?, konversi?}', 'INPUT_001');
  end if;
  select k into v_k from jsonb_object_keys(p) k where k <> 'items' limit 1;
  if v_k is not null then perform public.lempar('PT400', format('Kunci tidak dikenal: %s (yang sah: items)', v_k), 'INPUT_001'); end if;
  if jsonb_array_length(p->'items') = 0 then perform public.lempar('PT400', 'items kosong', 'INPUT_001'); end if;
  if jsonb_array_length(p->'items') > 1000 then
    perform public.lempar('PT400', format('Maksimal 1000 item per panggilan (dikirim %s)', jsonb_array_length(p->'items')), 'INPUT_001');
  end if;

  -- 1) validasi semua item dulu (semua-atau-tidak); hasil normalisasi dikumpulkan di v_baris
  for v_item in select * from jsonb_array_elements(p->'items') loop
    v_i := v_i + 1;
    v_ref := format('items[%s]', v_i);
    if jsonb_typeof(v_item) is distinct from 'object' then
      perform public.lempar('PT400', format('%s: harus objek {tanggal, platform, campaign, biaya, …}', v_ref), 'INPUT_001');
    end if;
    select k into v_k from jsonb_object_keys(v_item) k
     where k not in ('tanggal', 'platform', 'campaign', 'biaya', 'klik', 'tayang', 'konversi') limit 1;
    if v_k is not null then
      perform public.lempar('PT400', format('%s: kunci tidak dikenal: %s (yang sah: tanggal, platform, campaign, biaya, klik, tayang, konversi)', v_ref, v_k), 'INPUT_001');
    end if;
    -- tanggal
    if jsonb_typeof(v_item->'tanggal') is distinct from 'string' or (v_item->>'tanggal') !~ '^\d{4}-\d{2}-\d{2}$' then
      perform public.lempar('PT400', format('%s: tanggal wajib YYYY-MM-DD', v_ref), 'INPUT_001');
    end if;
    begin
      v_tgl := (v_item->>'tanggal')::date;
    exception when others then
      perform public.lempar('PT400', format('%s: tanggal tidak valid: %s', v_ref, v_item->>'tanggal'), 'INPUT_001');
    end;
    if v_tgl < date '2024-01-01' or v_tgl > v_hari then
      perform public.lempar('PT400', format('%s: tanggal %s di luar rentang (2024-01-01 s/d hari ini)', v_ref, v_tgl), 'INPUT_001');
    end if;
    -- platform & campaign
    v_plat := lower(btrim(coalesce(v_item->>'platform', '')));
    if jsonb_typeof(v_item->'platform') is distinct from 'string' or v_plat not in ('google', 'meta') then
      perform public.lempar('PT400', format('%s: platform harus "google" atau "meta"', v_ref), 'INPUT_001');
    end if;
    v_camp := regexp_replace(btrim(coalesce(v_item->>'campaign', '')), '\s+', ' ', 'g');
    if jsonb_typeof(v_item->'campaign') is distinct from 'string' or char_length(v_camp) not between 1 and 120 then
      perform public.lempar('PT400', format('%s: campaign wajib (teks 1–120 karakter)', v_ref), 'INPUT_001');
    end if;
    v_ref := format('items[%s] (%s %s %s)', v_i, v_tgl, v_plat, v_camp);
    if (v_tgl || '|' || v_plat || '|' || lower(v_camp)) = any (v_kunci) then
      perform public.lempar('PT400', format('%s: ganda dalam satu panggilan', v_ref), 'INPUT_001');
    end if;
    v_kunci := v_kunci || (v_tgl || '|' || v_plat || '|' || lower(v_camp));
    -- angka
    if jsonb_typeof(v_item->'biaya') is distinct from 'number' or (v_item->>'biaya')::numeric < 0
       or (v_item->>'biaya')::numeric >= 1e12 or round((v_item->>'biaya')::numeric, 2) <> (v_item->>'biaya')::numeric then
      perform public.lempar('PT400', format('%s: biaya wajib angka ≥ 0 (rupiah, maks 2 desimal)', v_ref), 'INPUT_001');
    end if;
    v_biaya := (v_item->>'biaya')::numeric;
    if v_item ? 'klik' and (jsonb_typeof(v_item->'klik') is distinct from 'number' or (v_item->>'klik')::numeric < 0
       or (v_item->>'klik')::numeric <> trunc((v_item->>'klik')::numeric) or (v_item->>'klik')::numeric > 2147483647) then
      perform public.lempar('PT400', format('%s: klik harus bilangan bulat ≥ 0', v_ref), 'INPUT_001');
    end if;
    if v_item ? 'tayang' and (jsonb_typeof(v_item->'tayang') is distinct from 'number' or (v_item->>'tayang')::numeric < 0
       or (v_item->>'tayang')::numeric <> trunc((v_item->>'tayang')::numeric) or (v_item->>'tayang')::numeric > 1e15) then
      perform public.lempar('PT400', format('%s: tayang harus bilangan bulat ≥ 0', v_ref), 'INPUT_001');
    end if;
    if v_item ? 'konversi' and (jsonb_typeof(v_item->'konversi') is distinct from 'number' or (v_item->>'konversi')::numeric < 0
       or (v_item->>'konversi')::numeric >= 1e10 or round((v_item->>'konversi')::numeric, 2) <> (v_item->>'konversi')::numeric) then
      perform public.lempar('PT400', format('%s: konversi harus angka ≥ 0 (maks 2 desimal)', v_ref), 'INPUT_001');
    end if;
    v_klik := coalesce((v_item->>'klik')::bigint, 0);
    v_tayang := coalesce((v_item->>'tayang')::bigint, 0);
    v_konv := coalesce((v_item->>'konversi')::numeric, 0);
    v_baris := v_baris || jsonb_build_object('tanggal', v_tgl, 'platform', v_plat, 'campaign', v_camp, 'biaya', v_biaya,
                                             'klik', v_klik, 'tayang', v_tayang, 'konversi', v_konv);
  end loop;

  -- 2) tulis: hapus campaign yang tidak dikirim untuk (tanggal, platform) di payload, lalu upsert
  with mas as (select * from jsonb_to_recordset(v_baris) as x(tanggal date, platform text, campaign text)),
  h as (
    delete from public.iklan_biaya b
     where (b.tanggal, b.platform) in (select distinct mas.tanggal, mas.platform from mas)
       and not exists (select 1 from mas where mas.tanggal = b.tanggal and mas.platform = b.platform and mas.campaign = b.campaign)
    returning 1)
  select count(*) into v_hapus from h;

  for v_tgl, v_plat, v_camp, v_biaya, v_klik, v_tayang, v_konv in
    select * from jsonb_to_recordset(v_baris)
      as x(tanggal date, platform text, campaign text, biaya numeric, klik bigint, tayang bigint, konversi numeric)
  loop
    select * into v_lama from public.iklan_biaya b where b.tanggal = v_tgl and b.platform = v_plat and b.campaign = v_camp for update;
    if not found then
      insert into public.iklan_biaya (tanggal, platform, campaign, biaya, klik, tayang, konversi, diisi_oleh)
      values (v_tgl, v_plat, v_camp, v_biaya, v_klik, v_tayang, v_konv, public.aktor());
      v_baru := v_baru + 1;
    elsif (v_lama.biaya, v_lama.klik::bigint, v_lama.tayang, v_lama.konversi) is distinct from (v_biaya, v_klik, v_tayang, v_konv) then
      update public.iklan_biaya set biaya = v_biaya, klik = v_klik, tayang = v_tayang, konversi = v_konv,
             diisi_pada = now(), diisi_oleh = public.aktor()
       where tanggal = v_tgl and platform = v_plat and campaign = v_camp;
      v_ubah := v_ubah + 1;
    else
      v_sama := v_sama + 1;
    end if;
  end loop;
  select min((x->>'tanggal')::date), max((x->>'tanggal')::date) into v_dari, v_sampai from jsonb_array_elements(v_baris) x;

  return jsonb_build_object('diproses', v_i + 1, 'baru', v_baru, 'diubah', v_ubah, 'sama', v_sama, 'dihapus', v_hapus,
                            'dari', v_dari, 'sampai', v_sampai);
end; $$;

-- ============================================================ lead BATAL bulan itu (dipakai angka & daftar id)
-- Perubahan tahap TERAKHIR ke BATAL per lead yang sekarang BATAL; impor = riwayat dari null (tanggal impor).
create or replace function public.pipeline_dasbor_batal(p_awal date, p_akhir date)
returns table (id text, pemilik bigint, alasan text, tanggal date, impor boolean, fu integer)
language sql stable security definer set search_path = '' as $$
  select l.id, l.pemilik, coalesce(l.alasan_batal, 'Tanpa alasan'), r.tgl, r.dari is null,
         (select count(*)::int from public.lead_aktivitas a
           where a.lead_id = l.id and a.jenis <> 'Catatan impor' and a.waktu <= r.waktu)
    from public.lead l
    cross join lateral (
      select public.wib_date(x.waktu) tgl, x.dari, x.waktu from public.lead_riwayat_tahap x
       where x.lead_id = l.id and x.ke = 'BATAL' order by x.waktu desc, x.id desc limit 1) r
   where l.tahap = 'BATAL' and r.tgl between p_awal and p_akhir
$$;

-- ============================================================ dasbor lanjutan (bagian 5–10 + kartu sales)
create or replace function public.inti_pipeline_dasbor_lanjut(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran  text := public.pipeline_peran_aktor();
  v_penuh  boolean;
  v_saya   bigint;
  v_hari   date := public.hari_ini_wib();
  v_awal   date;
  v_akhir  date;
  v_batas  date;
  v_awal_l date;
  v_senin  date;
  v_ga     date;   -- hari terakhir bulan itu yang punya data biaya Google
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  v_penuh := v_peran in ('admin', 'baca');
  v_saya := case when v_penuh then null else public.penilai() end;
  v_awal := public.pipeline_dasbor_bulan(p);
  v_akhir := (v_awal + interval '1 month')::date - 1;
  v_batas := least(v_hari, v_akhir);
  v_awal_l := (v_awal - interval '1 month')::date;

  -- ---------------------------------------------------------------- sales: hanya kartu miliknya
  if not v_penuh then
    return jsonb_build_object(
      'peran', 'sales', 'bulan', to_char(v_awal, 'YYYY-MM'), 'hari_ini', v_hari, 'sejak_bayar', v_hari - 89,
      'bayar_saya', (
        select jsonb_build_object('order', count(*), 'nilai', coalesce(sum(l.nilai_transaksi), 0),
                 'kosong', count(*) filter (where l.bayar_status is null),
                 'belum', count(*) filter (where l.bayar_status = 'BELUM'),
                 'dp', count(*) filter (where l.bayar_status = 'DP'),
                 'tua', count(*) filter (where v_hari - l.tanggal_sp > 30))
          from public.lead l
         where l.pemilik = v_saya and l.tahap = 'ORDER' and l.tanggal_sp > v_hari - 90
           and l.bayar_status is distinct from 'LUNAS'),
      'rapikan', (
        select jsonb_build_object('lead', count(*),
                 'nama_kosong', count(*) filter (where btrim(pg.nama) = '-'),
                 'sumber_lainnya', count(*) filter (where l.sumber = 'Lainnya'),
                 'batal', count(*) filter (where l.tahap = 'BATAL'))
          from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id
         where l.pemilik = v_saya and l.tanggal_masuk between v_awal and v_akhir));
  end if;

  -- ---------------------------------------------------------------- penuh (admin/baca)
  select max(b.tanggal) into v_ga from public.iklan_biaya b
   where b.platform = 'google' and b.tanggal between v_awal and v_batas;
  v_senin := v_batas - (extract(isodow from v_batas)::int - 1);

  return (
    with m as materialized (   -- lead masuk bulan itu
      select l.id, l.sumber, l.tahap, l.nilai_transaksi, l.sumber_bukti, l.tanggal_masuk, pg.nama
        from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id
       where l.tanggal_masuk between v_awal and v_akhir),
    bt as materialized (select * from public.pipeline_dasbor_batal(v_awal, v_akhir)),
    ord as materialized (      -- order bulan itu (tanggal SP)
      select l.id, l.pelanggan_id, l.kode, l.tanggal_sp, l.tanggal_masuk, l.nilai_transaksi, l.bayar_status,
             coalesce((select i.produk from public.lead_item i where i.lead_id = l.id order by i.id limit 1), 'Lainnya') produk
        from public.lead l where l.tahap = 'ORDER' and l.tanggal_sp between v_awal and v_akhir),
    ib as materialized (select * from public.iklan_biaya b where b.tanggal between v_awal and v_batas),
    pr as (                    -- produk pertama: lead masuk & order bulan itu
      select x.produk, sum(x.lead)::int lead, sum(x.ord)::int ord, sum(x.omzet) omzet from (
        select coalesce((select i.produk from public.lead_item i where i.lead_id = m.id order by i.id limit 1), 'Lainnya') produk,
               1 lead, 0 ord, 0::numeric omzet from m
        union all
        select o.produk, 0, 1, coalesce(o.nilai_transaksi, 0) from ord o) x
      group by x.produk),
    prl as (                   -- produk kecil (<5 lead, 0 order) digabung ke Lainnya
      select case when pr.produk <> 'Lainnya' and pr.lead < 5 and pr.ord = 0 then 'Lainnya' else pr.produk end produk,
             pr.produk asal, pr.lead, pr.ord, pr.omzet from pr)
    select jsonb_build_object(
      'peran', 'penuh', 'bulan', to_char(v_awal, 'YYYY-MM'), 'hari_ini', v_hari, 'batas', v_batas, 'sejak_bayar', v_hari - 89,
      -- 5 · sumber lead & biaya iklan
      'sumber', (
        select jsonb_agg(jsonb_build_object('sumber', s.sumber, 'lead', x.n, 'order', x.o, 'omzet', x.om)
                         order by x.n desc, s.urut)
          from unnest(array['Google Ads', 'Meta Ads', 'Website organik', 'Instagram/TikTok organik', 'WA langsung',
                            'Telepon', 'Referral', 'Repeat order', 'Lainnya']) with ordinality s(sumber, urut)
          cross join lateral (select count(*) n, count(*) filter (where m.tahap = 'ORDER') o,
                                     coalesce(sum(m.nilai_transaksi) filter (where m.tahap = 'ORDER'), 0) om
                                from m where m.sumber = s.sumber) x),
      'bukti', (
        select coalesce(jsonb_agg(jsonb_build_object('kelas', x.k, 'lead', x.n) order by x.k is null, x.n desc, x.k), '[]'::jsonb)
          from (select m.sumber_bukti k, count(*) n from m group by m.sumber_bukti) x),
      'iklan', jsonb_build_object(
        'sampai', v_ga,
        'diisi_pada', (select public.iso_utc(max(b.diisi_pada)) from public.iklan_biaya b),
        'google', (select jsonb_build_object('biaya', coalesce(sum(ib.biaya), 0), 'klik', coalesce(sum(ib.klik), 0),
                            'konversi', coalesce(sum(ib.konversi), 0))
                     from ib where ib.platform = 'google' and ib.tanggal <= coalesce(v_ga, v_batas)),
        'lead_google', (select jsonb_build_object('lead', count(*), 'order', count(*) filter (where m.tahap = 'ORDER'),
                                 'omzet', coalesce(sum(m.nilai_transaksi) filter (where m.tahap = 'ORDER'), 0))
                          from m where m.sumber = 'Google Ads' and v_ga is not null and m.tanggal_masuk <= v_ga),
        'kampanye', (select coalesce(jsonb_agg(jsonb_build_object('platform', x.platform, 'campaign', x.campaign, 'biaya', x.biaya,
                               'klik', x.klik, 'konversi', x.konversi, 'sampai', x.sampai) order by x.platform, x.biaya desc, x.campaign), '[]'::jsonb)
                       from (select ib.platform, ib.campaign, sum(ib.biaya) biaya, sum(ib.klik) klik, sum(ib.konversi) konversi,
                                    max(ib.tanggal) sampai
                               from ib group by ib.platform, ib.campaign) x)),
      -- 6 · pembayaran belum lunas (order SP 90 hari terakhir)
      'bayar', (
        select coalesce(jsonb_agg(jsonb_build_object('pemilik', x.pemilik, 'nama', mb.username, 'order', x.n, 'nilai', x.nilai,
                 'kosong', x.kosong, 'belum', x.belum, 'dp', x.dp, 'tua', x.tua) order by x.pemilik is null, mb.username), '[]'::jsonb)
          from (select l.pemilik, count(*) n, coalesce(sum(l.nilai_transaksi), 0) nilai,
                       count(*) filter (where l.bayar_status is null) kosong, count(*) filter (where l.bayar_status = 'BELUM') belum,
                       count(*) filter (where l.bayar_status = 'DP') dp, count(*) filter (where v_hari - l.tanggal_sp > 30) tua
                  from public.lead l
                 where l.tahap = 'ORDER' and l.tanggal_sp > v_hari - 90 and l.bayar_status is distinct from 'LUNAS'
                 group by l.pemilik) x
          left join public.members mb on mb.id = x.pemilik),
      -- 7 · pembatalan bulan itu
      'batal', jsonb_build_object(
        'lead', (select count(*) from bt where not bt.impor),
        'fu_kurang2', (select count(*) from bt where not bt.impor and bt.fu < 2),
        'impor', (select count(*) from bt where bt.impor),
        'alasan', (select coalesce(jsonb_agg(jsonb_build_object('alasan', x.alasan, 'lead', x.n) order by x.n desc, x.alasan), '[]'::jsonb)
                     from (select bt.alasan, count(*) n from bt where not bt.impor group by bt.alasan) x),
        'lonjakan', (select coalesce(jsonb_agg(jsonb_build_object('tanggal', x.tanggal, 'pemilik', x.pemilik, 'nama', mb.username,
                                       'lead', x.n) order by x.tanggal, mb.username), '[]'::jsonb)
                       from (select bt.tanggal, bt.pemilik, count(*) n from bt where not bt.impor
                              group by bt.tanggal, bt.pemilik having count(*) >= 5) x
                       left join public.members mb on mb.id = x.pemilik)),
      -- 8 · kualitas data
      'kualitas', jsonb_build_object(
        'lead', (select count(*) from m),
        'nama_kosong', (select count(*) from m where btrim(m.nama) = '-'),
        'sumber_lainnya', (select count(*) from m where m.sumber = 'Lainnya'),
        'tanpa_bukti', (select count(*) from m where coalesce(m.sumber_bukti, 'tanpa-sinyal') = 'tanpa-sinyal'),
        'order', (select count(*) from ord),
        'order_tanpa_bayar', (select count(*) from ord where ord.bayar_status is null),
        'dobel', (select jsonb_build_object('pelanggan', count(*), 'lead', coalesce(sum(x.n), 0))
                    from (select l.pelanggan_id, count(*) n from public.lead l
                           where l.tahap in ('BARU', 'PENAWARAN') group by l.pelanggan_id having count(*) > 1) x)),
      -- 9 · produk & pelanggan
      'produk', (
        select coalesce(jsonb_agg(jsonb_build_object('produk', x.produk, 'lead', x.lead, 'order', x.ord, 'omzet', x.omzet,
                 'gabungan', x.gabungan) order by x.produk = 'Lainnya', x.omzet desc, x.lead desc, x.produk), '[]'::jsonb)
          from (select prl.produk, sum(prl.lead)::int lead, sum(prl.ord)::int ord, sum(prl.omzet) omzet,
                       coalesce(jsonb_agg(prl.asal order by prl.asal) filter (where prl.asal <> prl.produk), '[]'::jsonb) gabungan
                  from prl group by prl.produk) x),
      'pelanggan_lama', (
        select jsonb_build_object('order', count(*), 'omzet', coalesce(sum(o.nilai_transaksi), 0))
          from ord o
         where exists (select 1 from public.lead x
                        where x.pelanggan_id = o.pelanggan_id and x.id <> o.id and x.tahap = 'ORDER'
                          and (coalesce(x.tanggal_sp, x.tanggal_masuk), x.kode) < (coalesce(o.tanggal_sp, o.tanggal_masuk), o.kode))),
      'tidur', (
        select jsonb_build_object('pernah', count(*), 'tidur', count(*) filter (where x.tidur),
                                  'nilai', coalesce(sum(x.nilai) filter (where x.tidur), 0))
          from (select l.pelanggan_id, sum(l.nilai_transaksi) filter (where l.tahap = 'ORDER') nilai,
                       max(l.tanggal_masuk) <= v_hari - 90 and count(*) filter (where l.tahap in ('BARU', 'PENAWARAN')) = 0 tidur
                  from public.lead l group by l.pelanggan_id
                 having count(*) filter (where l.tahap = 'ORDER') > 0) x),
      -- 10 · tren
      'minggu', (
        select jsonb_agg(jsonb_build_object('mulai', w.mulai::date, 'sampai', least(w.mulai::date + 6, v_batas),
                 'lead', (select count(*) from public.lead l where l.tanggal_masuk between w.mulai::date and least(w.mulai::date + 6, v_batas)),
                 'order', (select count(*) from public.lead l where l.tahap = 'ORDER'
                             and l.tanggal_sp between w.mulai::date and least(w.mulai::date + 6, v_batas)))
                 order by w.mulai)
          from generate_series(v_senin - 84, v_senin, interval '7 day') w(mulai)),
      'harian', jsonb_build_object(
        'bulan', (select coalesce(jsonb_agg(jsonb_build_object('tgl', extract(day from x.t)::int, 'omzet', x.om) order by x.t), '[]'::jsonb)
                    from (select l.tanggal_sp t, sum(l.nilai_transaksi) om from public.lead l
                           where l.tahap = 'ORDER' and l.tanggal_sp between v_awal and v_batas group by l.tanggal_sp) x),
        'lalu', (select coalesce(jsonb_agg(jsonb_build_object('tgl', extract(day from x.t)::int, 'omzet', x.om) order by x.t), '[]'::jsonb)
                   from (select l.tanggal_sp t, sum(l.nilai_transaksi) om from public.lead l
                          where l.tahap = 'ORDER' and l.tanggal_sp between v_awal_l and v_awal - 1 group by l.tanggal_sp) x))
    ) from (select 1) satu);
end; $$;

-- ============================================================ id lead di balik angka (superset Tahap 1)
-- Metrik Tahap 1 (pipeline_dasbor_lead) TIDAK berubah. Metrik baru (predikat sama dengan angka di atas):
--   bayar_belum_lunas  order SP 90 hari terakhir, bukan LUNAS        order_tanpa_bayar  order bulan itu, status bayar kosong
--   nama_kosong        lead masuk bulan itu, nama pelanggan "-"      sumber_lainnya     lead masuk bulan itu, sumber Lainnya
--   batal_masuk        lead masuk bulan itu yang sekarang BATAL      tanpa_bukti        lead masuk bulan itu tanpa bukti sumber
--   dibatalkan         lead BATAL bulan itu (tanpa status impor)     lead_dobel         lead terbuka milik pelanggan dengan >1 lead terbuka
--   pm_tanpa_nilai     lead PM terbuka tanpa nilai penawaran
create or replace function public.inti_pipeline_dasbor_ids(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran  text := public.pipeline_peran_aktor();
  v_penuh  boolean;
  v_metrik text := coalesce(p ->> 'metrik', '');
  v_tanpa  boolean := false;
  v_pem    bigint;
  v_hari   date := public.hari_ini_wib();
  v_awal   date;
  v_akhir  date;
  v_ids    text[];
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  if v_metrik not in ('terbuka90', 'lama', 'sentuh_basis', 'sentuh_cepat', 'fu_hari_ini', 'fu_telat', 'tanpa_jadwal',
                      'baru_tanpa_catatan', 'diam_0_7', 'diam_8_14', 'diam_15_30', 'diam_31', 'pm_terbuka',
                      'bayar_belum_lunas', 'order_tanpa_bayar', 'nama_kosong', 'sumber_lainnya', 'batal_masuk',
                      'tanpa_bukti', 'dibatalkan', 'lead_dobel', 'pm_tanpa_nilai') then
    perform public.lempar('PT400', 'Metrik dasbor tidak dikenal', 'INPUT_001');
  end if;
  v_penuh := v_peran in ('admin', 'baca');
  if not v_penuh then
    v_pem := public.penilai();
  elsif p ->> 'pemilik' = 'tanpa' then
    v_tanpa := true;
  elsif coalesce(p ->> 'pemilik', '') ~ '^[0-9]+$' then
    v_pem := (p ->> 'pemilik')::bigint;
  elsif nullif(p ->> 'pemilik', '') is not null then
    perform public.lempar('PT400', 'pemilik harus id anggota atau "tanpa"', 'INPUT_001');
  end if;
  v_awal := public.pipeline_dasbor_bulan(p);
  v_akhir := (v_awal + interval '1 month')::date - 1;

  if v_metrik in ('terbuka90', 'lama', 'sentuh_basis', 'sentuh_cepat', 'fu_hari_ini', 'fu_telat', 'tanpa_jadwal',
                  'baru_tanpa_catatan', 'diam_0_7', 'diam_8_14', 'diam_15_30', 'diam_31', 'pm_terbuka') then
    select coalesce(array_agg(d.id order by d.diam desc, d.id), '{}') into v_ids
      from public.pipeline_dasbor_lead(v_hari, v_awal, v_akhir) d
     where (case when v_tanpa then d.pemilik is null when v_pem is not null then d.pemilik = v_pem else true end)
       and case v_metrik
         when 'terbuka90' then d.basis90
         when 'lama' then d.terbuka and not d.basis90
         when 'sentuh_basis' then d.sentuh_basis
         when 'sentuh_cepat' then d.sentuh_cepat
         when 'fu_hari_ini' then d.basis90 and d.fu_berikutnya = v_hari
         when 'fu_telat' then d.basis90 and d.fu_berikutnya < v_hari
         when 'tanpa_jadwal' then d.basis90 and d.fu_berikutnya is null
         when 'baru_tanpa_catatan' then d.basis90 and d.baru_tanpa_catatan
         when 'diam_0_7' then d.basis90 and d.diam <= 7
         when 'diam_8_14' then d.basis90 and d.diam between 8 and 14
         when 'diam_15_30' then d.basis90 and d.diam between 15 and 30
         when 'diam_31' then d.basis90 and d.diam > 30
         when 'pm_terbuka' then d.terbuka and d.pm
       end;
  elsif v_metrik = 'dibatalkan' then
    select coalesce(array_agg(b.id order by b.tanggal desc, b.id), '{}') into v_ids
      from public.pipeline_dasbor_batal(v_awal, v_akhir) b
     where not b.impor
       and (case when v_tanpa then b.pemilik is null when v_pem is not null then b.pemilik = v_pem else true end);
  else
    select coalesce(array_agg(l.id order by l.tanggal_masuk desc, l.id), '{}') into v_ids
      from public.lead l join public.pelanggan pg on pg.id = l.pelanggan_id
     where (case when v_tanpa then l.pemilik is null when v_pem is not null then l.pemilik = v_pem else true end)
       and case v_metrik
         when 'bayar_belum_lunas' then l.tahap = 'ORDER' and l.tanggal_sp > v_hari - 90 and l.bayar_status is distinct from 'LUNAS'
         when 'order_tanpa_bayar' then l.tahap = 'ORDER' and l.tanggal_sp between v_awal and v_akhir and l.bayar_status is null
         when 'nama_kosong' then l.tanggal_masuk between v_awal and v_akhir and btrim(pg.nama) = '-'
         when 'sumber_lainnya' then l.tanggal_masuk between v_awal and v_akhir and l.sumber = 'Lainnya'
         when 'batal_masuk' then l.tanggal_masuk between v_awal and v_akhir and l.tahap = 'BATAL'
         when 'tanpa_bukti' then l.tanggal_masuk between v_awal and v_akhir and coalesce(l.sumber_bukti, 'tanpa-sinyal') = 'tanpa-sinyal'
         when 'lead_dobel' then l.tahap in ('BARU', 'PENAWARAN')
           and (select count(*) from public.lead x where x.pelanggan_id = l.pelanggan_id and x.tahap in ('BARU', 'PENAWARAN')) > 1
         when 'pm_tanpa_nilai' then l.tahap in ('BARU', 'PENAWARAN') and l.nilai_penawaran is null
           and exists (select 1 from public.lead_item i where i.lead_id = l.id and i.produk = 'Pallet Mesh')
       end;
  end if;
  return jsonb_build_object('metrik', v_metrik, 'total', cardinality(v_ids), 'ids', to_jsonb(v_ids));
end; $$;

-- ============================================================ bungkus
create or replace function public.web_pipeline_dasbor_lanjut(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_dasbor_lanjut(coalesce(p, '{}'::jsonb)); end; $$;
-- tempel CSV oleh admin Pipeline (peran dicek di inti)
create or replace function public.web_pipeline_biaya_iklan_set(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_biaya_iklan_set(coalesce(p, '{}'::jsonb)); end; $$;
-- agent (Edge POST /x/pipeline/biaya-iklan, scope tulis; token owner/bot)
create or replace function public.x_pipeline_biaya_iklan_set(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); return public.inti_pipeline_biaya_iklan_set(coalesce(p, '{}'::jsonb)); end; $$;

-- ============================================================ hak
revoke all on function
  public.inti_pipeline_biaya_iklan_set(jsonb), public.pipeline_dasbor_batal(date, date),
  public.inti_pipeline_dasbor_lanjut(jsonb), public.inti_pipeline_dasbor_ids(jsonb),
  public.web_pipeline_dasbor_lanjut(jsonb), public.web_pipeline_biaya_iklan_set(jsonb),
  public.x_pipeline_biaya_iklan_set(bigint, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_dasbor_lanjut(jsonb), public.web_pipeline_biaya_iklan_set(jsonb) to authenticated;
grant execute on function public.x_pipeline_biaya_iklan_set(bigint, jsonb) to service_role;
