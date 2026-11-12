-- Bot WA 0878 luar jam kerja dengan AI (keputusan Hannes 10 Nov 2026, pop-up B24 rhj-brain; brief rhj-brain
-- deliverables/anvil/BRIEF-WA-BOT-AI.md, rancangan deliverables/growth/RANCANGAN-BOT-WA-0878-8Nov.md, naskah acuan
-- deliverables/growth/BEBAN-WA-NASKAH-FASE2-21Okt.md §3 Jalur B).
--
-- ALUR
--   Pelanggan → WA 0878 (HP sales + Kapso coexistence) → webhook Kapso (whatsapp.message.received / .sent)
--   → Edge `api` POST /x/wa/webhook (tanda tangan HMAC, tolak dobel) → x_wa_webhook → wa.antrean (+ wa.log metadata).
--   → pg_cron tiap menit → wa.picu('proses') → pg_net POST /x/wa/proses (token TOKEN_WA_PROSES dari Vault)
--     → x_wa_ambil (aturan DB: saklar, jam kerja, daftar diam, sales membalas, jendela 24 jam, batas) → Edge membaca ulang
--       chat lewat API Kapso, menyusun balasan lewat Claude, validator, kirim lewat API Kapso → x_wa_hasil.
--   → pg_cron tiap 15 menit → wa.picu('jaga') → POST /x/wa/jaga → x_wa_jaga + x_wa_peringatan → Telegram.
--
-- PRIVASI: wa.log TANPA isi chat pelanggan (nomor di-hash HMAC dengan kunci acak di DB). Yang disimpan: id pesan, waktu,
-- arah, jenis, keputusan + alasan, panjang teks, token & biaya AI, dan teks balasan BOT (teks kita sendiri, untuk QA).
-- wa.antrean menyimpan nomor (perlu untuk membalas) dan dihapus > 7 hari; wa.log dihapus > 90 hari.
--
-- SAKLAR default `mati`: semua logika jalan (antrean tercatat, lalu dibatalkan "saklar_mati"), tidak ada yang dikirim.
-- Cron sudah dijadwalkan di migrasi ini, tetapi wa.picu tidak memanggil apa pun sebelum dua secret Vault dipasang
-- (`wa_api_url`, `wa_token_proses`; lihat docs/WA-BOT.md). Migrasi ini tidak memuat rahasia.
--
-- ADITIF: skema baru `wa`, fungsi pintu `x_wa_*` di public (service_role, dipanggil Edge), ekstensi pg_cron + pg_net.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists wa;
revoke all on schema wa from public, anon, authenticated, service_role;
comment on schema wa is 'Bot WA 0878 luar jam kerja. Tanpa akses langsung role API; semua lewat fungsi x_wa_* (public).';

-- ============================================================ tabel
create table wa.pengaturan (
  id                    boolean primary key default true check (id),
  saklar                text not null default 'mati' check (saklar in ('mati', 'kirim')),
  saklar_alasan         text not null default 'awal' check (saklar_alasan in ('awal', 'manual', 'pemutus')),
  saklar_catatan        text,
  saklar_diubah_pada    timestamptz not null default now(),
  saklar_diubah_oleh    bigint,
  model                 text not null default 'claude-sonnet-5-5' check (model ~ '^claude-[a-z0-9-]{3,60}$'),
  max_token             int not null default 400 check (max_token between 100 and 2000),
  tunda_awal_menit      int not null default 10 check (tunda_awal_menit between 1 and 120),
  tunda_lanjut_menit    int not null default 2 check (tunda_lanjut_menit between 1 and 60),
  maks_per_periode      int not null default 3 check (maks_per_periode between 0 and 10),
  maks_per_24jam        int not null default 4 check (maks_per_24jam between 0 and 20),
  jam_buka              time not null default '08:00',
  jam_tutup             time not null default '17:00' check (jam_tutup > jam_buka),
  maks_karakter         int not null default 700 check (maks_karakter between 100 and 2000),
  pemutus_tolak_harian  int not null default 3 check (pemutus_tolak_harian between 1 and 100),
  pemutus_gagal_per_jam int not null default 5 check (pemutus_gagal_per_jam between 1 and 100),
  harga_masuk_usd_per_juta  numeric(8,4) not null default 2,    -- Sonnet 5.5: $2 / 1 juta token masuk
  harga_keluar_usd_per_juta numeric(8,4) not null default 10,   -- Sonnet 5.5: $10 / 1 juta token keluar
  kunci_hash            bytea not null default extensions.gen_random_bytes(32),  -- HMAC nomor di wa.log; TIDAK pernah dikembalikan
  diubah_pada           timestamptz not null default now()
);
insert into wa.pengaturan (id) values (true);

create table wa.antrean (
  id                  bigint generated always as identity primary key,
  nomor               text not null check (nomor ~ '^62[0-9]{8,13}$'),
  percakapan          text check (percakapan is null or char_length(percakapan) <= 100),
  status              text not null default 'tunggu' check (status in ('tunggu', 'proses', 'selesai', 'batal')),
  periode             date not null,                 -- tanggal buka (08.00 WIB) hari kerja berikutnya = kunci periode luar jam
  pesan_pertama_pada  timestamptz not null,
  pesan_terakhir_pada timestamptz not null,
  id_pesan_terakhir   text,
  jumlah_pesan        int not null default 1,
  tempo_dasar         timestamptz not null,          -- pertama + 10 mnt (belum ada pesan bot di periode) / + 2 mnt (sudah)
  jatuh_tempo         timestamptz not null,          -- greatest(tempo_dasar, pesan terakhir + 2 mnt)
  percobaan           int not null default 0,
  diambil_pada        timestamptz,
  alasan              text,
  dibuat_pada         timestamptz not null default now(),
  diubah_pada         timestamptz not null default now()
);
create unique index antrean_satu_aktif on wa.antrean (nomor) where status in ('tunggu', 'proses');
create index antrean_tempo_idx on wa.antrean (jatuh_tempo) where status in ('tunggu', 'proses');
create index antrean_dibuat_idx on wa.antrean (dibuat_pada);

create table wa.log (
  id           bigint generated always as identity primary key,
  waktu        timestamptz not null,                 -- waktu kejadian (waktu pesan / waktu proses)
  dicatat_pada timestamptz not null default now(),
  id_pesan     text check (id_pesan is null or char_length(id_pesan) <= 200),
  nomor_hash   text check (nomor_hash is null or nomor_hash ~ '^[0-9a-f]{64}$'),
  arah         text not null check (arah in ('masuk', 'keluar_sales', 'keluar_aplikasi', 'keluar_api', 'keluar_bot', 'sistem')),
  jenis        text check (jenis is null or jenis ~ '^[a-z_]{1,30}$'),
  keputusan    text not null check (keputusan in ('catat', 'kirim', 'diam', 'batal', 'tolak', 'gagal', 'tunda')),
  alasan       text check (alasan is null or char_length(alasan) <= 200),
  periode      date,
  antrean_id   bigint,
  panjang      int,
  token_masuk  int,
  token_keluar int,
  biaya_usd    numeric(12,6),
  model        text,
  teks_bot     text check (teks_bot is null or char_length(teks_bot) <= 4000)   -- HANYA teks balasan bot (kirim/tolak)
);
create unique index log_id_pesan_unik on wa.log (id_pesan) where id_pesan is not null;
create index log_waktu_idx on wa.log (waktu);
create index log_nomor_idx on wa.log (nomor_hash, arah, waktu) where nomor_hash is not null;

create table wa.kejadian (               -- penolak webhook dobel (X-Idempotency-Key), 7 hari
  kunci         text primary key check (char_length(kunci) between 1 and 200),
  diterima_pada timestamptz not null default now()
);
create index kejadian_waktu_idx on wa.kejadian (diterima_pada);

create table wa.diam (
  nomor   text primary key check (nomor ~ '^62[0-9]{8,13}$'),
  alasan  text not null check (alasan in ('minta_berhenti', 'internal', 'pemasok', 'ekspedisi', 'lain')),
  catatan text check (catatan is null or char_length(catatan) <= 200),
  sejak   timestamptz not null default now(),
  oleh    bigint
);

create table wa.kata_manusia (            -- pola regex (tanpa beda huruf besar/kecil) → bot diam + catat "manusia_saja"
  id          bigint generated always as identity primary key,
  pola        text not null unique check (char_length(pola) between 2 and 200),
  aktif       boolean not null default true,
  catatan     text,
  dibuat_pada timestamptz not null default now()
);
-- Isi awal KOSONG: daftar diisi lewat migrasi data sesudah ACC Hannes (brief §3).

create table wa.peringatan (              -- satu masalah = satu pesan Telegram per 3 jam
  kunci          text primary key check (char_length(kunci) <= 60),
  terakhir_kirim timestamptz not null,
  jumlah         int not null default 1
);

create table wa.detak (
  id                boolean primary key default true check (id),
  terakhir_webhook  timestamptz,
  terakhir_proses   timestamptz,
  terakhir_jaga     timestamptz
);
insert into wa.detak (id) values (true);

alter table wa.pengaturan   enable row level security;
alter table wa.antrean      enable row level security;
alter table wa.log          enable row level security;
alter table wa.kejadian     enable row level security;
alter table wa.diam         enable row level security;
alter table wa.kata_manusia enable row level security;
alter table wa.peringatan   enable row level security;
alter table wa.detak        enable row level security;
revoke all on all tables in schema wa from public, anon, authenticated, service_role;
revoke all on all sequences in schema wa from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema wa revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema wa revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema wa revoke all on functions from public, anon, authenticated, service_role;

-- ============================================================ pembantu waktu & aturan (internal)
-- Waktu acuan: p_sekarang dari Edge HANYA bila env WA_IZINKAN_JAM_UJI=1 (tes lokal); produksi selalu now().
create or replace function wa.waktu_dari(p jsonb)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare v text := nullif(btrim(coalesce(p->>'sekarang', '')), '');
begin
  if v is null then return now(); end if;
  if v !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
    perform public.lempar('PT400', 'sekarang harus waktu ISO dengan zona', 'INPUT_001');
  end if;
  return v::timestamptz;
end; $$;

create or replace function wa.hari_kerja(d date)
returns boolean language sql stable set search_path = '' as $$
  select extract(isodow from d) between 1 and 5 and not exists (select 1 from public.hari_libur h where h.tanggal = d)
$$;

create or replace function wa.jam_kerja(t timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select wa.hari_kerja((t at time zone 'Asia/Jakarta')::date)
     and (t at time zone 'Asia/Jakarta')::time >= g.jam_buka
     and (t at time zone 'Asia/Jakarta')::time <  g.jam_tutup
    from wa.pengaturan g
$$;

-- Tanggal hari kerja berikutnya yang jam bukanya ≥ t: hari ini bila hari kerja dan belum jam buka; selain itu hari kerja
-- sesudah hari ini (maks 60 hari ke depan; libur panjang lebih dari itu dianggap tidak mungkin).
create or replace function wa.tanggal_buka(t timestamptz)
returns date language plpgsql stable set search_path = '' as $$
declare
  v_tgl date := (t at time zone 'Asia/Jakarta')::date;
  v_jam time := (t at time zone 'Asia/Jakarta')::time;
  v_buka time;
begin
  select g.jam_buka into v_buka from wa.pengaturan g;
  if wa.hari_kerja(v_tgl) and v_jam < v_buka then return v_tgl; end if;
  for i in 1 .. 60 loop
    if wa.hari_kerja(v_tgl + i) then return v_tgl + i; end if;
  end loop;
  return v_tgl + 1;
end; $$;

-- [HARI] untuk teks bot (brief): sebelum jam buka hari kerja → "pagi ini mulai jam 08.00"; hari kerja (sesudah jam tutup)
-- dan besok hari kerja → "besok pagi"; selain itu (Jumat malam s/d Minggu, malam sebelum libur, hari libur) → "<Hari> pagi";
-- hari kerja berikutnya ≥ 7 hari lagi (libur panjang) → "<Hari> <tgl> <Bulan> pagi".
create or replace function wa.label_hari(t timestamptz)
returns text language plpgsql stable set search_path = '' as $$
declare
  v_tgl date := (t at time zone 'Asia/Jakarta')::date;
  v_buka date := wa.tanggal_buka(t);
  v_jam text;
  v_hari text[] := array['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  v_bulan text[] := array['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September',
                          'Oktober', 'November', 'Desember'];
begin
  select to_char(g.jam_buka, 'HH24.MI') into v_jam from wa.pengaturan g;
  if v_buka = v_tgl then return format('pagi ini mulai jam %s', v_jam); end if;
  if v_buka = v_tgl + 1 and wa.hari_kerja(v_tgl) then return 'besok pagi'; end if;
  if v_buka - v_tgl >= 7 then
    return format('%s %s %s pagi', v_hari[extract(isodow from v_buka)::int], extract(day from v_buka)::int,
                  v_bulan[extract(month from v_buka)::int]);
  end if;
  return format('%s pagi', v_hari[extract(isodow from v_buka)::int]);
end; $$;

create or replace function wa.norm_nomor(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if v like '0%' then v := '62' || substr(v, 2);
  elsif v like '8%' then v := '62' || v;
  end if;
  if v !~ '^62[0-9]{8,13}$' then return null; end if;
  return v;
end; $$;

create or replace function wa.hash_nomor(p_nomor text)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(convert_to(p_nomor, 'UTF8'), g.kunci_hash, 'sha256'), 'hex') from wa.pengaturan g
$$;

create or replace function wa.biaya(p_masuk int, p_keluar int)
returns numeric language sql stable set search_path = '' as $$
  select round((coalesce(p_masuk, 0) * g.harga_masuk_usd_per_juta + coalesce(p_keluar, 0) * g.harga_keluar_usd_per_juta)
               / 1000000.0, 6)
    from wa.pengaturan g
$$;

-- Retensi: antrean & kejadian > 7 hari, log > 90 hari, peringatan > 7 hari. Dipanggil cron harian dan oportunistik.
create or replace function wa.rawat()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a int; k int; l int;
begin
  delete from wa.antrean x where x.dibuat_pada < now() - interval '7 days'; get diagnostics a = row_count;
  delete from wa.kejadian x where x.diterima_pada < now() - interval '7 days'; get diagnostics k = row_count;
  delete from wa.log x where x.dicatat_pada < now() - interval '90 days'; get diagnostics l = row_count;
  delete from wa.peringatan x where x.terakhir_kirim < now() - interval '7 days';
  return jsonb_build_object('antrean', a, 'kejadian', k, 'log', l);
end; $$;

-- Satu baris log (internal).
create or replace function wa.catat(p_waktu timestamptz, p_arah text, p_keputusan text, p_alasan text,
                                    p_nomor text default null, p_id_pesan text default null, p_jenis text default null,
                                    p_antrean bigint default null, p_periode date default null)
returns void language sql security definer set search_path = '' as $$
  insert into wa.log (waktu, arah, keputusan, alasan, nomor_hash, id_pesan, jenis, antrean_id, periode)
  values (p_waktu, p_arah, p_keputusan, left(p_alasan, 200),
          case when p_nomor is null then null else wa.hash_nomor(p_nomor) end,
          p_id_pesan, p_jenis, p_antrean, p_periode)
  on conflict (id_pesan) where id_pesan is not null do nothing
$$;

-- ============================================================ webhook (rute publik Edge, tanda tangan dicek Edge)
-- p = {kunci_idem?, sekarang?, items:[{id_pesan, arah:"masuk"|"keluar", asal:"cloud_api"|"business_app"|…, nomor,
--       percakapan?, waktu (ISO), jenis, stop?:bool, tes?:bool, otomatis?:bool}]}
-- Isi pesan TIDAK dikirim ke DB: Edge hanya mengirim tanda hasil pola (stop / tes / teks otomatis aplikasi).
-- Hasil {dobel:bool, diproses:n, antrean:n}.
create or replace function wa.inti_webhook(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g wa.pengaturan;
  v_now timestamptz := wa.waktu_dari(p);
  v_kunci text := nullif(btrim(coalesce(p->>'kunci_idem', '')), '');
  it jsonb;
  v_id text; v_arah text; v_asal text; v_nomor text; v_jenis text; v_waktu timestamptz; v_periode date;
  v_diam text; v_n int := 0; v_antre int := 0; v_ada_bot boolean; v_dasar timestamptz; v_aid bigint;
  v_dobel int := 0;
begin
  select * into g from wa.pengaturan;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') > 100 then
    perform public.lempar('PT400', 'items harus array (maks 100)', 'INPUT_001');
  end if;
  if v_kunci is not null then
    insert into wa.kejadian (kunci) values (left(v_kunci, 200)) on conflict do nothing;
    if not found then return jsonb_build_object('dobel', true, 'diproses', 0, 'antrean', 0); end if;
  end if;
  update wa.detak set terakhir_webhook = now() where id;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_id    := nullif(left(btrim(coalesce(it->>'id_pesan', '')), 200), '');
    v_arah  := it->>'arah';
    v_asal  := coalesce(it->>'asal', '');
    v_nomor := wa.norm_nomor(it->>'nomor');
    v_jenis := lower(coalesce(nullif(it->>'jenis', ''), 'lain'));
    if v_jenis !~ '^[a-z_]{1,30}$' then v_jenis := 'lain'; end if;
    if v_arah not in ('masuk', 'keluar') or v_nomor is null or v_id is null then continue; end if;
    if v_asal = 'history_sync' then continue; end if;
    -- id pesan sama sudah tercatat (kiriman ulang dengan kunci idem lain) → lewati
    if exists (select 1 from wa.log l where l.id_pesan = v_id) then v_dobel := v_dobel + 1; continue; end if;
    begin
      v_waktu := (it->>'waktu')::timestamptz;
    exception when others then v_waktu := v_now;
    end;
    if v_waktu is null or v_waktu > v_now + interval '5 minutes' then v_waktu := v_now; end if;
    v_n := v_n + 1;

    if v_arah = 'keluar' then
      if v_asal = 'business_app' and coalesce((it->>'otomatis')::boolean, false) then
        perform wa.catat(v_waktu, 'keluar_aplikasi', 'catat', 'teks_otomatis_aplikasi', v_nomor, v_id, v_jenis);
      elsif v_asal = 'business_app' then
        perform wa.catat(v_waktu, 'keluar_sales', 'catat', null, v_nomor, v_id, v_jenis);
        update wa.antrean a set status = 'batal', alasan = 'sales_membalas', diubah_pada = now()
         where a.nomor = v_nomor and a.status = 'tunggu' and a.pesan_pertama_pada <= v_waktu + interval '1 minute'
        returning a.id into v_aid;
        if v_aid is not null then
          perform wa.catat(v_now, 'sistem', 'batal', 'sales_membalas', v_nomor, null, null, v_aid);
        end if;
      else
        -- cloud_api: kiriman bot sendiri (tercatat lebih dulu atau sesudahnya lewat x_wa_hasil) atau aplikasi lain
        perform wa.catat(v_waktu, 'keluar_api', 'catat', null, v_nomor, v_id, v_jenis);
      end if;
      continue;
    end if;

    -- masuk
    v_periode := wa.tanggal_buka(v_waktu);
    if wa.jam_kerja(v_waktu) then
      perform wa.catat(v_waktu, 'masuk', 'catat', 'jam_kerja', v_nomor, v_id, v_jenis);
      continue;
    end if;
    if v_waktu < v_now - interval '24 hours' then
      perform wa.catat(v_waktu, 'masuk', 'catat', 'pesan_lama', v_nomor, v_id, v_jenis, null, v_periode);
      continue;
    end if;
    select d.alasan into v_diam from wa.diam d where d.nomor = v_nomor;
    if v_diam is not null then
      perform wa.catat(v_waktu, 'masuk', 'diam', 'daftar_diam:' || v_diam, v_nomor, v_id, v_jenis, null, v_periode);
      continue;
    end if;
    if coalesce((it->>'stop')::boolean, false) then
      insert into wa.diam (nomor, alasan, catatan) values (v_nomor, 'minta_berhenti', 'pelanggan menulis stop/berhenti')
      on conflict (nomor) do nothing;
      update wa.antrean a set status = 'batal', alasan = 'minta_berhenti', diubah_pada = now()
       where a.nomor = v_nomor and a.status = 'tunggu';
      perform wa.catat(v_waktu, 'masuk', 'diam', 'minta_berhenti', v_nomor, v_id, v_jenis, null, v_periode);
      continue;
    end if;
    if v_jenis in ('reaction', 'sticker') or coalesce((it->>'tes')::boolean, false) then
      perform wa.catat(v_waktu, 'masuk', 'diam',
                       case when v_jenis = 'reaction' then 'reaksi' when v_jenis = 'sticker' then 'stiker' else 'tes' end,
                       v_nomor, v_id, v_jenis, null, v_periode);
      continue;
    end if;

    -- antrean: satu baris aktif per nomor; pesan beruntun dikumpulkan
    select a.id into v_aid from wa.antrean a where a.nomor = v_nomor and a.status = 'tunggu' for update;
    if v_aid is null then
      if exists (select 1 from wa.antrean a where a.nomor = v_nomor and a.status = 'proses') then
        -- sedang diproses: pesan ini ikut terbaca ulang lewat API Kapso; bila balasan batal, pesan berikutnya membuka antrean baru
        perform wa.catat(v_waktu, 'masuk', 'catat', 'sedang_diproses', v_nomor, v_id, v_jenis, null, v_periode);
        continue;
      end if;
      v_ada_bot := exists (select 1 from wa.log l where l.nomor_hash = wa.hash_nomor(v_nomor) and l.arah = 'keluar_bot'
                             and l.periode = v_periode);
      v_dasar := v_waktu + make_interval(mins => case when v_ada_bot then g.tunda_lanjut_menit else g.tunda_awal_menit end);
      insert into wa.antrean (nomor, percakapan, periode, pesan_pertama_pada, pesan_terakhir_pada, id_pesan_terakhir,
                              tempo_dasar, jatuh_tempo)
      values (v_nomor, nullif(left(it->>'percakapan', 100), ''), v_periode, v_waktu, v_waktu, v_id, v_dasar,
              greatest(v_dasar, v_waktu + make_interval(mins => g.tunda_lanjut_menit)))
      returning id into v_aid;
    else
      update wa.antrean a set
        pesan_pertama_pada  = least(a.pesan_pertama_pada, v_waktu),
        pesan_terakhir_pada = greatest(a.pesan_terakhir_pada, v_waktu),
        id_pesan_terakhir   = case when v_waktu >= a.pesan_terakhir_pada then v_id else a.id_pesan_terakhir end,
        percakapan          = coalesce(a.percakapan, nullif(left(it->>'percakapan', 100), '')),
        jumlah_pesan        = a.jumlah_pesan + 1,
        tempo_dasar         = least(a.tempo_dasar, a.tempo_dasar - (a.pesan_pertama_pada - least(a.pesan_pertama_pada, v_waktu))),
        jatuh_tempo         = greatest(least(a.tempo_dasar, a.tempo_dasar - (a.pesan_pertama_pada - least(a.pesan_pertama_pada, v_waktu))),
                                       greatest(a.pesan_terakhir_pada, v_waktu) + make_interval(mins => g.tunda_lanjut_menit)),
        diubah_pada         = now()
       where a.id = v_aid;
    end if;
    perform wa.catat(v_waktu, 'masuk', 'catat', 'antre', v_nomor, v_id, v_jenis, v_aid, v_periode);
    v_antre := v_antre + 1;
  end loop;
  return jsonb_build_object('dobel', v_dobel > 0 and v_n = 0, 'diproses', v_n, 'antrean', v_antre);
end; $$;

-- ============================================================ ambil antrean jatuh tempo (Edge /x/wa/proses)
-- p = {sekarang?, batas? (1–20, default 10)}. Aturan DB dicek ulang SAAT jatuh tempo; yang gagal aturan → batal + log.
-- Hasil {saklar, pengaturan:{model, max_token, maks_karakter}, kata_manusia:[pola…], items:[{antrean_id, nomor,
--   percakapan, pesan_pertama_pada, pesan_terakhir_pada, periode, hari, bot_periode, sisa, id_bot:[…], percobaan}],
--   batal:{alasan:n}}.
create or replace function wa.inti_ambil(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g wa.pengaturan;
  v_now timestamptz := wa.waktu_dari(p);
  v_batas int := coalesce(nullif(p->>'batas', '')::int, 10);
  r wa.antrean;
  v_hash text; v_alasan text; v_sales timestamptz; v_bot_per int; v_bot_24 int; v_reset timestamptz;
  v_items jsonb := '[]'; v_batal jsonb := '{}';
begin
  if v_batas not between 1 and 20 then perform public.lempar('PT400', 'batas harus 1–20', 'INPUT_001'); end if;
  select * into g from wa.pengaturan;
  update wa.detak set terakhir_proses = now() where id;

  for r in
    select * from wa.antrean a
     where (a.status = 'tunggu' and a.jatuh_tempo <= v_now)
        or (a.status = 'proses' and a.diambil_pada < v_now - interval '5 minutes')   -- proses macet (Edge mati di tengah)
     order by a.jatuh_tempo
     limit v_batas
     for update skip locked
  loop
    v_hash := wa.hash_nomor(r.nomor);
    v_alasan := null;
    select max(l.waktu) into v_sales from wa.log l where l.nomor_hash = v_hash and l.arah = 'keluar_sales';
    -- batas dihitung sejak pesan sales terakhir ("sesudah batas: diam sampai sales membalas")
    v_reset := coalesce(v_sales, '-infinity'::timestamptz);
    select count(*) filter (where l.periode = r.periode),
           count(*) filter (where l.waktu > v_now - interval '24 hours')
      into v_bot_per, v_bot_24
      from wa.log l where l.nomor_hash = v_hash and l.arah = 'keluar_bot' and l.waktu > v_reset;

    if g.saklar <> 'kirim' then v_alasan := 'saklar_mati';
    elsif wa.jam_kerja(v_now) then v_alasan := 'jam_kerja';
    elsif exists (select 1 from wa.diam d where d.nomor = r.nomor) then v_alasan := 'daftar_diam';
    elsif v_sales is not null and v_sales >= r.pesan_pertama_pada - interval '1 minute' then v_alasan := 'sales_membalas';
    elsif v_sales is not null and v_sales > r.pesan_pertama_pada - interval '24 hours' then v_alasan := 'chat_berjalan';
    elsif v_now > r.pesan_terakhir_pada + interval '24 hours' then v_alasan := 'jendela_24jam';
    elsif v_bot_per >= g.maks_per_periode then v_alasan := 'batas_periode';
    elsif v_bot_24 >= g.maks_per_24jam then v_alasan := 'batas_24jam';
    end if;

    if v_alasan is not null then
      update wa.antrean a set status = 'batal', alasan = v_alasan, diubah_pada = now() where a.id = r.id;
      perform wa.catat(v_now, 'sistem', 'batal', v_alasan, r.nomor, null, null, r.id, r.periode);
      v_batal := jsonb_set(v_batal, array[v_alasan], to_jsonb(coalesce((v_batal->>v_alasan)::int, 0) + 1));
      continue;
    end if;

    update wa.antrean a set status = 'proses', diambil_pada = v_now, diubah_pada = now() where a.id = r.id;
    v_items := v_items || jsonb_build_object(
      'antrean_id', r.id, 'nomor', r.nomor, 'percakapan', r.percakapan,
      'pesan_pertama_pada', public.iso_utc(r.pesan_pertama_pada), 'pesan_terakhir_pada', public.iso_utc(r.pesan_terakhir_pada),
      'periode', r.periode, 'hari', wa.label_hari(v_now), 'bot_periode', v_bot_per,
      'sisa', least(g.maks_per_periode - v_bot_per, g.maks_per_24jam - v_bot_24),
      'percobaan', r.percobaan,
      'id_bot', coalesce((select jsonb_agg(l.id_pesan) from wa.log l
                           where l.nomor_hash = v_hash and l.arah = 'keluar_bot' and l.id_pesan is not null
                             and l.waktu > v_now - interval '30 days'), '[]'::jsonb));
  end loop;

  return jsonb_build_object(
    'saklar', g.saklar,
    'pengaturan', jsonb_build_object('model', g.model, 'max_token', g.max_token, 'maks_karakter', g.maks_karakter),
    'kata_manusia', coalesce((select jsonb_agg(k.pola order by k.id) from wa.kata_manusia k where k.aktif), '[]'::jsonb),
    'items', v_items, 'batal', v_batal);
end; $$;

-- ============================================================ hasil satu antrean (Edge /x/wa/proses)
-- p = {antrean_id, keputusan: kirim|diam|batal|tolak|gagal|tunda, alasan?, id_pesan? (kirim), teks_bot? (kirim/tolak),
--      token_masuk?, token_keluar?, model?, diam_nomor? (minta_berhenti), sekarang?}
-- kirim → log keluar_bot (teks bot + token + biaya), antrean selesai. tunda → antrean tunggu lagi +2 menit (maks 3
-- percobaan, lalu batal "tunda_habis"). tolak/gagal → pemutus otomatis: tolak ≥ pemutus_tolak_harian per hari WIB atau
-- gagal ≥ pemutus_gagal_per_jam per jam → saklar mati (alasan pemutus). Hasil {ok, status, pemutus}.
create or replace function wa.inti_hasil(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g wa.pengaturan;
  v_now timestamptz := wa.waktu_dari(p);
  r wa.antrean;
  v_kep text := p->>'keputusan';
  v_alasan text := left(nullif(p->>'alasan', ''), 200);
  v_teks text := p->>'teks_bot';
  v_tm int := nullif(p->>'token_masuk', '')::int;
  v_tk int := nullif(p->>'token_keluar', '')::int;
  v_id text := nullif(left(btrim(coalesce(p->>'id_pesan', '')), 200), '');
  v_status text; v_n int; v_pemutus text;
begin
  if v_kep is null or v_kep not in ('kirim', 'diam', 'batal', 'tolak', 'gagal', 'tunda') then
    perform public.lempar('PT400', 'keputusan harus kirim|diam|batal|tolak|gagal|tunda', 'INPUT_001');
  end if;
  select * into r from wa.antrean a where a.id = nullif(p->>'antrean_id', '')::bigint for update;
  if not found then perform public.lempar('PT404', 'Antrean tidak ditemukan', 'ITEM_013'); end if;
  if r.status <> 'proses' then
    perform public.lempar('PT409', format('Antrean berstatus %s, bukan proses', r.status), 'KONFLIK_001');
  end if;
  select * into g from wa.pengaturan;

  if v_kep = 'tunda' then
    if r.percobaan + 1 >= 3 then
      v_kep := 'batal'; v_alasan := 'tunda_habis:' || coalesce(v_alasan, '-');
    else
      update wa.antrean a set status = 'tunggu', percobaan = a.percobaan + 1, diambil_pada = null,
                              jatuh_tempo = v_now + interval '2 minutes', alasan = v_alasan, diubah_pada = now()
       where a.id = r.id;
      perform wa.catat(v_now, 'sistem', 'tunda', v_alasan, r.nomor, null, null, r.id, r.periode);
      return jsonb_build_object('ok', true, 'status', 'tunggu', 'pemutus', false);
    end if;
  end if;

  v_status := case when v_kep in ('kirim', 'tolak', 'gagal') then 'selesai' else 'batal' end;
  update wa.antrean a set status = v_status, alasan = coalesce(v_alasan, v_kep), diubah_pada = now() where a.id = r.id;

  if v_kep = 'kirim' then
    if v_id is null or coalesce(v_teks, '') = '' then
      perform public.lempar('PT400', 'kirim butuh id_pesan dan teks_bot', 'INPUT_001');
    end if;
    -- webhook .sent bisa datang lebih dulu (tercatat keluar_api) → ubah jadi keluar_bot
    delete from wa.log l where l.id_pesan = v_id and l.arah = 'keluar_api';
  end if;
  insert into wa.log (waktu, arah, keputusan, alasan, nomor_hash, id_pesan, antrean_id, periode, panjang, token_masuk,
                      token_keluar, biaya_usd, model, teks_bot)
  values (v_now, case when v_kep = 'kirim' then 'keluar_bot' else 'sistem' end, v_kep, v_alasan, wa.hash_nomor(r.nomor),
          case when v_kep = 'kirim' then v_id end, r.id, r.periode, char_length(v_teks), v_tm, v_tk,
          case when v_tm is null and v_tk is null then null else wa.biaya(v_tm, v_tk) end,
          case when v_tm is null and v_tk is null then null else left(coalesce(p->>'model', g.model), 60) end,
          case when v_kep in ('kirim', 'tolak') then left(v_teks, 4000) end);

  if nullif(p->>'diam_nomor', '') is not null then
    insert into wa.diam (nomor, alasan, catatan)
    values (r.nomor, case when p->>'diam_nomor' in ('minta_berhenti', 'internal', 'pemasok', 'ekspedisi') then p->>'diam_nomor' else 'lain' end,
            'dari bot (cek ulang chat)')
    on conflict (nomor) do nothing;
  end if;

  -- pemutus otomatis
  if v_kep = 'tolak' then
    select count(*) into v_n from wa.log l
     where l.keputusan = 'tolak' and (l.waktu at time zone 'Asia/Jakarta')::date = (v_now at time zone 'Asia/Jakarta')::date;
    if v_n >= g.pemutus_tolak_harian then v_pemutus := format('validator menolak %s kali hari ini', v_n); end if;
  elsif v_kep = 'gagal' then
    select count(*) into v_n from wa.log l where l.keputusan = 'gagal' and l.waktu > v_now - interval '1 hour';
    if v_n >= g.pemutus_gagal_per_jam then v_pemutus := format('kirim gagal %s kali dalam 1 jam', v_n); end if;
  end if;
  if v_pemutus is not null and g.saklar = 'kirim' then
    update wa.pengaturan set saklar = 'mati', saklar_alasan = 'pemutus', saklar_catatan = v_pemutus,
                             saklar_diubah_pada = v_now, saklar_diubah_oleh = null, diubah_pada = now() where id;
    perform wa.catat(v_now, 'sistem', 'catat', 'pemutus: ' || v_pemutus);
  end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'pemutus', v_pemutus is not null and g.saklar = 'kirim');
end; $$;

-- ============================================================ jaga (Edge /x/wa/jaga, tiap 15 menit)
-- Hasil data mentah untuk pemeriksaan; Edge menambah cek API Kapso (webhook aktif, chat baru tanpa webhook).
create or replace function wa.inti_jaga(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g wa.pengaturan; d wa.detak;
  v_now timestamptz := wa.waktu_dari(p);
begin
  select * into g from wa.pengaturan;
  select * into d from wa.detak;
  update wa.detak set terakhir_jaga = now() where id;
  perform wa.rawat();
  return jsonb_build_object(
    'sekarang', public.iso_utc(v_now),
    'saklar', g.saklar, 'saklar_alasan', g.saklar_alasan, 'saklar_catatan', g.saklar_catatan,
    'saklar_diubah_pada', public.iso_utc(g.saklar_diubah_pada),
    'akhir_pekan', extract(isodow from (v_now at time zone 'Asia/Jakarta')::date) in (6, 7),
    'jam_kerja', wa.jam_kerja(v_now),
    -- chat luar jam > 20 menit tanpa balasan bot/sales (antrean belum selesai)
    'macet', (select count(*) from wa.antrean a where a.status in ('tunggu', 'proses')
                and a.pesan_pertama_pada < v_now - interval '20 minutes'),
    'gagal', (select count(*) from wa.log l where l.keputusan = 'gagal' and l.waktu > v_now - interval '15 minutes'),
    'gagal_alasan', (select string_agg(distinct l.alasan, ', ') from wa.log l
                      where l.keputusan = 'gagal' and l.waktu > v_now - interval '15 minutes'),
    'tolak', (select count(*) from wa.log l where l.keputusan = 'tolak' and l.waktu > v_now - interval '15 minutes'),
    'tolak_alasan', (select string_agg(distinct l.alasan, ', ') from wa.log l
                      where l.keputusan = 'tolak' and l.waktu > v_now - interval '15 minutes'),
    'terakhir_webhook', public.iso_utc(d.terakhir_webhook),
    'terakhir_proses', public.iso_utc(d.terakhir_proses));
end; $$;

-- Tanpa spam: kunci masalah yang sama paling cepat 3 jam sekali. p={kunci, sekarang?} → {kirim:bool}
create or replace function wa.inti_peringatan(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := wa.waktu_dari(p);
  v_k text := nullif(left(btrim(coalesce(p->>'kunci', '')), 60), '');
  v_ok int;
begin
  if v_k is null then perform public.lempar('PT400', 'kunci wajib', 'INPUT_001'); end if;
  insert into wa.peringatan as w (kunci, terakhir_kirim) values (v_k, v_now)
  on conflict (kunci) do update set terakhir_kirim = excluded.terakhir_kirim, jumlah = w.jumlah + 1
   where w.terakhir_kirim <= excluded.terakhir_kirim - interval '3 hours';
  get diagnostics v_ok = row_count;
  return jsonb_build_object('kirim', v_ok > 0);
end; $$;

-- ============================================================ admin (token app; owner/bot)
create or replace function wa.wajib_owner_bot()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.members m where m.id = public.aktor() and m.role in ('owner', 'bot') and m.aktif) then
    perform public.lempar('PT403', 'Bot WA hanya untuk owner atau bot', 'ACCESS_001');
  end if;
end; $$;

-- p={hari? 1–90 (default 7)} → ringkasan tanpa isi chat pelanggan dan tanpa nomor.
create or replace function wa.inti_ringkas(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  g wa.pengaturan; d wa.detak;
  v_hari int := coalesce(nullif(p->>'hari', '')::int, 7);
  v_sejak timestamptz;
begin
  if v_hari not between 1 and 90 then perform public.lempar('PT400', 'hari harus 1–90', 'INPUT_001'); end if;
  v_sejak := now() - make_interval(days => v_hari);
  select * into g from wa.pengaturan;
  select * into d from wa.detak;
  return (
    with l as (select * from wa.log x where x.waktu >= v_sejak)
    select jsonb_build_object(
      'hari', v_hari, 'sejak', public.iso_utc(v_sejak),
      'saklar', g.saklar, 'saklar_alasan', g.saklar_alasan, 'saklar_catatan', g.saklar_catatan,
      'saklar_diubah_pada', public.iso_utc(g.saklar_diubah_pada), 'model', g.model,
      'masuk', (select count(*) from l where l.arah = 'masuk'),
      'masuk_luar_jam', (select count(*) from l where l.arah = 'masuk' and l.alasan is distinct from 'jam_kerja'),
      'chat_antre', (select count(distinct l.antrean_id) from l where l.arah = 'masuk' and l.antrean_id is not null),
      'kirim', (select count(*) from l where l.keputusan = 'kirim'),
      'nomor_dibalas', (select count(distinct l.nomor_hash) from l where l.keputusan = 'kirim'),
      'tolak', (select count(*) from l where l.keputusan = 'tolak'),
      'gagal', (select count(*) from l where l.keputusan = 'gagal'),
      'per_alasan', (select coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) from (
                       select l.keputusan || ':' || split_part(coalesce(l.alasan, '-'), ':', 1) as k, count(*) as n
                         from l where l.keputusan in ('diam', 'batal', 'tolak', 'gagal', 'tunda')
                        group by 1) x),
      'token_masuk', (select coalesce(sum(l.token_masuk), 0) from l),
      'token_keluar', (select coalesce(sum(l.token_keluar), 0) from l),
      'biaya_usd', (select coalesce(sum(l.biaya_usd), 0) from l),
      'panggilan_ai', (select count(*) from l where l.token_masuk is not null),
      'contoh', (select coalesce(jsonb_agg(jsonb_build_object('waktu', public.iso_utc(x.waktu), 'keputusan', x.keputusan,
                                                                'alasan', x.alasan, 'teks', x.teks_bot) order by x.waktu desc), '[]')
                   from (select * from l where l.teks_bot is not null order by l.waktu desc limit 5) x),
      'antrean_aktif', (select count(*) from wa.antrean a where a.status in ('tunggu', 'proses')),
      'daftar_diam', (select count(*) from wa.diam),
      'kata_manusia', (select count(*) from wa.kata_manusia k where k.aktif),
      'terakhir_webhook', public.iso_utc(d.terakhir_webhook), 'terakhir_proses', public.iso_utc(d.terakhir_proses),
      'terakhir_jaga', public.iso_utc(d.terakhir_jaga),
      'dibuat', public.iso_utc(now())));
end; $$;

-- p={status: mati|kirim, catatan?}
create or replace function wa.inti_saklar(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_s text := lower(btrim(coalesce(p->>'status', '')));
begin
  if v_s not in ('mati', 'kirim') then perform public.lempar('PT400', 'status harus mati atau kirim', 'INPUT_001'); end if;
  update wa.pengaturan set saklar = v_s, saklar_alasan = 'manual', saklar_catatan = left(nullif(p->>'catatan', ''), 200),
                           saklar_diubah_pada = now(), saklar_diubah_oleh = public.aktor(), diubah_pada = now() where id;
  perform wa.catat(now(), 'sistem', 'catat', 'saklar ' || v_s || ' oleh ' || public.aktor());
  return (select jsonb_build_object('saklar', g.saklar, 'saklar_alasan', g.saklar_alasan,
                                    'saklar_diubah_pada', public.iso_utc(g.saklar_diubah_pada)) from wa.pengaturan g);
end; $$;

-- p={nomor, alasan: internal|pemasok|ekspedisi|minta_berhenti|lain, catatan?, hapus?:bool}
create or replace function wa.inti_diam(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_n text := wa.norm_nomor(p->>'nomor');
  v_a text := lower(btrim(coalesce(p->>'alasan', '')));
  v_hapus boolean := coalesce((p->>'hapus')::boolean, false);
  v_k int;
begin
  if v_n is null then perform public.lempar('PT400', 'nomor tidak sah (contoh 0812…, 62812…)', 'INPUT_001'); end if;
  if v_hapus then
    delete from wa.diam d where d.nomor = v_n; get diagnostics v_k = row_count;
    return jsonb_build_object('nomor', v_n, 'dihapus', v_k > 0);
  end if;
  if v_a not in ('internal', 'pemasok', 'ekspedisi', 'minta_berhenti', 'lain') then
    perform public.lempar('PT400', 'alasan harus internal|pemasok|ekspedisi|minta_berhenti|lain', 'INPUT_001');
  end if;
  insert into wa.diam (nomor, alasan, catatan, oleh) values (v_n, v_a, left(nullif(p->>'catatan', ''), 200), public.aktor())
  on conflict (nomor) do update set alasan = excluded.alasan, catatan = excluded.catatan, oleh = excluded.oleh, sejak = now();
  update wa.antrean a set status = 'batal', alasan = 'daftar_diam', diubah_pada = now() where a.nomor = v_n and a.status = 'tunggu';
  return jsonb_build_object('nomor', v_n, 'alasan', v_a, 'dihapus', false);
end; $$;

-- ============================================================ pintu service_role (Edge)
-- Rute tanpa token app (webhook Kapso / token TOKEN_WA_PROSES diperiksa Edge) → tanpa p_aktor, seperti x_iklan_klik_catat.
create or replace function public.x_wa_webhook(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_webhook(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_ambil(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_ambil(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_hasil(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_hasil(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_jaga(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_jaga(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_peringatan(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_peringatan(coalesce(p, '{}'::jsonb)); end; $$;
-- Token app (scope dicek DB lewat header x-token-id): ringkas = baca, saklar/diam = tulis; aktor owner/bot.
create or replace function public.x_wa_ringkas(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); perform wa.wajib_owner_bot(); return wa.inti_ringkas(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_saklar(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); perform wa.wajib_owner_bot(); return wa.inti_saklar(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_diam(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); perform wa.wajib_owner_bot(); return wa.inti_diam(coalesce(p, '{}'::jsonb)); end; $$;

-- ============================================================ cron + pg_net
-- Memanggil Edge lewat pg_net. URL & token dari Vault (dipasang saat deploy, bukan di migrasi):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/api', 'wa_api_url');
--   select vault.create_secret('<TOKEN_WA_PROSES>', 'wa_token_proses');
-- Tanpa kedua secret → tidak memanggil apa pun (null). proses hanya dipanggil bila ada antrean jatuh tempo.
create or replace function wa.picu(p_jenis text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_tok text;
begin
  if p_jenis not in ('proses', 'jaga') then raise exception 'jenis picu tidak dikenal: %', p_jenis; end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'wa_api_url';
  select s.decrypted_secret into v_tok from vault.decrypted_secrets s where s.name = 'wa_token_proses';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then return null; end if;
  if p_jenis = 'proses' and not exists (
       select 1 from wa.antrean a where (a.status = 'tunggu' and a.jatuh_tempo <= now())
                                     or (a.status = 'proses' and a.diambil_pada < now() - interval '5 minutes')) then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/x/wa/' || p_jenis,
    body := '{}'::jsonb,
    headers := jsonb_build_object('authorization', 'Bearer ' || v_tok, 'content-type', 'application/json'),
    timeout_milliseconds := 120000);
end; $$;

select cron.schedule('wa-proses', '* * * * *', $$select wa.picu('proses')$$);
select cron.schedule('wa-jaga', '*/15 * * * *', $$select wa.picu('jaga')$$);
select cron.schedule('wa-rawat', '41 19 * * *', $$select wa.rawat()$$);   -- 02.41 WIB

-- ============================================================ hak (fail-closed)
revoke all on all functions in schema wa from public, anon, authenticated, service_role;
revoke all on function
  public.x_wa_webhook(jsonb), public.x_wa_ambil(jsonb), public.x_wa_hasil(jsonb), public.x_wa_jaga(jsonb),
  public.x_wa_peringatan(jsonb), public.x_wa_ringkas(bigint, jsonb), public.x_wa_saklar(bigint, jsonb),
  public.x_wa_diam(bigint, jsonb)
from public, anon, authenticated, service_role;
grant execute on function
  public.x_wa_webhook(jsonb), public.x_wa_ambil(jsonb), public.x_wa_hasil(jsonb), public.x_wa_jaga(jsonb),
  public.x_wa_peringatan(jsonb), public.x_wa_ringkas(bigint, jsonb), public.x_wa_saklar(bigint, jsonb),
  public.x_wa_diam(bigint, jsonb)
to service_role;
