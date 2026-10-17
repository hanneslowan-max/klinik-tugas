-- Modul Pipeline — Database pelanggan & log repeat order (permintaan Hannes 17 Okt 2026: "lead yang diinput dijadikan
-- database, jadi kalau ada customer yang sama repeat order, bisa ketahuan log-nya").
--
-- Tabel pelanggan sudah ada sejak 20261011120000, tetapi data impor sheet terpecah (17 Okt: 1.856 pelanggan untuk 2.062
-- lead; 48 nama dobel beda ejaan, 56 nomor HP di >1 pelanggan, 458 nama semu "-"/"Perorangan"/"Pribadi"). Di sini:
--   * kunci nama ternormalisasi (pipeline_nama_kunci: tanpa PT/CV/UD/PD/TB/Tbk, tanda baca & spasi) + deteksi nama semu
--     (pipeline_nama_semu) — perorangan bernama semu dikenali lewat nomor HP-nya, bukan nama. Disimpan sebagai kolom
--     terhitung pelanggan.kunci / pelanggan.semu (indeks) supaya daftar & saran tidak menghitung ulang regex per baris;
--   * layar Pelanggan: web_pipeline_pelanggan_daftar (statistik lead/order per pelanggan) & web_pipeline_pelanggan
--     (kontak, ringkasan, log semua lead/order, riwayat gabung, saran "mungkin sama" untuk admin);
--   * web_pipeline_pelanggan_ubah (nama/kota/jenis/catatan; admin & rep);
--   * gabung pelanggan dobel (admin): lead & kontak sumber dipindah ke tujuan, pelanggan sumber dihapus, SETIAP gabung
--     tercatat di pelanggan_gabung (salinan baris sumber + id lead/kontak yang dipindah) sehingga bisa DIBATALKAN;
--     saran dobel (nama sama / nomor HP sama / nama mirip) + "bukan dobel" (pelanggan_dobel_abaikan);
--   * field baru `order_sebelumnya` di baris ringkas lead (j_pipeline_lead_ringkas & _banyak, tes 23 menjaga keduanya
--     sama): jumlah lead lain pelanggan yang sama yang sudah ORDER dan masuk lebih dulu → label "Repeat" di daftar;
--   * web_pipeline_pelanggan_cari lebih pintar: cocok kunci nama ("PT. Berkah Nidatama" = "berkah nidatama"), nama semu
--     tidak ikut disarankan kecuali nomornya sama, hasil membawa jumlah lead/order, dan batas 15 kini benar-benar berlaku.
-- Sumber lead TIDAK diubah otomatis menjadi "Repeat order": sumber = kanal (Google Ads dst.) yang dicocokkan Agen Data
-- Harian dengan konversi iklan; status repeat dihitung dari riwayat.
--
-- ADITIF & aman di produksi: 2 tabel baru, fungsi baru, field JSON bertambah saja. Migrasi ini TIDAK mengubah data.
-- Penggabungan data lama = pipeline_pelanggan_gabung_otomatis(aktor, jalankan) yang dijalankan terpisah dengan izin
-- Hannes lewat alat/sql-proyek.sh (false = uji kering: dijalankan lalu di-rollback, laporannya sama persis).

-- ============================================================ kunci nama & nama semu
-- 'PT. Berkah Nidatama' / 'berkah nidatama, PT' / 'CV Berkah Nida-Tama' → 'berkahnidatama'. Kosong → null.
create or replace function public.pipeline_nama_kunci(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(p, '')), '^\s*(pt|cv|ud|pd|tb)\M\.?', ''),
             '[,\s]+(pt|cv|tbk|persero)\.?\s*$', ''),
           '[^a-z0-9]', '', 'g'), '')
$$;

-- Nama pengisi (bukan identitas): '-', 'Perorangan', 'Pribadi', '(Tanpa nama perusahaan)', angka saja, dst.
create or replace function public.pipeline_nama_semu(p text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select coalesce(public.pipeline_nama_kunci(p), '') in (
           '', 'perorangan', 'perseorangan', 'pribadi', 'personal', 'individu', 'umum', 'tanpanamaperusahaan',
           'tanpanama', 'tidakada', 'none', 'na', 'nn')
      or coalesce(public.pipeline_nama_kunci(p), '') ~ '^[0-9]+$'
$$;

-- Kolom terhitung (STORED): dihitung sekali saat nama ditulis. Bila aturan kunci/semu di atas kelak diubah, hitung ulang
-- dengan `update public.pelanggan set nama = nama` di migrasi yang mengubahnya.
alter table public.pelanggan
  add column if not exists kunci text generated always as (public.pipeline_nama_kunci(nama)) stored,
  add column if not exists semu boolean generated always as (public.pipeline_nama_semu(nama)) stored;
create index if not exists pelanggan_kunci_idx on public.pelanggan (kunci);

-- ============================================================ log gabung & saran yang diabaikan
create table public.pelanggan_gabung (
  id              bigint generated always as identity primary key,
  ke_id           text not null,                 -- tujuan (tanpa FK: log tetap ada walau tujuan kelak ikut digabung)
  dari_id         text not null,                 -- sumber (dihapus saat gabung, dipulihkan saat batal)
  dari            jsonb not null,                -- salinan baris pelanggan sumber (tanpa kolom turunan cari/kunci/semu)
  lead_ids        text[] not null default '{}',  -- lead yang dipindah
  kontak_ids      text[] not null default '{}',  -- kontak yang dipindah
  ke_kota_diisi   boolean not null default false, -- kota tujuan kosong lalu diisi dari sumber (dikembalikan saat batal)
  cara            text not null check (cara in ('manual', 'otomatis')),
  alasan          text check (alasan is null or alasan in ('nama', 'telepon', 'mirip')),
  oleh            bigint references public.members (id),
  waktu           timestamptz not null default now(),
  dibatalkan_oleh bigint references public.members (id),
  dibatalkan_pada timestamptz
);
create index pelanggan_gabung_ke_idx on public.pelanggan_gabung (ke_id);
create index pelanggan_gabung_dari_idx on public.pelanggan_gabung (dari_id);

-- Saran dobel yang ditandai "bukan dobel". kunci = alasan:id1,id2,… (urut) → anggota kelompok berubah = saran muncul lagi.
create table public.pelanggan_dobel_abaikan (
  kunci text primary key,
  oleh  bigint references public.members (id),
  waktu timestamptz not null default now()
);

-- Hanya dibaca/ditulis fungsi SECURITY DEFINER (tanpa policy = tertutup untuk klien).
alter table public.pelanggan_gabung enable row level security;
alter table public.pelanggan_dobel_abaikan enable row level security;
revoke all on public.pelanggan_gabung, public.pelanggan_dobel_abaikan from public, anon, authenticated, service_role;
revoke all on sequence public.pelanggan_gabung_id_seq from public, anon, authenticated, service_role;

-- ============================================================ pembantu
-- Id pelanggan sekarang: ikuti rantai gabung yang belum dibatalkan (A→B→C). Null bila tidak ada.
create or replace function public.pipeline_pelanggan_akhir(p_id text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v text := p_id; v_ke text; i int := 0;
begin
  while v is not null and not exists (select 1 from public.pelanggan where id = v) and i < 50 loop
    select g.ke_id into v_ke from public.pelanggan_gabung g
     where g.dari_id = v and g.dibatalkan_pada is null order by g.id desc limit 1;
    v := v_ke;
    i := i + 1;
  end loop;
  return v;
end; $$;

-- Statistik lead per pelanggan (p_ids null = semua pelanggan yang punya lead). Tanggal order = tanggal SP (atau tanggal
-- masuk bila SP kosong). Order yang dibatalkan customer (tahap BATAL) tidak dihitung sebagai order.
create or replace function public.pipeline_pelanggan_stat(p_ids text[])
returns table (pelanggan_id text, jml_lead int, jml_order int, jml_batal int, jml_aktif int, nilai_order bigint,
               lead_pertama date, lead_terakhir date, order_pertama date, order_terakhir date, produk text[])
language sql stable security definer set search_path = '' as $$
  with l as (select * from public.lead where p_ids is null or pelanggan_id = any (p_ids)),
  pr as (select l.pelanggan_id, array_agg(distinct i.produk order by i.produk) as produk
           from l join public.lead_item i on i.lead_id = l.id group by l.pelanggan_id)
  select l.pelanggan_id,
         count(*)::int,
         (count(*) filter (where l.tahap = 'ORDER'))::int,
         (count(*) filter (where l.tahap = 'BATAL'))::int,
         (count(*) filter (where l.tahap in ('BARU', 'PENAWARAN')))::int,
         coalesce(sum(l.nilai_transaksi) filter (where l.tahap = 'ORDER'), 0)::bigint,
         min(l.tanggal_masuk), max(l.tanggal_masuk),
         min(coalesce(l.tanggal_sp, l.tanggal_masuk)) filter (where l.tahap = 'ORDER'),
         max(coalesce(l.tanggal_sp, l.tanggal_masuk)) filter (where l.tahap = 'ORDER'),
         coalesce(pr.produk, '{}')
    from l left join pr on pr.pelanggan_id = l.pelanggan_id
   group by l.pelanggan_id, pr.produk
$$;

-- Satu kartu pelanggan untuk daftar/saran (bentuk sama di semua tempat). p_mask = sembunyikan PIC (peran 'baca', §6).
-- Sengaja TANPA security definer / SET: ekspresi murni atas argumennya (tanpa akses tabel), jadi di-inline planner ke
-- kueri pemanggil (semuanya SECURITY DEFINER dengan search_path kosong) — daftar ±1.900 pelanggan tanpa ±1.900 panggilan.
create or replace function public.j_pipeline_pelanggan_ringkas(p_pg public.pelanggan, p_s jsonb, p_pic text, p_mask boolean)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', p_pg.id, 'nama', p_pg.nama, 'semu', p_pg.semu, 'jenis', p_pg.jenis, 'kota', p_pg.kota,
    'pic', case when p_mask then null else p_pic end,
    'jml_lead', coalesce((p_s ->> 'jml_lead')::int, 0), 'jml_order', coalesce((p_s ->> 'jml_order')::int, 0),
    'jml_batal', coalesce((p_s ->> 'jml_batal')::int, 0), 'jml_aktif', coalesce((p_s ->> 'jml_aktif')::int, 0),
    'nilai_order', coalesce((p_s ->> 'nilai_order')::bigint, 0),
    'lead_pertama', p_s -> 'lead_pertama', 'lead_terakhir', p_s -> 'lead_terakhir',
    'order_pertama', p_s -> 'order_pertama', 'order_terakhir', p_s -> 'order_terakhir',
    'produk', coalesce(p_s -> 'produk', '[]'::jsonb))
$$;

-- PIC pertama (bernama) per pelanggan — nama tampilan untuk perorangan bernama semu.
create or replace function public.pipeline_pelanggan_pic(p_ids text[])
returns table (pelanggan_id text, nama text)
language sql stable security definer set search_path = '' as $$
  select distinct on (k.pelanggan_id) k.pelanggan_id, btrim(k.nama)
    from public.kontak k
   where (p_ids is null or k.pelanggan_id = any (p_ids)) and nullif(btrim(coalesce(k.nama, '')), '') is not null
   order by k.pelanggan_id, k.dibuat_pada, k.id
$$;

-- ============================================================ baca: daftar pelanggan
-- p: q (nama/kota/kunci nama; PIC & nomor HP hanya admin/rep), saring semua|order|repeat|aktif,
--    urut terakhir|order|nilai|nama. Semua pelanggan yang cocok dikembalikan (±1.900, dirender bertahap di web).
create or replace function public.inti_pipeline_pelanggan_daftar(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_mask boolean;
  v_q text := nullif(btrim(coalesce(p->>'q', '')), '');
  v_saring text := coalesce(nullif(p->>'saring', ''), 'semua');
  v_urut text := coalesce(nullif(p->>'urut', ''), 'terakhir');
  v_pola text; v_kunci text; v_telp text;
  v_hasil jsonb;
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  if v_saring not in ('semua', 'order', 'repeat', 'aktif') then
    perform public.lempar('PT400', format('Saringan tidak dikenal: %s', v_saring), 'INPUT_001');
  end if;
  if v_urut not in ('terakhir', 'order', 'nilai', 'nama') then
    perform public.lempar('PT400', format('Urutan tidak dikenal: %s', v_urut), 'INPUT_001');
  end if;
  v_mask := v_peran = 'baca';
  v_pola := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_kunci := public.pipeline_nama_kunci(v_q);
  if length(v_kunci) < 3 then v_kunci := null; end if;
  v_telp := case when not v_mask then public.pipeline_telp_norm(v_q) end;

  with s as materialized (select * from public.pipeline_pelanggan_stat(null)),
  pic as materialized (select * from public.pipeline_pelanggan_pic(null)),
  b as (
    select pg, to_jsonb(s) as sj, pic.nama as pic, pg.semu,
           coalesce(s.jml_order, 0) as jml_order, coalesce(s.nilai_order, 0) as nilai_order,
           greatest(s.lead_terakhir, s.order_terakhir) as terakhir
      from public.pelanggan pg
        left join s on s.pelanggan_id = pg.id
        left join pic on pic.pelanggan_id = pg.id
     where (v_q is null
            or pg.nama ilike v_pola or pg.kota ilike v_pola
            or (v_kunci is not null and pg.kunci like '%' || v_kunci || '%')
            or (not v_mask and exists (select 1 from public.kontak k
                                        where k.pelanggan_id = pg.id
                                          and (k.nama ilike v_pola or (v_telp is not null and k.telepon = v_telp)))))
       and (v_saring = 'semua'
            or (v_saring = 'order' and coalesce(s.jml_order, 0) >= 1)
            or (v_saring = 'repeat' and coalesce(s.jml_order, 0) >= 2)
            or (v_saring = 'aktif' and coalesce(s.jml_aktif, 0) >= 1))
  )
  select jsonb_build_object(
    'total', count(*),
    'items', coalesce(jsonb_agg(public.j_pipeline_pelanggan_ringkas(b.pg, b.sj, b.pic, v_mask) order by
               case when v_urut = 'nama' then lower(case when b.semu then coalesce(case when v_mask then null else b.pic end, '~') else (b.pg).nama end) end,
               case when v_urut = 'order' then b.jml_order end desc,
               case when v_urut in ('order', 'nilai') then b.nilai_order end desc,
               b.terakhir desc nulls last, (b.pg).id), '[]'::jsonb))
    into v_hasil
    from b;
  return v_hasil;
end; $$;

-- ============================================================ baca: detail pelanggan + log lead/order
create or replace function public.inti_pipeline_pelanggan(p_id text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_peran text := public.pipeline_peran_aktor();
  v_mask boolean;
  v_pg public.pelanggan;
  v_akhir text; v_ids text[]; v_kunci text; v_semu boolean;
begin
  if v_peran is null then perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001'); end if;
  v_mask := v_peran = 'baca';
  select * into v_pg from public.pelanggan where id = p_id;
  if not found then
    -- tautan lama ke pelanggan yang sudah digabung → beri tahu tujuannya (web mengalihkan)
    v_akhir := public.pipeline_pelanggan_akhir(p_id);
    if v_akhir is not null then return jsonb_build_object('digabung_ke', v_akhir); end if;
    perform public.lempar('PT404', 'Pelanggan tidak ditemukan', 'ITEM_013');
  end if;
  select array_agg(l.id order by l.tanggal_masuk desc, l.kode desc) into v_ids from public.lead l where l.pelanggan_id = v_pg.id;
  v_kunci := v_pg.kunci;
  v_semu := v_pg.semu;

  return jsonb_build_object(
    'pelanggan', jsonb_build_object('id', v_pg.id, 'nama', v_pg.nama, 'semu', v_semu, 'jenis', v_pg.jenis,
                                    'kota', v_pg.kota, 'catatan', v_pg.catatan,
                                    'pic', case when v_mask then null else (select c.nama from public.pipeline_pelanggan_pic(array[v_pg.id]) c) end),
    'kontak', case when v_mask then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', k.id, 'nama', k.nama, 'telepon', coalesce(k.telepon_tampil, k.telepon), 'jabatan', k.jabatan,
               'jml_lead', (select count(*) from public.lead l where l.kontak_id = k.id)) order by k.dibuat_pada, k.id), '[]'::jsonb)
        from public.kontak k where k.pelanggan_id = v_pg.id) end,
    'kontak_disembunyikan', v_mask,
    'ringkas', (
      select jsonb_build_object(
        'jml_lead', coalesce(s.jml_lead, 0), 'jml_order', coalesce(s.jml_order, 0), 'jml_batal', coalesce(s.jml_batal, 0),
        'jml_aktif', coalesce(s.jml_aktif, 0), 'nilai_order', coalesce(s.nilai_order, 0),
        'lead_pertama', s.lead_pertama, 'lead_terakhir', s.lead_terakhir,
        'order_pertama', s.order_pertama, 'order_terakhir', s.order_terakhir, 'produk', coalesce(s.produk, '{}'),
        -- rata-rata jarak antar order (hari), bila ≥2 order
        'jeda_order_hari', (select round(avg(d))::int from (
            select coalesce(l.tanggal_sp, l.tanggal_masuk)
                   - lag(coalesce(l.tanggal_sp, l.tanggal_masuk)) over (order by coalesce(l.tanggal_sp, l.tanggal_masuk), l.kode) as d
              from public.lead l where l.pelanggan_id = v_pg.id and l.tahap = 'ORDER') x where d is not null))
        from (select 1) satu left join public.pipeline_pelanggan_stat(array[v_pg.id]) s on true),
    'leads', (select coalesce(jsonb_agg(b.j order by b.n), '[]'::jsonb)
                from public.j_pipeline_lead_ringkas_banyak(coalesce(v_ids, '{}'::text[])) b),
    'gabung', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', g.id, 'dari_id', g.dari_id, 'dari_nama', g.dari ->> 'nama', 'jml_lead', cardinality(g.lead_ids),
                 'jml_kontak', cardinality(g.kontak_ids), 'cara', g.cara, 'alasan', g.alasan,
                 'oleh_nama', mo.username, 'waktu', public.iso_utc(g.waktu),
                 'dibatalkan_pada', public.iso_utc(g.dibatalkan_pada), 'dibatalkan_oleh_nama', mb.username)
                 order by g.waktu desc, g.id desc), '[]'::jsonb)
                 from public.pelanggan_gabung g
                   left join public.members mo on mo.id = g.oleh
                   left join public.members mb on mb.id = g.dibatalkan_oleh
                where g.ke_id = v_pg.id),
    -- saran "mungkin pelanggan yang sama" (hanya admin: yang boleh menggabungkan)
    'mungkin_sama', case when v_peran <> 'admin' then '[]'::jsonb else (
      with c as (
        select k2.pelanggan_id as id, 'telepon'::text as alasan, 2 as prio
          from public.kontak k1 join public.kontak k2 on k2.telepon = k1.telepon and k2.pelanggan_id <> k1.pelanggan_id
         where k1.pelanggan_id = v_pg.id and k1.telepon is not null
        union all
        select pg.id, 'nama', 1 from public.pelanggan pg
         where not v_semu and pg.id <> v_pg.id and pg.kunci = v_kunci
        union all
        select pg.id, 'mirip', 3 from public.pelanggan pg
         where not v_semu and length(v_kunci) >= 5 and pg.id <> v_pg.id and not pg.semu
           and (left(pg.kunci, 2) = left(v_kunci, 2) or right(pg.kunci, 3) = right(v_kunci, 3))   -- blok, lihat pipeline_dobel_kelompok
           and length(pg.kunci) >= 5 and pg.kunci <> v_kunci and extensions.similarity(pg.kunci, v_kunci) >= 0.6
      ), u as (
        select distinct on (c.id) c.id, c.alasan, c.prio from c
         where not exists (select 1 from public.pelanggan_dobel_abaikan a
                            where split_part(a.kunci, ':', 1) = c.alasan
                              and string_to_array(split_part(a.kunci, ':', 2), ',') @> array[v_pg.id, c.id])
         order by c.id, c.prio
      ), s as (select * from public.pipeline_pelanggan_stat(array(select u.id from u))),
      pic as (select * from public.pipeline_pelanggan_pic(array(select u.id from u)))
      select coalesce(jsonb_agg(public.j_pipeline_pelanggan_ringkas(pg, to_jsonb(s), pic.nama, false)
                                  || jsonb_build_object('alasan', u.alasan) order by u.prio, s.jml_lead desc nulls last, pg.id), '[]'::jsonb)
        from u join public.pelanggan pg on pg.id = u.id
          left join s on s.pelanggan_id = u.id
          left join pic on pic.pelanggan_id = u.id) end,
    'boleh_ubah', v_peran in ('admin', 'rep'),
    'boleh_gabung', v_peran = 'admin');
end; $$;

-- ============================================================ tulis: ubah data pelanggan (admin & rep)
create or replace function public.inti_pipeline_pelanggan_ubah(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id text := nullif(p->>'pelanggan_id', '');
begin
  if public.pipeline_peran_aktor() not in ('admin', 'rep') then
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

-- ============================================================ gabung pelanggan
-- Internal: pindahkan SEMUA lead & kontak p_dari → p_ke, catat log, hapus p_dari. Kota tujuan yang kosong diisi kota
-- sumber. Nama tujuan TIDAK diubah di sini (pilihan admin, di inti_pipeline_pelanggan_gabung).
create or replace function public.pipeline_pelanggan_gabung_satu(p_ke text, p_dari text, p_cara text, p_alasan text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_ke public.pelanggan; v_dari public.pelanggan; v_leads text[]; v_kontak text[]; v_isi_kota boolean; v_id bigint;
begin
  if p_ke is not distinct from p_dari then
    perform public.lempar('PT400', 'Pelanggan tujuan sama dengan yang digabungkan', 'INPUT_001');
  end if;
  select * into v_ke from public.pelanggan where id = p_ke for update;
  if not found then perform public.lempar('PT404', 'Pelanggan tujuan tidak ditemukan', 'ITEM_013'); end if;
  select * into v_dari from public.pelanggan where id = p_dari for update;
  if not found then perform public.lempar('PT404', format('Pelanggan %s tidak ditemukan (mungkin sudah digabung)', p_dari), 'ITEM_013'); end if;

  select coalesce(array_agg(l.id order by l.id), '{}') into v_leads from public.lead l where l.pelanggan_id = p_dari;
  select coalesce(array_agg(k.id order by k.id), '{}') into v_kontak from public.kontak k where k.pelanggan_id = p_dari;
  update public.kontak set pelanggan_id = p_ke where pelanggan_id = p_dari;
  update public.lead set pelanggan_id = p_ke where pelanggan_id = p_dari;
  v_isi_kota := v_ke.kota is null and v_dari.kota is not null;
  if v_isi_kota then update public.pelanggan set kota = v_dari.kota where id = p_ke; end if;
  insert into public.pelanggan_gabung (ke_id, dari_id, dari, lead_ids, kontak_ids, ke_kota_diisi, cara, alasan, oleh)
    values (p_ke, p_dari, to_jsonb(v_dari) - array['cari', 'kunci', 'semu'], v_leads, v_kontak, v_isi_kota, p_cara, p_alasan, public.aktor())
    returning id into v_id;
  delete from public.pelanggan where id = p_dari;
  return v_id;
end; $$;

-- p: ke_id, dari_ids[] (1–20), nama (opsional: nama baru tujuan), alasan (opsional: nama|telepon|mirip). Admin saja.
create or replace function public.inti_pipeline_pelanggan_gabung(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ke text := nullif(p->>'ke_id', ''); v_dari text; v_nama text := nullif(btrim(coalesce(p->>'nama', '')), '');
begin
  if public.pipeline_peran_aktor() is distinct from 'admin' then
    perform public.lempar('PT403', 'Hanya admin Pipeline yang boleh menggabungkan pelanggan', 'ACCESS_001');
  end if;
  if v_ke is null then perform public.lempar('PT400', 'Pelanggan tujuan wajib dipilih', 'INPUT_001'); end if;
  if jsonb_typeof(p->'dari_ids') is distinct from 'array' or jsonb_array_length(p->'dari_ids') < 1 then
    perform public.lempar('PT400', 'Pilih minimal 1 pelanggan yang digabungkan', 'INPUT_001');
  end if;
  if jsonb_array_length(p->'dari_ids') > 20 then
    perform public.lempar('PT400', 'Maksimal 20 pelanggan sekali gabung', 'INPUT_001');
  end if;
  if nullif(p->>'alasan', '') is not null and p->>'alasan' not in ('nama', 'telepon', 'mirip') then
    perform public.lempar('PT400', 'Alasan gabung tidak sah', 'INPUT_001');
  end if;
  if length(v_nama) > 200 then perform public.lempar('PT400', 'Nama terlalu panjang (≤200 karakter)', 'INPUT_001'); end if;
  for v_dari in select distinct x from jsonb_array_elements_text(p->'dari_ids') x order by 1 loop
    perform public.pipeline_pelanggan_gabung_satu(v_ke, v_dari, 'manual', nullif(p->>'alasan', ''));
  end loop;
  if v_nama is not null then update public.pelanggan set nama = v_nama where id = v_ke; end if;
  return public.inti_pipeline_pelanggan(v_ke);
end; $$;

-- p: gabung_id. Pulihkan pelanggan sumber (id sama) + kembalikan lead/kontak yang dulu dipindah DAN masih berada di
-- pelanggan tujuan (atau penerusnya bila tujuan kelak digabung lagi). Lead baru milik tujuan tidak tersentuh. Admin saja.
create or replace function public.inti_pipeline_pelanggan_gabung_batal(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_g public.pelanggan_gabung; v_akhir text;
begin
  if public.pipeline_peran_aktor() is distinct from 'admin' then
    perform public.lempar('PT403', 'Hanya admin Pipeline yang boleh membatalkan gabung', 'ACCESS_001');
  end if;
  select * into v_g from public.pelanggan_gabung where id = nullif(p->>'gabung_id', '')::bigint for update;
  if not found then perform public.lempar('PT404', 'Catatan gabung tidak ditemukan', 'ITEM_013'); end if;
  if v_g.dibatalkan_pada is not null then
    perform public.lempar('PT409', 'Penggabungan ini sudah dibatalkan', 'KONFLIK_001');
  end if;
  if exists (select 1 from public.pelanggan where id = v_g.dari_id) then
    perform public.lempar('PT409', 'Pelanggan asal sudah ada lagi', 'KONFLIK_001');
  end if;
  v_akhir := public.pipeline_pelanggan_akhir(v_g.ke_id);

  insert into public.pelanggan (id, nama, jenis, kota, catatan, dibuat_oleh)
    select r.id, r.nama, r.jenis, r.kota, r.catatan, r.dibuat_oleh
      from jsonb_populate_record(null::public.pelanggan, v_g.dari) r;
  if v_akhir is not null then
    update public.kontak set pelanggan_id = v_g.dari_id where id = any (v_g.kontak_ids) and pelanggan_id = v_akhir;
    update public.lead set pelanggan_id = v_g.dari_id where id = any (v_g.lead_ids) and pelanggan_id = v_akhir;
  end if;
  if v_g.ke_kota_diisi then
    update public.pelanggan set kota = null where id = v_g.ke_id and kota is not distinct from v_g.dari ->> 'kota';
  end if;
  update public.pelanggan_gabung set dibatalkan_pada = now(), dibatalkan_oleh = public.aktor() where id = v_g.id;
  return public.inti_pipeline_pelanggan(v_g.dari_id);
end; $$;

-- ============================================================ saran dobel (admin)
-- Kelompok: 'nama' (kunci nama sama, bukan nama semu), 'telepon' (nomor HP sama di >1 pelanggan), 'mirip' (pasangan nama
-- mirip ≥0,6 trigram, beda kunci, panjang ≥5). Kelompok yang isinya bagian dari kelompok berprioritas lebih tinggi, atau
-- ditandai "bukan dobel", tidak ditampilkan.
-- 'mirip' hanya membandingkan pasangan yang 2 huruf awal ATAU 3 huruf akhir kuncinya sama (pemblokiran): semua pasangan
-- ±1 juta perbandingan (lokal 2,4 dtk), blok 0,4 dtk; di produksi 17 Okt blok menemukan 30 dari 30 pasangan yang sama
-- dengan perbandingan penuh. Indeks trigram (%) tidak membantu: lokal 2,7 dtk.
create or replace function public.pipeline_dobel_kelompok()
returns table (alasan text, prio int, ids text[])
language sql stable security definer set search_path = '' as $$
  with k as materialized (select pg.id, pg.kunci from public.pelanggan pg where not pg.semu and length(pg.kunci) >= 5),
  g as (
    select 'nama'::text as alasan, 1 as prio, array_agg(pg.id order by pg.id) as ids
      from public.pelanggan pg where not pg.semu group by pg.kunci having count(*) > 1
    union all
    select 'telepon', 2, array_agg(distinct kt.pelanggan_id order by kt.pelanggan_id)
      from public.kontak kt where kt.telepon is not null group by kt.telepon having count(distinct kt.pelanggan_id) > 1
    union all
    select 'mirip', 3, array[c.ia, c.ib] from (
      select a.id as ia, b.id as ib, a.kunci as ka, b.kunci as kb
        from k a join k b on left(a.kunci, 2) = left(b.kunci, 2) and a.id < b.id
      union
      select a.id, b.id, a.kunci, b.kunci
        from k a join k b on right(a.kunci, 3) = right(b.kunci, 3) and a.id < b.id) c
     where c.ka <> c.kb and extensions.similarity(c.ka, c.kb) >= 0.6
  ), u as (select distinct on (g.ids) g.alasan, g.prio, g.ids from g order by g.ids, g.prio)
  select u.alasan, u.prio, u.ids from u
   where not exists (select 1 from u u2 where u2.prio < u.prio and u2.ids @> u.ids)
     and not exists (select 1 from public.pelanggan_dobel_abaikan a where a.kunci = u.alasan || ':' || array_to_string(u.ids, ','))
$$;

create or replace function public.inti_pipeline_pelanggan_dobel()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if public.pipeline_peran_aktor() is distinct from 'admin' then
    perform public.lempar('PT403', 'Hanya admin Pipeline yang boleh melihat saran gabung', 'ACCESS_001');
  end if;
  return (
    with g as materialized (select * from public.pipeline_dobel_kelompok()),
    semua as (select distinct unnest(g.ids) as id from g),
    s as materialized (select * from public.pipeline_pelanggan_stat(array(select id from semua))),
    pic as materialized (select * from public.pipeline_pelanggan_pic(array(select id from semua))),
    kel as (
      select g.alasan, g.prio, g.ids,
             max(coalesce(s.jml_lead, 0)) as maks_lead,
             jsonb_agg(public.j_pipeline_pelanggan_ringkas(pg, to_jsonb(s), pic.nama, false)
                         || jsonb_build_object('telepon', (select coalesce(jsonb_agg(distinct coalesce(k.telepon_tampil, k.telepon)), '[]'::jsonb)
                                                              from public.kontak k where k.pelanggan_id = pg.id and k.telepon is not null))
                       order by coalesce(s.jml_lead, 0) desc, coalesce(s.jml_order, 0) desc, s.lead_pertama nulls last, pg.id) as anggota
        from g cross join lateral unnest(g.ids) as x(id)
          join public.pelanggan pg on pg.id = x.id
          left join s on s.pelanggan_id = x.id
          left join pic on pic.pelanggan_id = x.id
       group by g.alasan, g.prio, g.ids
    )
    select jsonb_build_object('total', count(*), 'kelompok', coalesce(jsonb_agg(jsonb_build_object(
             'kunci', kel.alasan || ':' || array_to_string(kel.ids, ','), 'alasan', kel.alasan, 'anggota', kel.anggota)
             order by kel.prio, kel.maks_lead desc, kel.ids), '[]'::jsonb))
      from kel);
end; $$;

-- p: alasan, ids[] → tandai "bukan dobel". Admin saja.
create or replace function public.inti_pipeline_pelanggan_dobel_abaikan(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ids text[];
begin
  if public.pipeline_peran_aktor() is distinct from 'admin' then
    perform public.lempar('PT403', 'Hanya admin Pipeline yang boleh mengatur saran gabung', 'ACCESS_001');
  end if;
  if coalesce(p->>'alasan', '') not in ('nama', 'telepon', 'mirip') then
    perform public.lempar('PT400', 'Alasan saran tidak sah', 'INPUT_001');
  end if;
  if jsonb_typeof(p->'ids') is distinct from 'array' then perform public.lempar('PT400', 'ids wajib', 'INPUT_001'); end if;
  select array_agg(distinct x order by x) into v_ids from jsonb_array_elements_text(p->'ids') x;
  if coalesce(cardinality(v_ids), 0) < 2 then
    perform public.lempar('PT400', 'Minimal 2 pelanggan', 'INPUT_001');
  end if;
  insert into public.pelanggan_dobel_abaikan (kunci, oleh)
    values ((p->>'alasan') || ':' || array_to_string(v_ids, ','), public.aktor())
    on conflict (kunci) do nothing;
  return public.inti_pipeline_pelanggan_dobel();
end; $$;

-- ============================================================ gabung otomatis data lama (sekali, dengan izin Hannes)
-- Hanya yang PASTI sama (keputusan Hannes 17 Okt): (1) kunci nama sama persis (bukan nama semu); (2) pelanggan bernama
-- semu dengan nomor HP sama. Tujuan = lead terbanyak, lalu order terbanyak, lalu lead tertua. Sisanya (nomor sama tapi
-- nama beda, nama mirip) lewat saran di layar admin. p_jalankan=false: uji kering — penggabungan dijalankan lalu
-- di-rollback (laporan = hasil sebenarnya). Internal: tanpa EXECUTE untuk role API (dipanggil postgres via Management API).
create or replace function public.pipeline_pelanggan_gabung_otomatis(p_aktor bigint, p_jalankan boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record; v_ke text; v_dari text; v_akhir text;
  v_pel int := 0; v_lead int := 0; v_kel int := 0; v_nama_ke text; v_nama_dari text[];
  v_rincian jsonb := '[]'::jsonb;
  v_sebelum jsonb; v_sesudah jsonb;
begin
  if not exists (select 1 from public.members m where m.id = p_aktor and m.aktif and m.role = 'owner') then
    perform public.lempar('PT400', 'Aktor gabung otomatis harus owner aktif', 'INPUT_001');
  end if;
  v_sebelum := jsonb_build_object('pelanggan', (select count(*) from public.pelanggan), 'lead', (select count(*) from public.lead),
                                  'kontak', (select count(*) from public.kontak));
  begin
    perform set_config('app.actor_id', p_aktor::text, true);
    perform set_config('app.sumber', 'sistem', true);
    for r in
      with s as materialized (select * from public.pipeline_pelanggan_stat(null)),
      k as materialized (
        select pg.id, pg.nama, pg.kunci, pg.semu,
               coalesce(s.jml_lead, 0) as jml_lead, coalesce(s.jml_order, 0) as jml_order, s.lead_pertama
          from public.pelanggan pg left join s on s.pelanggan_id = pg.id
      ), g as (
        select 'nama'::text as alasan, k.kunci as kelompok, k.* from k
         where not k.semu and k.kunci in (select k2.kunci from k k2 where not k2.semu group by k2.kunci having count(*) > 1)
        union all
        select 'telepon', kt.telepon, k.* from k
          join (select distinct x.pelanggan_id, x.telepon from public.kontak x where x.telepon is not null) kt on kt.pelanggan_id = k.id
         where k.semu and kt.telepon in (
           select x.telepon from public.kontak x join k k3 on k3.id = x.pelanggan_id
            where k3.semu and x.telepon is not null group by x.telepon having count(distinct x.pelanggan_id) > 1)
      )
      select g.alasan, g.kelompok,
             array_agg(g.id order by g.jml_lead desc, g.jml_order desc, g.lead_pertama nulls last, g.id) as ids
        from g group by g.alasan, g.kelompok order by g.alasan, g.kelompok
    loop
      v_ke := public.pipeline_pelanggan_akhir(r.ids[1]);
      if v_ke is null then continue; end if;
      v_nama_dari := '{}';
      foreach v_dari in array r.ids[2:] loop
        v_akhir := public.pipeline_pelanggan_akhir(v_dari);
        if v_akhir is null or v_akhir = v_ke then continue; end if;
        v_lead := v_lead + (select count(*) from public.lead where pelanggan_id = v_akhir);
        v_nama_dari := v_nama_dari || (select nama from public.pelanggan where id = v_akhir);
        perform public.pipeline_pelanggan_gabung_satu(v_ke, v_akhir, 'otomatis', r.alasan);
        v_pel := v_pel + 1;
      end loop;
      if cardinality(v_nama_dari) > 0 then
        v_kel := v_kel + 1;
        select nama into v_nama_ke from public.pelanggan where id = v_ke;
        v_rincian := v_rincian || jsonb_build_object('alasan', r.alasan, 'ke_id', v_ke, 'ke', v_nama_ke,
          'dari', to_jsonb(v_nama_dari), 'jml_lead', (select count(*) from public.lead where pelanggan_id = v_ke));
      end if;
    end loop;
    v_sesudah := jsonb_build_object('pelanggan', (select count(*) from public.pelanggan), 'lead', (select count(*) from public.lead),
                                    'kontak', (select count(*) from public.kontak));
    if not p_jalankan then
      raise exception using errcode = 'RJ001', message = 'uji kering: dibatalkan';
    end if;
  exception when sqlstate 'RJ001' then
    null;  -- uji kering: semua perubahan di blok ini di-rollback, variabel laporan tetap
  end;
  return jsonb_build_object('dijalankan', p_jalankan, 'kelompok', v_kel, 'pelanggan_digabung', v_pel,
    'lead_dipindah', v_lead, 'sebelum', v_sebelum, 'sesudah', v_sesudah, 'rincian', v_rincian);
end; $$;

-- ============================================================ cari pelanggan (form Lead baru) — lebih pintar
-- Cocok: nomor HP (skor 0), kunci nama sama persis (1), nama/kunci mengandung (2). Nama semu hanya lewat nomor HP.
-- Hasil (≤15) membawa jumlah lead/order & order terakhir supaya rep langsung tahu "pelanggan lama".
create or replace function public.inti_pipeline_pelanggan_cari(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), ''); v_telp text; v_kunci text; v_pola text;
begin
  if public.pipeline_peran_aktor() not in ('admin', 'rep') then
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

-- ============================================================ baris ringkas lead: + pelanggan_id, order_sebelumnya (label "Repeat")
-- order_sebelumnya = jumlah lead LAIN pelanggan yang sama yang sudah ORDER sebelum lead ini. Tanggal order = tanggal SP
-- (atau tanggal masuk bila SP kosong). Lead ORDER: order lain yang lebih dulu (tanggal order, lalu kode) → lead ini =
-- "Order ke-(n+1)", sama dengan penomoran di log pelanggan (web: nomorOrder). Lead lain: order yang terjadi sampai
-- tanggal lead ini masuk. Field disalin dari 20261013170000 (_banyak) / 20261013150000 (per lead); KEDUA fungsi wajib
-- sama (tes 23).
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
    'produk', coalesce(it.produk, '[]'::jsonb))
  from u
    join public.lead l on l.id = u.id
    join public.pelanggan pg on pg.id = l.pelanggan_id
    left join public.members mp on mp.id = l.pemilik
    left join public.pipeline_akses pa on pa.member_id = l.pemilik
    left join it on it.lead_id = l.id
    cross join h
$$;

-- ============================================================ bungkus web_ (JWT)
create or replace function public.web_pipeline_pelanggan_daftar(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan_daftar(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.web_pipeline_pelanggan(p_id text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan(p_id); end; $$;
create or replace function public.web_pipeline_pelanggan_ubah(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan_ubah(p); end; $$;
create or replace function public.web_pipeline_pelanggan_gabung(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan_gabung(p); end; $$;
create or replace function public.web_pipeline_pelanggan_gabung_batal(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan_gabung_batal(p); end; $$;
create or replace function public.web_pipeline_pelanggan_dobel() returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan_dobel(); end; $$;
create or replace function public.web_pipeline_pelanggan_dobel_abaikan(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_pelanggan_dobel_abaikan(p); end; $$;

-- ============================================================ hak (fail-closed, pola 20261013121000)
revoke all on function
  public.pipeline_nama_kunci(text), public.pipeline_nama_semu(text), public.pipeline_pelanggan_akhir(text),
  public.pipeline_pelanggan_stat(text[]), public.j_pipeline_pelanggan_ringkas(public.pelanggan, jsonb, text, boolean),
  public.pipeline_pelanggan_pic(text[]),
  public.inti_pipeline_pelanggan_daftar(jsonb), public.inti_pipeline_pelanggan(text), public.inti_pipeline_pelanggan_ubah(jsonb),
  public.pipeline_pelanggan_gabung_satu(text, text, text, text), public.inti_pipeline_pelanggan_gabung(jsonb),
  public.inti_pipeline_pelanggan_gabung_batal(jsonb), public.pipeline_dobel_kelompok(), public.inti_pipeline_pelanggan_dobel(),
  public.inti_pipeline_pelanggan_dobel_abaikan(jsonb), public.pipeline_pelanggan_gabung_otomatis(bigint, boolean),
  public.inti_pipeline_pelanggan_cari(text), public.j_pipeline_lead_ringkas(text), public.j_pipeline_lead_ringkas_banyak(text[])
from public, anon, authenticated, service_role;

revoke all on function
  public.web_pipeline_pelanggan_daftar(jsonb), public.web_pipeline_pelanggan(text), public.web_pipeline_pelanggan_ubah(jsonb),
  public.web_pipeline_pelanggan_gabung(jsonb), public.web_pipeline_pelanggan_gabung_batal(jsonb),
  public.web_pipeline_pelanggan_dobel(), public.web_pipeline_pelanggan_dobel_abaikan(jsonb)
from public, anon, authenticated, service_role;
grant execute on function
  public.web_pipeline_pelanggan_daftar(jsonb), public.web_pipeline_pelanggan(text), public.web_pipeline_pelanggan_ubah(jsonb),
  public.web_pipeline_pelanggan_gabung(jsonb), public.web_pipeline_pelanggan_gabung_batal(jsonb),
  public.web_pipeline_pelanggan_dobel(), public.web_pipeline_pelanggan_dobel_abaikan(jsonb)
to authenticated;
