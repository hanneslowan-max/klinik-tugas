-- Modul Berita (7 Nov 2026, permintaan Hannes: "aplikasi untuk memantau news terpenting, terhangat, dan terupdate dari
-- dalam dan luar negeri ... kamu yang memilah berita apa yang harus saya konsumsi untuk kebutuhan berbisnis dan berelasi";
-- dibangun sebagai modul Anvil, diperbarui tiap 2–3 jam di jam kerja).
--
-- ALUR
--   1. TARIK  : Edge `api` (POST /x/berita/tarik — token agent; POST /x/admin/berita-tarik — sesi owner, tombol web)
--               mengambil semua feed RSS/Atom di berita_sumber, lalu x_berita_simpan menyimpan item baru ke `berita`
--               (dobel URL / judul sama dalam 3 hari dilewati; item > 14 hari dihapus supaya DB Free tidak penuh).
--   2. KURASI : routine Claude (environment Marketing, token bot scope tulis) membaca GET /x/berita/kandidat
--               (x_berita_kandidat: item sejak edisi terakhir + umpan balik owner), memilah, lalu POST /x/berita/edisi
--               (x_berita_edisi_simpan): garis besar + 1–30 pilihan berskor dengan ringkasan, dampak ke bisnis, dan bahan
--               obrolan relasi.
--   3. BACA   : /berita (owner saja) — web_berita (edisi), web_berita_semua (semua item tarikan + status sumber),
--               web_berita_tersimpan, web_berita_tanda (dibaca / simpan / kurang relevan → umpan balik ke kurator).
--
-- AKSES: SEMUA hanya owner (web) atau owner/bot (x_). Anggota biasa tidak melihat apa pun (menu juga disembunyikan).
-- Tabel tanpa grant untuk authenticated/anon; service_role hanya SELECT berita_sumber (Edge membaca daftar feed lewat
-- x_berita_sumber, bukan tabel). ADITIF: tabel & fungsi baru saja, tidak menyentuh data lama, tidak ikut x_export
-- (data berita bisa ditarik ulang; edisi & tanda simpan ikut hilang bila DB dipulihkan dari backup lama).

-- ============================================================ tabel
create table public.berita_sumber (
  id             text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nama           text not null check (char_length(nama) between 1 and 80),
  url            text not null unique check (url ~ '^https://' and char_length(url) <= 500),
  wilayah        text not null check (wilayah in ('dalam', 'luar')),
  topik          text not null default 'umum' check (char_length(topik) between 1 and 40),
  aktif          boolean not null default true,
  urutan         integer not null default 0,
  terakhir_tarik timestamptz,
  terakhir_ok    timestamptz,
  terakhir_galat text check (char_length(terakhir_galat) <= 300),
  terakhir_item  integer,
  dibuat_at      timestamptz not null default now()
);
comment on table public.berita_sumber is 'Feed RSS/Atom modul Berita. Ditarik Edge api (/x/berita/tarik).';

create table public.berita (
  id          bigint generated always as identity primary key,
  sumber_id   text not null references public.berita_sumber (id) on delete cascade,
  url         text not null unique check (char_length(url) between 10 and 2000),
  judul       text not null check (char_length(judul) between 1 and 400),
  judul_kunci text not null,
  cuplikan    text check (char_length(cuplikan) <= 600),
  penerbit    text check (char_length(penerbit) <= 120),
  terbit_at   timestamptz,
  ditarik_at  timestamptz not null default now(),
  waktu       timestamptz generated always as (coalesce(terbit_at, ditarik_at)) stored
);
comment on table public.berita is
  'Item mentah hasil tarik feed (bukan kurasi). Disimpan 14 hari. Ditulis hanya oleh x_berita_simpan.';
create index berita_waktu on public.berita (waktu desc, id desc);
create index berita_ditarik on public.berita (ditarik_at);
create index berita_judul_kunci on public.berita (judul_kunci);
create index berita_sumber_waktu on public.berita (sumber_id, waktu desc);

create table public.berita_edisi (
  id          bigint generated always as identity primary key,
  dibuat_at   timestamptz not null default now(),
  dibuat_oleh bigint references public.members (id),
  garis_besar text not null check (char_length(garis_besar) between 1 and 2000),
  pantau      text check (char_length(pantau) <= 1000),
  kandidat    integer check (kandidat >= 0),
  catatan     text check (char_length(catatan) <= 500)
);
comment on table public.berita_edisi is 'Satu kali kurasi (routine Claude). Ditulis hanya oleh x_berita_edisi_simpan.';
create index berita_edisi_waktu on public.berita_edisi (dibuat_at desc);

create table public.berita_pilihan (
  id           bigint generated always as identity primary key,
  edisi_id     bigint not null references public.berita_edisi (id) on delete cascade,
  berita_id    bigint references public.berita (id) on delete set null,
  urutan       smallint not null,
  url          text not null check (url ~ '^https?://' and char_length(url) <= 2000),
  judul        text not null check (char_length(judul) between 1 and 300),
  sumber       text not null check (char_length(sumber) between 1 and 120),
  terbit_at    timestamptz,
  wilayah      text not null check (wilayah in ('dalam', 'luar')),
  kategori     text not null check (kategori in ('ekonomi', 'kebijakan', 'industri', 'logistik', 'komoditas', 'bisnis',
                                                 'geopolitik', 'nasional', 'teknologi', 'lainnya')),
  skor         smallint not null check (skor between 1 and 5),
  ringkasan    text not null check (char_length(ringkasan) between 1 and 1200),
  dampak       text not null check (char_length(dampak) between 1 and 800),
  bahan_relasi text check (char_length(bahan_relasi) <= 600),
  unique (edisi_id, url),
  unique (edisi_id, urutan)
);
create index berita_pilihan_berita on public.berita_pilihan (berita_id);

create table public.berita_tanda (
  member_id   bigint not null references public.members (id) on delete cascade,
  pilihan_id  bigint not null references public.berita_pilihan (id) on delete cascade,
  dibaca_at   timestamptz,
  disimpan_at timestamptz,
  kurang_at   timestamptz,
  primary key (member_id, pilihan_id)
);
create index berita_tanda_simpan on public.berita_tanda (member_id, disimpan_at desc) where disimpan_at is not null;

alter table public.berita_sumber enable row level security;
alter table public.berita enable row level security;
alter table public.berita_edisi enable row level security;
alter table public.berita_pilihan enable row level security;
alter table public.berita_tanda enable row level security;
revoke all on public.berita_sumber, public.berita, public.berita_edisi, public.berita_pilihan, public.berita_tanda
  from public, anon, authenticated, service_role;
grant select on public.berita_sumber, public.berita, public.berita_edisi, public.berita_pilihan to service_role;
-- hak default Supabase memberi service_role semua hak ke sequence BARU (temuan 13 Okt) → cabut; id diisi fungsi saja
revoke all on sequence public.berita_id_seq, public.berita_edisi_id_seq, public.berita_pilihan_id_seq
  from public, anon, authenticated, service_role;

-- ============================================================ sumber awal (dicek tarik 7 Nov 2026: HTTP 200 + item)
insert into public.berita_sumber (id, nama, url, wilayah, topik, urutan) values
  ('gnews-id',          'Google News Indonesia (berita utama)', 'https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id', 'dalam', 'utama', 10),
  ('gnews-id-bisnis',   'Google News Indonesia (bisnis)', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=id&gl=ID&ceid=ID:id', 'dalam', 'bisnis', 11),
  ('antara-terkini',    'Antara (terkini)', 'https://www.antaranews.com/rss/terkini.xml', 'dalam', 'nasional', 20),
  ('antara-ekonomi',    'Antara (ekonomi)', 'https://www.antaranews.com/rss/ekonomi.xml', 'dalam', 'ekonomi', 21),
  ('antara-bisnis',     'Antara (bisnis)', 'https://www.antaranews.com/rss/ekonomi-bisnis.xml', 'dalam', 'bisnis', 22),
  ('cnbcid-news',       'CNBC Indonesia (news)', 'https://www.cnbcindonesia.com/news/rss', 'dalam', 'ekonomi', 30),
  ('cnbcid-market',     'CNBC Indonesia (market)', 'https://www.cnbcindonesia.com/market/rss', 'dalam', 'pasar', 31),
  ('detik-finance',     'detikFinance', 'https://finance.detik.com/rss', 'dalam', 'ekonomi', 40),
  ('detik-news',        'detikNews', 'https://news.detik.com/rss', 'dalam', 'nasional', 41),
  ('cnnid-ekonomi',     'CNN Indonesia (ekonomi)', 'https://www.cnnindonesia.com/ekonomi/rss', 'dalam', 'ekonomi', 50),
  ('cnnid-nasional',    'CNN Indonesia (nasional)', 'https://www.cnnindonesia.com/nasional/rss', 'dalam', 'nasional', 51),
  ('katadata',          'Katadata', 'https://katadata.co.id/rss', 'dalam', 'ekonomi', 61),
  ('liputan6-bisnis',   'Liputan6 (bisnis)', 'https://feed.liputan6.com/rss/bisnis', 'dalam', 'bisnis', 62),
  ('okezone-ekonomi',   'Okezone (ekonomi)', 'https://sindikasi.okezone.com/index.php/rss/11/RSS2.0', 'dalam', 'ekonomi', 63),
  ('republika-ekonomi', 'Republika (ekonomi)', 'https://www.republika.co.id/rss/ekonomi', 'dalam', 'ekonomi', 64),
  ('gnews-world',       'Google News (world)', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en', 'luar', 'dunia', 100),
  ('gnews-business',    'Google News (business)', 'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en', 'luar', 'bisnis', 101),
  ('bbc-world',         'BBC (world)', 'https://feeds.bbci.co.uk/news/world/rss.xml', 'luar', 'dunia', 110),
  ('bbc-business',      'BBC (business)', 'https://feeds.bbci.co.uk/news/business/rss.xml', 'luar', 'bisnis', 111),
  ('bbc-asia',          'BBC (asia)', 'https://feeds.bbci.co.uk/news/world/asia/rss.xml', 'luar', 'asia', 112),
  ('aljazeera',         'Al Jazeera', 'https://www.aljazeera.com/xml/rss/all.xml', 'luar', 'dunia', 120),
  ('ft-world',          'Financial Times (world)', 'https://www.ft.com/world?format=rss', 'luar', 'dunia', 132),
  ('nyt-business',      'New York Times (business)', 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', 'luar', 'bisnis', 140),
  ('nyt-world',         'New York Times (world)', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', 'luar', 'dunia', 141),
  ('guardian-business', 'The Guardian (business)', 'https://www.theguardian.com/uk/business/rss', 'luar', 'bisnis', 150),
  ('nikkei',            'Nikkei Asia', 'https://asia.nikkei.com/rss/feed/nar', 'luar', 'asia', 160),
  ('scmp-business',     'SCMP (business)', 'https://www.scmp.com/rss/92/feed', 'luar', 'bisnis', 161),
  ('scmp-china',        'SCMP (china)', 'https://www.scmp.com/rss/4/feed', 'luar', 'asia', 162),
  ('cna-asia',          'CNA (asia)', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511', 'luar', 'asia', 163),
  ('cna-business',      'CNA (business)', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936', 'luar', 'bisnis', 164),
  ('straits-asia',      'The Straits Times (asia)', 'https://www.straitstimes.com/news/asia/rss.xml', 'luar', 'asia', 165),
  ('mining',            'Mining.com (logam & tambang)', 'https://www.mining.com/feed/', 'luar', 'komoditas', 200),
  ('loadstar',          'The Loadstar (logistik)', 'https://theloadstar.com/feed/', 'luar', 'logistik', 201),
  ('splash247',         'Splash247 (pelayaran)', 'https://splash247.com/feed/', 'luar', 'logistik', 202),
  ('supplychaindive',   'Supply Chain Dive', 'https://www.supplychaindive.com/feeds/news/', 'luar', 'logistik', 203),
  ('manufacturingdive', 'Manufacturing Dive', 'https://www.manufacturingdive.com/feeds/news/', 'luar', 'industri', 204)
on conflict (id) do nothing;

-- ============================================================ pembantu
-- Aktor (app.actor_id / sesi) wajib owner atau bot aktif.
create or replace function public.berita_wajib_aktor()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare v_id bigint := public.aktor();
begin
  if not exists (select 1 from public.members m where m.id = v_id and m.aktif and m.role in ('owner', 'bot')) then
    perform public.lempar('PT403', 'Modul Berita hanya untuk owner atau agent', 'ACCESS_001');
  end if;
  return v_id;
end; $$;

-- Kunci judul untuk deteksi dobel lintas sumber: huruf/angka kecil saja, 120 karakter pertama.
create or replace function public.berita_kunci(p_judul text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select left(regexp_replace(lower(coalesce(p_judul, '')), '[^[:alnum:]]+', '', 'g'), 120)
$$;

-- Teks bersih: buang karakter kontrol, rapatkan spasi, potong.
create or replace function public.berita_teks(p text, p_maks int)
returns text language sql immutable parallel safe set search_path = '' as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), p_maks), '')
$$;

-- Waktu ISO dari feed/agent → timestamptz; tidak sah → null; masa depan (> 1 jam) → sekarang.
create or replace function public.berita_waktu(p text)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare v timestamptz;
begin
  if p is null or btrim(p) = '' then return null; end if;
  begin
    v := p::timestamptz;
  exception when others then
    return null;
  end;
  if v > now() + interval '1 hour' then return now(); end if;
  if v < timestamptz '2000-01-01' then return null; end if;
  return v;
end; $$;

-- Satu pilihan → JSON untuk web (dengan tanda milik p_member).
create or replace function public.j_berita_pilihan(p public.berita_pilihan, p_member bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'edisi_id', p.edisi_id, 'urutan', p.urutan, 'url', p.url, 'judul', p.judul, 'sumber', p.sumber,
    'terbit_at', p.terbit_at, 'wilayah', p.wilayah, 'kategori', p.kategori, 'skor', p.skor, 'ringkasan', p.ringkasan,
    'dampak', p.dampak, 'bahan_relasi', p.bahan_relasi,
    'dibaca', t.dibaca_at is not null, 'disimpan', t.disimpan_at is not null, 'kurang', t.kurang_at is not null,
    'disimpan_at', t.disimpan_at)
  from (select 1) x
  left join public.berita_tanda t on t.pilihan_id = p.id and t.member_id = p_member
$$;

-- ============================================================ x_: Edge / agent
-- Daftar feed aktif untuk ditarik Edge.
create or replace function public.x_berita_sumber(p_aktor bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  perform public.berita_wajib_aktor();
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nama', s.nama, 'url', s.url, 'wilayah', s.wilayah,
                                                       'topik', s.topik) order by s.urutan, s.id)
                     from public.berita_sumber s where s.aktif), '[]'::jsonb);
end; $$;

-- Simpan hasil tarik. p = {"hasil":[{"sumber_id", "ok":bool, "galat"?:text,
--                                   "items":[{"url", "judul", "cuplikan"?, "penerbit"?, "terbit"?:ISO}]}]}
--   * Item tidak sah (URL bukan http(s), judul kosong) DILEWATI, bukan menggagalkan semua (feed sering kotor).
--   * Dobel: URL sudah ada, atau judul_kunci sama dalam 3 hari terakhir (sumber lain memuat berita yang sama).
--   * Status sumber diperbarui (terakhir_tarik/ok/galat/item). Item > 14 hari (ditarik_at) dihapus.
-- Hasil: {"sumber", "sumber_ok", "sumber_galat", "item", "baru", "dobel", "dilewati", "dihapus"}.
create or replace function public.x_berita_simpan(p_aktor bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_h jsonb; v_it jsonb; v_sid text; v_url text; v_judul text; v_kunci text; v_pen text;
  v_n_sumber int := 0; v_ok int := 0; v_gal int := 0; v_item int := 0; v_baru int := 0; v_dobel int := 0;
  v_lewat int := 0; v_hapus int := 0; v_total int := 0;
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  perform public.berita_wajib_aktor();
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'hasil') is distinct from 'array' then
    perform public.lempar('PT400', 'hasil wajib berupa array {sumber_id, ok, galat?, items}', 'INPUT_001');
  end if;
  if jsonb_array_length(p->'hasil') > 200 then perform public.lempar('PT400', 'Maksimal 200 sumber per panggilan', 'INPUT_001'); end if;
  select coalesce(sum(case when jsonb_typeof(h->'items') = 'array' then jsonb_array_length(h->'items') else 0 end), 0)
    into v_total from jsonb_array_elements(p->'hasil') h;
  if v_total > 6000 then perform public.lempar('PT400', format('Maksimal 6000 item per panggilan (dikirim %s)', v_total), 'INPUT_001'); end if;

  for v_h in select * from jsonb_array_elements(p->'hasil') loop
    v_sid := v_h->>'sumber_id';
    if v_sid is null or not exists (select 1 from public.berita_sumber s where s.id = v_sid) then
      perform public.lempar('PT400', format('sumber_id tidak dikenal: %s', coalesce(v_sid, 'null')), 'INPUT_001');
    end if;
    v_n_sumber := v_n_sumber + 1;
    if coalesce((v_h->>'ok')::boolean, false) then
      v_ok := v_ok + 1;
      update public.berita_sumber set terakhir_tarik = now(), terakhir_ok = now(), terakhir_galat = null,
             terakhir_item = case when jsonb_typeof(v_h->'items') = 'array' then jsonb_array_length(v_h->'items') else 0 end
       where id = v_sid;
    else
      v_gal := v_gal + 1;
      update public.berita_sumber set terakhir_tarik = now(),
             terakhir_galat = coalesce(public.berita_teks(v_h->>'galat', 300), 'Gagal tanpa keterangan')
       where id = v_sid;
    end if;
    if jsonb_typeof(v_h->'items') is distinct from 'array' then continue; end if;

    for v_it in select * from jsonb_array_elements(v_h->'items') loop
      v_item := v_item + 1;
      v_url := btrim(coalesce(v_it->>'url', ''));
      v_judul := public.berita_teks(v_it->>'judul', 400);
      if jsonb_typeof(v_it) is distinct from 'object' or v_url !~ '^https?://[^\s]+$' or char_length(v_url) not between 10 and 2000
         or v_judul is null then
        v_lewat := v_lewat + 1;
        continue;
      end if;
      v_kunci := public.berita_kunci(v_judul);
      if exists (select 1 from public.berita b where b.url = v_url)
         or (char_length(v_kunci) >= 15 and exists (select 1 from public.berita b
                                                    where b.judul_kunci = v_kunci and b.ditarik_at > now() - interval '3 days')) then
        v_dobel := v_dobel + 1;
        continue;
      end if;
      v_pen := public.berita_teks(v_it->>'penerbit', 120);
      insert into public.berita (sumber_id, url, judul, judul_kunci, cuplikan, penerbit, terbit_at)
      values (v_sid, v_url, v_judul, v_kunci, public.berita_teks(v_it->>'cuplikan', 600), v_pen,
              public.berita_waktu(v_it->>'terbit'))
      on conflict (url) do nothing;
      if found then v_baru := v_baru + 1; else v_dobel := v_dobel + 1; end if;
    end loop;
  end loop;

  delete from public.berita where ditarik_at < now() - interval '14 days';
  get diagnostics v_hapus = row_count;
  return jsonb_build_object('sumber', v_n_sumber, 'sumber_ok', v_ok, 'sumber_galat', v_gal, 'item', v_item, 'baru', v_baru,
                            'dobel', v_dobel, 'dilewati', v_lewat, 'dihapus', v_hapus);
end; $$;

-- Kandidat untuk kurator. p = {"jam"?: 1–48, "batas"?: 1–800}
--   Jendela = sejak edisi terakhir − 30 menit (paling jauh 48 jam), atau `jam` bila diisi; default 12 jam bila belum ada
--   edisi. Item yang sudah jadi pilihan dalam 48 jam terakhir tidak dikirim lagi. Urut terbaru dulu, maks `batas` (400).
-- Hasil: {"sekarang", "sejak", "edisi_terakhir":{id, dibuat_at, pilihan:[{judul, url, skor}]}|null, "jumlah",
--         "kandidat":[{id, sumber, wilayah, topik, penerbit, judul, cuplikan, terbit_at}],
--         "umpan_balik":{"disimpan":[{judul, kategori}], "kurang":[{judul, kategori}]}, "sumber_galat":[{id, nama, galat}]}
create or replace function public.x_berita_kandidat(p_aktor bigint, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_jam int; v_batas int; v_sejak timestamptz; v_ed public.berita_edisi; v_k jsonb; v_n int;
begin
  perform public.mulai_api(p_aktor, 'api', 'baca');
  perform public.berita_wajib_aktor();
  p := coalesce(p, '{}'::jsonb);
  if jsonb_typeof(p) is distinct from 'object' then perform public.lempar('PT400', 'Parameter harus objek', 'INPUT_001'); end if;
  if p ? 'jam' and (jsonb_typeof(p->'jam') is distinct from 'number' or (p->>'jam')::numeric not between 1 and 48) then
    perform public.lempar('PT400', 'jam harus angka 1–48', 'INPUT_001');
  end if;
  if p ? 'batas' and (jsonb_typeof(p->'batas') is distinct from 'number' or (p->>'batas')::numeric not between 1 and 800) then
    perform public.lempar('PT400', 'batas harus angka 1–800', 'INPUT_001');
  end if;
  v_jam := (p->>'jam')::int;
  v_batas := coalesce((p->>'batas')::int, 400);
  select * into v_ed from public.berita_edisi order by dibuat_at desc, id desc limit 1;
  v_sejak := case
    when v_jam is not null then now() - make_interval(hours => v_jam)
    when v_ed.id is not null then greatest(v_ed.dibuat_at - interval '30 minutes', now() - interval '48 hours')
    else now() - interval '12 hours' end;

  with c as (
    select b.*, s.nama as s_nama, s.wilayah as s_wilayah, s.topik as s_topik
      from public.berita b join public.berita_sumber s on s.id = b.sumber_id
     where b.ditarik_at >= v_sejak
       and not exists (select 1 from public.berita_pilihan bp join public.berita_edisi e on e.id = bp.edisi_id
                        where bp.berita_id = b.id and e.dibuat_at > now() - interval '48 hours')
     order by b.waktu desc, b.id desc
     limit v_batas)
  -- ringkas (hemat token kurator): kunci bernilai null dibuang, cuplikan 180 karakter
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'id', c.id, 'sumber', c.s_nama, 'wilayah', c.s_wilayah, 'topik', c.s_topik, 'penerbit', c.penerbit,
                    'judul', c.judul, 'cuplikan', left(c.cuplikan, 180), 'terbit_at', c.terbit_at))
                  order by c.waktu desc, c.id desc), '[]'::jsonb),
         count(*)::int
    into v_k, v_n from c;

  return jsonb_build_object(
    'sekarang', now(), 'sejak', v_sejak, 'jumlah', v_n, 'kandidat', v_k,
    'edisi_terakhir', case when v_ed.id is null then null else jsonb_build_object(
      'id', v_ed.id, 'dibuat_at', v_ed.dibuat_at,
      'pilihan', (select coalesce(jsonb_agg(jsonb_build_object('judul', bp.judul, 'url', bp.url, 'skor', bp.skor)
                                            order by bp.urutan), '[]'::jsonb)
                    from public.berita_pilihan bp where bp.edisi_id = v_ed.id)) end,
    'umpan_balik', jsonb_build_object(
      'disimpan', (select coalesce(jsonb_agg(jsonb_build_object('judul', x.judul, 'kategori', x.kategori)), '[]'::jsonb)
                     from (select bp.judul, bp.kategori from public.berita_tanda t
                             join public.berita_pilihan bp on bp.id = t.pilihan_id
                            where t.disimpan_at is not null order by t.disimpan_at desc limit 20) x),
      'kurang', (select coalesce(jsonb_agg(jsonb_build_object('judul', x.judul, 'kategori', x.kategori)), '[]'::jsonb)
                   from (select bp.judul, bp.kategori from public.berita_tanda t
                           join public.berita_pilihan bp on bp.id = t.pilihan_id
                          where t.kurang_at is not null order by t.kurang_at desc limit 20) x)),
    'sumber_galat', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nama', s.nama, 'galat', s.terakhir_galat)
                                               order by s.urutan), '[]'::jsonb)
                       from public.berita_sumber s where s.aktif and s.terakhir_galat is not null));
end; $$;

-- Simpan satu edisi kurasi (semua-atau-tidak; pesan galat menyebut item yang salah supaya agent bisa memperbaiki).
-- p = {"garis_besar": teks 1–2000, "pantau"?: teks ≤1000, "kandidat"?: int, "catatan"?: teks ≤500,
--      "pilihan": [ 1–30 × {"berita_id"?: id kandidat, "url"?: http(s) (wajib bila tanpa berita_id), "judul": 1–300,
--                   "sumber"?: 1–120 (bawaan: penerbit/nama sumber kandidat), "terbit"?: ISO, "wilayah": dalam|luar,
--                   "kategori": ekonomi|kebijakan|industri|logistik|komoditas|bisnis|geopolitik|nasional|teknologi|lainnya,
--                   "skor": 1–5, "ringkasan": 1–1200, "dampak": 1–800, "bahan_relasi"?: ≤600} ] }
--   Urutan tampil = skor turun, lalu urutan kiriman. URL ganda dalam satu edisi → PT400. Edisi > 120 hari yang tidak
--   punya pilihan tersimpan dihapus. Hasil: {"id", "dibuat_at", "pilihan": n}.
create or replace function public.x_berita_edisi_simpan(p_aktor bigint, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_aktor bigint; v_it jsonb; v_i int := -1; v_ref text; v_k text; v_b public.berita; v_bid bigint;
  v_url text; v_judul text; v_sumber text; v_ring text; v_dampak text; v_rel text; v_skor int; v_wil text; v_kat text;
  v_terbit timestamptz; v_urls text[] := '{}'; v_rows jsonb := '[]'::jsonb; v_ed public.berita_edisi; v_n int := 0;
  v_garis text; v_pantau text; v_cat text;
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  v_aktor := public.berita_wajib_aktor();
  if jsonb_typeof(p) is distinct from 'object' then perform public.lempar('PT400', 'Body harus objek', 'INPUT_001'); end if;
  select k into v_k from jsonb_object_keys(p) k where k not in ('garis_besar', 'pantau', 'kandidat', 'catatan', 'pilihan') limit 1;
  if v_k is not null then
    perform public.lempar('PT400', format('Kunci tidak dikenal: %s (yang sah: garis_besar, pantau, kandidat, catatan, pilihan)', v_k), 'INPUT_001');
  end if;
  v_garis := btrim(coalesce(p->>'garis_besar', ''));
  if jsonb_typeof(p->'garis_besar') is distinct from 'string' or char_length(v_garis) not between 1 and 2000 then
    perform public.lempar('PT400', 'garis_besar wajib (teks 1–2000 karakter)', 'INPUT_001');
  end if;
  v_pantau := nullif(btrim(coalesce(p->>'pantau', '')), '');
  if p ? 'pantau' and jsonb_typeof(p->'pantau') not in ('string', 'null') or char_length(v_pantau) > 1000 then
    perform public.lempar('PT400', 'pantau harus teks ≤1000 karakter', 'INPUT_001');
  end if;
  v_cat := nullif(btrim(coalesce(p->>'catatan', '')), '');
  if p ? 'catatan' and jsonb_typeof(p->'catatan') not in ('string', 'null') or char_length(v_cat) > 500 then
    perform public.lempar('PT400', 'catatan harus teks ≤500 karakter', 'INPUT_001');
  end if;
  if p ? 'kandidat' and (jsonb_typeof(p->'kandidat') is distinct from 'number' or (p->>'kandidat')::numeric < 0
                         or (p->>'kandidat')::numeric <> trunc((p->>'kandidat')::numeric) or (p->>'kandidat')::numeric > 100000) then
    perform public.lempar('PT400', 'kandidat harus bilangan bulat ≥ 0', 'INPUT_001');
  end if;
  if jsonb_typeof(p->'pilihan') is distinct from 'array' or jsonb_array_length(p->'pilihan') not between 1 and 30 then
    perform public.lempar('PT400', 'pilihan wajib array berisi 1–30 berita', 'INPUT_001');
  end if;

  for v_it in select * from jsonb_array_elements(p->'pilihan') loop
    v_i := v_i + 1;
    v_ref := format('pilihan[%s]', v_i);
    if jsonb_typeof(v_it) is distinct from 'object' then perform public.lempar('PT400', format('%s: harus objek', v_ref), 'INPUT_001'); end if;
    select k into v_k from jsonb_object_keys(v_it) k
     where k not in ('berita_id', 'url', 'judul', 'sumber', 'terbit', 'wilayah', 'kategori', 'skor', 'ringkasan', 'dampak',
                     'bahan_relasi') limit 1;
    if v_k is not null then
      perform public.lempar('PT400', format('%s: kunci tidak dikenal: %s (yang sah: berita_id, url, judul, sumber, terbit, wilayah, kategori, skor, ringkasan, dampak, bahan_relasi)', v_ref, v_k), 'INPUT_001');
    end if;
    -- kandidat (opsional)
    v_b := null; v_bid := null;
    if v_it ? 'berita_id' and jsonb_typeof(v_it->'berita_id') <> 'null' then
      if jsonb_typeof(v_it->'berita_id') is distinct from 'number' or (v_it->>'berita_id')::numeric <> trunc((v_it->>'berita_id')::numeric) then
        perform public.lempar('PT400', format('%s: berita_id harus angka id kandidat', v_ref), 'INPUT_001');
      end if;
      select * into v_b from public.berita where id = (v_it->>'berita_id')::bigint;
      if v_b.id is null then perform public.lempar('PT400', format('%s: berita_id %s tidak ada (kandidat > 14 hari terhapus?)', v_ref, v_it->>'berita_id'), 'INPUT_001'); end if;
      v_bid := v_b.id;
    end if;
    v_url := btrim(coalesce(v_it->>'url', v_b.url, ''));
    if v_url !~ '^https?://[^\s]+$' or char_length(v_url) > 2000 then
      perform public.lempar('PT400', format('%s: url wajib http(s) (atau isi berita_id)', v_ref), 'INPUT_001');
    end if;
    if v_url = any (v_urls) then perform public.lempar('PT400', format('%s: url ganda dalam satu edisi', v_ref), 'INPUT_001'); end if;
    v_urls := v_urls || v_url;
    v_judul := public.berita_teks(coalesce(v_it->>'judul', v_b.judul), 300);
    if v_judul is null then perform public.lempar('PT400', format('%s: judul wajib', v_ref), 'INPUT_001'); end if;
    v_sumber := public.berita_teks(coalesce(v_it->>'sumber', v_b.penerbit,
                                            (select s.nama from public.berita_sumber s where s.id = v_b.sumber_id)), 120);
    if v_sumber is null then perform public.lempar('PT400', format('%s: sumber wajib (nama media)', v_ref), 'INPUT_001'); end if;
    v_wil := v_it->>'wilayah';
    if v_wil is null or v_wil not in ('dalam', 'luar') then
      perform public.lempar('PT400', format('%s: wilayah harus "dalam" atau "luar"', v_ref), 'INPUT_001');
    end if;
    v_kat := v_it->>'kategori';
    if v_kat is null or v_kat not in ('ekonomi', 'kebijakan', 'industri', 'logistik', 'komoditas', 'bisnis', 'geopolitik',
                                      'nasional', 'teknologi', 'lainnya') then
      perform public.lempar('PT400', format('%s: kategori tidak dikenal: %s (ekonomi, kebijakan, industri, logistik, komoditas, bisnis, geopolitik, nasional, teknologi, lainnya)', v_ref, coalesce(v_kat, 'kosong')), 'INPUT_001');
    end if;
    if jsonb_typeof(v_it->'skor') is distinct from 'number' or (v_it->>'skor')::numeric not in (1, 2, 3, 4, 5) then
      perform public.lempar('PT400', format('%s: skor harus 1–5', v_ref), 'INPUT_001');
    end if;
    v_skor := (v_it->>'skor')::int;
    v_ring := btrim(coalesce(v_it->>'ringkasan', ''));
    if char_length(v_ring) not between 1 and 1200 then perform public.lempar('PT400', format('%s: ringkasan wajib (1–1200 karakter)', v_ref), 'INPUT_001'); end if;
    v_dampak := btrim(coalesce(v_it->>'dampak', ''));
    if char_length(v_dampak) not between 1 and 800 then perform public.lempar('PT400', format('%s: dampak wajib (1–800 karakter)', v_ref), 'INPUT_001'); end if;
    v_rel := nullif(btrim(coalesce(v_it->>'bahan_relasi', '')), '');
    if char_length(v_rel) > 600 then perform public.lempar('PT400', format('%s: bahan_relasi maks 600 karakter', v_ref), 'INPUT_001'); end if;
    v_terbit := coalesce(public.berita_waktu(v_it->>'terbit'), v_b.terbit_at);
    v_rows := v_rows || jsonb_build_object('i', v_i, 'berita_id', v_bid, 'url', v_url, 'judul', v_judul, 'sumber', v_sumber,
                                           'terbit_at', v_terbit, 'wilayah', v_wil, 'kategori', v_kat, 'skor', v_skor,
                                           'ringkasan', v_ring, 'dampak', v_dampak, 'bahan_relasi', v_rel);
  end loop;

  insert into public.berita_edisi (dibuat_oleh, garis_besar, pantau, kandidat, catatan)
  values (v_aktor, v_garis, v_pantau, (p->>'kandidat')::int, v_cat)
  returning * into v_ed;
  insert into public.berita_pilihan (edisi_id, berita_id, urutan, url, judul, sumber, terbit_at, wilayah, kategori, skor,
                                     ringkasan, dampak, bahan_relasi)
  select v_ed.id, (r->>'berita_id')::bigint, (row_number() over (order by (r->>'skor')::int desc, (r->>'i')::int))::smallint,
         r->>'url', r->>'judul', r->>'sumber', (r->>'terbit_at')::timestamptz, r->>'wilayah', r->>'kategori',
         (r->>'skor')::smallint, r->>'ringkasan', r->>'dampak', r->>'bahan_relasi'
    from jsonb_array_elements(v_rows) r;
  get diagnostics v_n = row_count;

  delete from public.berita_edisi e
   where e.dibuat_at < now() - interval '120 days'
     and not exists (select 1 from public.berita_pilihan bp join public.berita_tanda t on t.pilihan_id = bp.id
                      where bp.edisi_id = e.id and t.disimpan_at is not null);
  return jsonb_build_object('id', v_ed.id, 'dibuat_at', v_ed.dibuat_at, 'pilihan', v_n);
end; $$;

-- ============================================================ web_: owner
-- Edisi kurasi. p = {"edisi"?: id} (bawaan: terbaru).
-- Hasil: {"edisi": {id, dibuat_at, garis_besar, pantau, kandidat, catatan, pilihan:[…]}|null,
--         "daftar_edisi": [{id, dibuat_at, jumlah, wajib}] (30 terbaru), "tersimpan": n,
--         "sumber": {aktif, galat, terakhir_tarik}}
create or replace function public.web_berita(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_m bigint; v_ed public.berita_edisi;
begin
  v_m := public.mulai_web(true);
  p := coalesce(p, '{}'::jsonb);
  if p ? 'edisi' and jsonb_typeof(p->'edisi') <> 'null' then
    if jsonb_typeof(p->'edisi') is distinct from 'number' then perform public.lempar('PT400', 'edisi harus angka', 'INPUT_001'); end if;
    select * into v_ed from public.berita_edisi where id = (p->>'edisi')::bigint;
    if v_ed.id is null then perform public.lempar('PT404', 'Edisi berita tidak ditemukan', 'ITEM_013'); end if;
  else
    select * into v_ed from public.berita_edisi order by dibuat_at desc, id desc limit 1;
  end if;
  return jsonb_build_object(
    'edisi', case when v_ed.id is null then null else jsonb_build_object(
      'id', v_ed.id, 'dibuat_at', v_ed.dibuat_at, 'garis_besar', v_ed.garis_besar, 'pantau', v_ed.pantau,
      'kandidat', v_ed.kandidat, 'catatan', v_ed.catatan,
      'pilihan', (select coalesce(jsonb_agg(public.j_berita_pilihan(bp, v_m) order by bp.urutan), '[]'::jsonb)
                    from public.berita_pilihan bp where bp.edisi_id = v_ed.id)) end,
    'daftar_edisi', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'dibuat_at', x.dibuat_at, 'jumlah', x.jumlah,
                                                                  'wajib', x.wajib) order by x.dibuat_at desc, x.id desc), '[]'::jsonb)
                       from (select e.id, e.dibuat_at, count(bp.id)::int as jumlah, count(bp.id) filter (where bp.skor = 5)::int as wajib
                               from public.berita_edisi e left join public.berita_pilihan bp on bp.edisi_id = e.id
                              group by e.id order by e.dibuat_at desc, e.id desc limit 30) x),
    'tersimpan', (select count(*)::int from public.berita_tanda t where t.member_id = v_m and t.disimpan_at is not null),
    'sumber', (select jsonb_build_object('aktif', count(*) filter (where s.aktif)::int,
                                         'galat', count(*) filter (where s.aktif and s.terakhir_galat is not null)::int,
                                         'terakhir_tarik', max(s.terakhir_tarik))
                 from public.berita_sumber s));
end; $$;

-- Semua item tarikan (mentah). p = {"wilayah"?: dalam|luar, "sumber"?: id, "q"?: kata-kata (semua harus ada), "sebelum"?: id (paginasi),
--   "batas"?: 1–200 (bawaan 60)}. Urut waktu (terbit, atau saat ditarik) terbaru dulu.
-- Hasil: {"items":[{id, sumber_id, sumber, wilayah, topik, penerbit, judul, cuplikan, url, terbit_at, ditarik_at}],
--         "berikut": id|null, "sumber":[{id, nama, wilayah, topik, aktif, terakhir_tarik, terakhir_ok, terakhir_galat,
--         terakhir_item, item_24j}]}
create or replace function public.web_berita_semua(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_wil text; v_sid text; v_q text; v_seb bigint; v_batas int; v_waktu timestamptz; v_items jsonb; v_berikut bigint;
begin
  perform public.mulai_web(true);
  p := coalesce(p, '{}'::jsonb);
  v_wil := nullif(p->>'wilayah', '');
  if v_wil is not null and v_wil not in ('dalam', 'luar') then perform public.lempar('PT400', 'wilayah harus dalam/luar', 'INPUT_001'); end if;
  v_sid := nullif(p->>'sumber', '');
  v_q := nullif(btrim(coalesce(p->>'q', '')), '');
  if char_length(v_q) > 100 then perform public.lempar('PT400', 'Kata cari maksimal 100 karakter', 'INPUT_001'); end if;
  if p ? 'sebelum' and jsonb_typeof(p->'sebelum') not in ('number', 'null') then
    perform public.lempar('PT400', 'sebelum harus angka', 'INPUT_001');
  end if;
  v_seb := (p->>'sebelum')::bigint;
  if p ? 'batas' and (jsonb_typeof(p->'batas') is distinct from 'number' or (p->>'batas')::numeric not between 1 and 200) then
    perform public.lempar('PT400', 'batas harus 1–200', 'INPUT_001');
  end if;
  v_batas := coalesce((p->>'batas')::int, 60);
  if v_seb is not null then select b.waktu into v_waktu from public.berita b where b.id = v_seb; end if;

  with c as (
    select b.*, s.nama as s_nama, s.wilayah as s_wilayah, s.topik as s_topik
      from public.berita b join public.berita_sumber s on s.id = b.sumber_id
     where (v_wil is null or s.wilayah = v_wil)
       and (v_sid is null or b.sumber_id = v_sid)
       -- tiap kata harus ada di judul atau cuplikan (urutan bebas); % _ \ di kata dicari harfiah
       and (v_q is null or not exists (
             select 1 from regexp_split_to_table(v_q, '\s+') w(k)
              where w.k <> ''
                and not (b.judul || ' ' || coalesce(b.cuplikan, '')) ilike
                        '%' || replace(replace(replace(w.k, '\', '\\'), '%', '\%'), '_', '\_') || '%'))
       and (v_seb is null or v_waktu is null or (b.waktu, b.id) < (v_waktu, v_seb))
     order by b.waktu desc, b.id desc
     limit v_batas + 1)
  select coalesce(jsonb_agg(x.j order by x.waktu desc, x.id desc) filter (where x.rn <= v_batas), '[]'::jsonb),
         (max(x.id) filter (where x.rn = v_batas) * (case when count(*) > v_batas then 1 end))
    into v_items, v_berikut
    from (select c.id, c.waktu, row_number() over (order by c.waktu desc, c.id desc) as rn,
                 jsonb_build_object('id', c.id, 'sumber_id', c.sumber_id, 'sumber', c.s_nama, 'wilayah', c.s_wilayah,
                                    'topik', c.s_topik, 'penerbit', c.penerbit, 'judul', c.judul, 'cuplikan', c.cuplikan,
                                    'url', c.url, 'terbit_at', c.terbit_at, 'ditarik_at', c.ditarik_at) as j
            from c) x;

  return jsonb_build_object('items', v_items, 'berikut', v_berikut,
    'sumber', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', s.id, 'nama', s.nama, 'wilayah', s.wilayah, 'topik', s.topik, 'aktif', s.aktif,
                 'terakhir_tarik', s.terakhir_tarik, 'terakhir_ok', s.terakhir_ok, 'terakhir_galat', s.terakhir_galat,
                 'terakhir_item', s.terakhir_item,
                 'item_24j', (select count(*)::int from public.berita b where b.sumber_id = s.id and b.ditarik_at > now() - interval '24 hours'))
               order by s.urutan, s.id), '[]'::jsonb)
                 from public.berita_sumber s));
end; $$;

-- Pilihan yang disimpan owner (terbaru disimpan dulu, maks 200).
create or replace function public.web_berita_tersimpan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_m bigint;
begin
  v_m := public.mulai_web(true);
  return jsonb_build_object('items', (select coalesce(jsonb_agg(x.j order by x.disimpan_at desc), '[]'::jsonb) from (
    select public.j_berita_pilihan(bp, v_m) as j, t.disimpan_at
      from public.berita_tanda t join public.berita_pilihan bp on bp.id = t.pilihan_id
     where t.member_id = v_m and t.disimpan_at is not null
     order by t.disimpan_at desc limit 200) x));
end; $$;

-- Tanda owner pada satu pilihan. p = {"pilihan_id", "dibaca"?: bool, "disimpan"?: bool, "kurang"?: bool}
-- (kunci yang tidak dikirim tidak berubah). Hasil: pilihan (j_berita_pilihan).
create or replace function public.web_berita_tanda(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_m bigint; v_id bigint; v_bp public.berita_pilihan; v_k text;
begin
  v_m := public.mulai_web(true);
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'pilihan_id') is distinct from 'number' then
    perform public.lempar('PT400', 'pilihan_id wajib (angka)', 'INPUT_001');
  end if;
  select k into v_k from jsonb_object_keys(p) k where k not in ('pilihan_id', 'dibaca', 'disimpan', 'kurang') limit 1;
  if v_k is not null then perform public.lempar('PT400', format('Kunci tidak dikenal: %s', v_k), 'INPUT_001'); end if;
  select k into v_k from jsonb_object_keys(p) k where k in ('dibaca', 'disimpan', 'kurang') and jsonb_typeof(p->k) <> 'boolean' limit 1;
  if v_k is not null then perform public.lempar('PT400', format('%s harus true/false', v_k), 'INPUT_001'); end if;
  v_id := (p->>'pilihan_id')::bigint;
  select * into v_bp from public.berita_pilihan where id = v_id;
  if v_bp.id is null then perform public.lempar('PT404', 'Berita pilihan tidak ditemukan', 'ITEM_013'); end if;
  insert into public.berita_tanda (member_id, pilihan_id) values (v_m, v_id) on conflict do nothing;
  update public.berita_tanda t set
    dibaca_at   = case when not p ? 'dibaca' then t.dibaca_at when (p->>'dibaca')::boolean then coalesce(t.dibaca_at, now()) end,
    disimpan_at = case when not p ? 'disimpan' then t.disimpan_at when (p->>'disimpan')::boolean then coalesce(t.disimpan_at, now()) end,
    kurang_at   = case when not p ? 'kurang' then t.kurang_at when (p->>'kurang')::boolean then coalesce(t.kurang_at, now()) end
   where t.member_id = v_m and t.pilihan_id = v_id;
  return public.j_berita_pilihan(v_bp, v_m);
end; $$;

-- ============================================================ hak
revoke all on function
  public.berita_wajib_aktor(), public.berita_kunci(text), public.berita_teks(text, int), public.berita_waktu(text),
  public.j_berita_pilihan(public.berita_pilihan, bigint),
  public.x_berita_sumber(bigint), public.x_berita_simpan(bigint, jsonb), public.x_berita_kandidat(bigint, jsonb),
  public.x_berita_edisi_simpan(bigint, jsonb),
  public.web_berita(jsonb), public.web_berita_semua(jsonb), public.web_berita_tersimpan(), public.web_berita_tanda(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.web_berita(jsonb), public.web_berita_semua(jsonb), public.web_berita_tersimpan(),
  public.web_berita_tanda(jsonb) to authenticated;
grant execute on function public.x_berita_sumber(bigint), public.x_berita_simpan(bigint, jsonb),
  public.x_berita_kandidat(bigint, jsonb), public.x_berita_edisi_simpan(bigint, jsonb) to service_role;
