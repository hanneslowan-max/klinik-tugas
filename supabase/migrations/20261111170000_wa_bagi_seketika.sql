-- Pembagian SEKETIKA chat WA 0878 baru di jam kerja (keputusan Hannes 11 Nov 2026, pop-up B24 sesi rhj-brain:
-- "Hapus jeda sekarang + bangun versi seketika"). Chat baru jam kerja langsung ditunjuk bergiliran ke sales (Riksa /
-- Michael) dalam ±1–2 menit dan diumumkan ke grup Telegram RHJ Online Sales (nomor chat boleh di grup sales, keputusan
-- 29 Okt). Lead Anvil TETAP dibuat routine Pantau WA Jam sesudah chat dinilai calon pembeli; routine memakai pemilik
-- dari tabel ini (GET /x/wa/penugasan).
--
-- Alur: webhook Kapso → Edge x_wa_webhook (tidak diubah) → Edge x_wa_bagi_calon (berkas ini): chat masuk jam kerja dari
--   nomor tanpa jejak 7 hari (wa.log, wa.penugasan, lead Anvil) → baris 'calon'.
--   pg_cron tiap menit → wa.picu_bagi() → pg_net POST /x/wa/bagi (token TOKEN_WA_PROSES) → Edge membaca chat lewat API
--   Kapso (percakapan lama / sudah dibalas sales) → x_wa_bagi_hasil (pemilik bergiliran) → Telegram grup sales →
--   x_wa_bagi_umum (tanda terkirim).
-- Saklar: wa.bagi_setel.aktif (bawaan MATI) + daftar sales; diubah lewat POST /x/wa/bagi-setel (owner/bot).
-- Isi chat TIDAK masuk DB. Nomor disimpan (perlu untuk pengumuman & pencocokan lead), retensi 30 hari.

-- ============================================================ tabel
create table wa.bagi_setel (
  id          boolean primary key default true check (id),
  aktif       boolean not null default false,
  sales       bigint[] not null default '{}',          -- anggota yang ikut giliran (urut = urutan seri)
  jeda_detik  int not null default 60 check (jeda_detik between 0 and 900),  -- tunggu pesan beruntun / balasan sales
  hari_baru   int not null default 7 check (hari_baru between 1 and 60),     -- tanpa jejak sekian hari = chat baru
  diubah_pada timestamptz not null default now(),
  diubah_oleh bigint
);
insert into wa.bagi_setel (id) values (true);

create table wa.penugasan (
  id              bigint generated always as identity primary key,
  nomor           text not null check (nomor ~ '^62[0-9]{8,13}$'),
  percakapan      text check (percakapan is null or char_length(percakapan) <= 100),
  masuk_pada      timestamptz not null,                -- pesan pertama pelanggan
  status          text not null default 'calon' check (status in ('calon', 'ditugaskan', 'batal')),
  alasan          text check (alasan is null or alasan ~ '^[a-z_]{1,40}$'),
  pemilik         bigint references public.members (id),
  ditugaskan_pada timestamptz,
  diumumkan_pada  timestamptz,
  percobaan_umum  int not null default 0,
  dibuat_pada     timestamptz not null default now(),
  diubah_pada     timestamptz not null default now()
);
create unique index penugasan_satu_calon on wa.penugasan (nomor) where status = 'calon';
create index penugasan_nomor_idx on wa.penugasan (nomor, dibuat_pada);
create index penugasan_tugas_idx on wa.penugasan (pemilik, ditugaskan_pada) where status = 'ditugaskan';
create index penugasan_dibuat_idx on wa.penugasan (dibuat_pada);

alter table wa.bagi_setel enable row level security;
alter table wa.penugasan  enable row level security;
revoke all on table wa.bagi_setel, wa.penugasan from public, anon, authenticated, service_role;
revoke all on all sequences in schema wa from public, anon, authenticated, service_role;

-- nama panggilan sales untuk pengumuman (kata pertama nama, atau username)
create or replace function wa.nama_sales(p_id bigint)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(initcap(split_part(btrim(coalesce(m.nama, '')), ' ', 1)), ''), m.username)
    from public.members m where m.id = p_id
$$;

-- ============================================================ calon (dipanggil Edge sesudah x_wa_webhook)
-- p = {sekarang?, items:[ItemWebhook…]} (item sama dengan x_wa_webhook). Hasil {aktif, calon:n, lewat:{alasan:n}}.
-- Item dilewati tanpa baris: bukan masuk / history_sync / reaksi / stiker / tes / stop / luar jam kerja / pesan > 1 jam /
-- nomor diam / nomor uji / sudah ada baris penugasan ≤ hari_baru hari. Baris 'batal' (dicatat supaya tidak dicek ulang):
-- percakapan_berjalan (jejak wa.log ≤ hari_baru hari) / lead_ada (lead BARU/PENAWARAN, atau lead apa pun ≤ hari_baru hari).
create or replace function wa.inti_bagi_calon(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s wa.bagi_setel;
  v_now timestamptz := wa.waktu_dari(p);
  it jsonb; v_id text; v_nomor text; v_jenis text; v_waktu timestamptz; v_alasan text;
  v_calon int := 0; v_lewat jsonb := '{}'::jsonb;
begin
  select * into s from wa.bagi_setel;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') > 100 then
    perform public.lempar('PT400', 'items harus array (maks 100)', 'INPUT_001');
  end if;
  if not s.aktif then return jsonb_build_object('aktif', false, 'calon', 0, 'lewat', '{}'::jsonb); end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    v_id    := nullif(left(btrim(coalesce(it->>'id_pesan', '')), 200), '');
    v_nomor := wa.norm_nomor(it->>'nomor');
    v_jenis := lower(coalesce(nullif(it->>'jenis', ''), 'lain'));
    v_alasan := null;
    if it->>'arah' is distinct from 'masuk' or v_nomor is null or v_id is null or coalesce(it->>'asal', '') = 'history_sync' then
      continue;
    end if;
    begin
      v_waktu := (it->>'waktu')::timestamptz;
    exception when others then v_waktu := v_now;
    end;
    if v_waktu is null or v_waktu > v_now + interval '5 minutes' then v_waktu := v_now; end if;

    if v_jenis in ('reaction', 'sticker') or coalesce((it->>'tes')::boolean, false) or coalesce((it->>'stop')::boolean, false) then
      v_alasan := 'bukan_chat';
    elsif not wa.jam_kerja(v_waktu) then
      v_alasan := 'luar_jam';
    elsif v_waktu < v_now - interval '1 hour' then
      v_alasan := 'pesan_lama';
    elsif exists (select 1 from wa.diam d where d.nomor = v_nomor) then
      v_alasan := 'daftar_diam';
    elsif exists (select 1 from wa.uji u where u.nomor = v_nomor) then
      v_alasan := 'nomor_uji';
    elsif exists (select 1 from wa.penugasan x where x.nomor = v_nomor
                    and (x.status = 'calon' or x.dibuat_pada > v_now - make_interval(days => s.hari_baru))) then
      v_alasan := 'sudah_tercatat';
    end if;
    if v_alasan is not null then
      v_lewat := jsonb_set(v_lewat, array[v_alasan], to_jsonb(coalesce((v_lewat->>v_alasan)::int, 0) + 1));
      continue;
    end if;

    if exists (select 1 from wa.log l
                where l.nomor_hash = wa.hash_nomor(v_nomor) and l.id_pesan is distinct from v_id
                  and l.waktu < v_waktu and l.waktu > v_waktu - make_interval(days => s.hari_baru)) then
      v_alasan := 'percakapan_berjalan';
    elsif exists (select 1 from public.lead ld join public.kontak k on k.id = ld.kontak_id
                   where k.telepon = v_nomor
                     and (ld.tahap in ('BARU', 'PENAWARAN') or ld.dibuat_pada > v_now - make_interval(days => s.hari_baru))) then
      v_alasan := 'lead_ada';
    end if;

    insert into wa.penugasan (nomor, percakapan, masuk_pada, status, alasan)
    values (v_nomor, nullif(left(it->>'percakapan', 100), ''), v_waktu,
            case when v_alasan is null then 'calon' else 'batal' end, v_alasan)
    on conflict (nomor) where status = 'calon' do nothing;
    if v_alasan is null then v_calon := v_calon + 1;
    else v_lewat := jsonb_set(v_lewat, array[v_alasan], to_jsonb(coalesce((v_lewat->>v_alasan)::int, 0) + 1));
    end if;
  end loop;
  return jsonb_build_object('aktif', true, 'calon', v_calon, 'lewat', v_lewat);
end; $$;

-- ============================================================ ambil (Edge /x/wa/bagi)
-- p = {sekarang?, batas? (1–20, default 10)}. Hasil {aktif, hari_baru, sales:[{id, nama}], items:[calon jatuh tempo {id, nomor, percakapan,
-- masuk_pada}], umum:[sudah ditugaskan tapi pengumuman gagal ≤ 30 menit {id, nomor, pemilik_nama}]}.
create or replace function wa.inti_bagi_ambil(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s wa.bagi_setel;
  v_now timestamptz := wa.waktu_dari(p);
  v_batas int := least(greatest(coalesce((p->>'batas')::int, 10), 1), 20);
begin
  select * into s from wa.bagi_setel;
  if not s.aktif then return jsonb_build_object('aktif', false, 'items', '[]'::jsonb, 'umum', '[]'::jsonb); end if;
  return jsonb_build_object('aktif', true, 'hari_baru', s.hari_baru,
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', m, 'nama', wa.nama_sales(m)) order by o)
                         from unnest(s.sales) with ordinality t(m, o)), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nomor', x.nomor, 'percakapan', x.percakapan,
                                                            'masuk_pada', public.iso_utc(x.masuk_pada)) order by x.masuk_pada)
                         from (select * from wa.penugasan x where x.status = 'calon'
                                 and x.masuk_pada <= v_now - make_interval(secs => s.jeda_detik)
                               order by x.masuk_pada limit v_batas) x), '[]'::jsonb),
    'umum', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nomor', x.nomor, 'pemilik_nama', wa.nama_sales(x.pemilik))
                                       order by x.ditugaskan_pada)
                        from wa.penugasan x where x.status = 'ditugaskan' and x.diumumkan_pada is null
                          and x.percobaan_umum between 1 and 4 and x.ditugaskan_pada > v_now - interval '30 minutes'), '[]'::jsonb));
end; $$;

-- ============================================================ hasil (Edge /x/wa/bagi sesudah cek Kapso)
-- p = {sekarang?, items:[{id, keputusan:'tugaskan'|'batal'|'tunda', alasan?, sales?:member_id}]}.
-- tugaskan: sales (bila ikut giliran) atau giliran = anggota s.sales dengan penugasan 'ditugaskan' 7 hari paling
-- sedikit; seri → yang terakhir ditugaskan paling lama (belum pernah = lebih dulu) → urutan di s.sales.
-- tunda: tetap calon (Kapso gagal); calon > 15 menit → batal kapso_gagal (routine per jam yang menangani).
-- Hasil {umum:[{id, nomor, pemilik_nama}]} = baru ditugaskan, untuk diumumkan.
create or replace function wa.inti_bagi_hasil(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s wa.bagi_setel;
  v_now timestamptz := wa.waktu_dari(p);
  it jsonb; x wa.penugasan; v_kep text; v_alasan text; v_sales bigint; v_umum jsonb := '[]'::jsonb;
begin
  select * into s from wa.bagi_setel;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') > 20 then
    perform public.lempar('PT400', 'items harus array (maks 20)', 'INPUT_001');
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    if coalesce(it->>'id', '') !~ '^[0-9]{1,18}$' then continue; end if;
    select * into x from wa.penugasan w where w.id = (it->>'id')::bigint and w.status = 'calon' for update;
    if not found then continue; end if;
    v_kep := it->>'keputusan';
    v_alasan := nullif(left(regexp_replace(lower(coalesce(it->>'alasan', '')), '[^a-z_]', '_', 'g'), 40), '');
    if v_kep = 'tunda' then
      if x.masuk_pada < v_now - interval '15 minutes' then
        update wa.penugasan w set status = 'batal', alasan = 'kapso_gagal', diubah_pada = now() where w.id = x.id;
      end if;
      continue;
    end if;
    if v_kep = 'batal' then
      update wa.penugasan w set status = 'batal', alasan = coalesce(v_alasan, 'batal'), diubah_pada = now() where w.id = x.id;
      continue;
    end if;
    if v_kep is distinct from 'tugaskan' then continue; end if;
    v_sales := case when (it->>'sales') ~ '^[0-9]{1,18}$' and (it->>'sales')::bigint = any (s.sales) then (it->>'sales')::bigint end;
    if v_sales is null then
      select g.m into v_sales
        from unnest(s.sales) with ordinality g(m, urut)
        join public.members mb on mb.id = g.m and mb.aktif
        left join lateral (select count(*) n, max(w.ditugaskan_pada) akhir from wa.penugasan w
                            where w.pemilik = g.m and w.status = 'ditugaskan'
                              and w.ditugaskan_pada > v_now - interval '7 days') b on true
       order by b.n, b.akhir nulls first, g.urut
       limit 1;
      v_alasan := 'giliran';
    else
      v_alasan := coalesce(v_alasan, 'sudah_membalas');
    end if;
    if v_sales is null then
      update wa.penugasan w set status = 'batal', alasan = 'tanpa_sales', diubah_pada = now() where w.id = x.id;
      continue;
    end if;
    update wa.penugasan w set status = 'ditugaskan', alasan = v_alasan, pemilik = v_sales, ditugaskan_pada = v_now,
                              diubah_pada = now()
     where w.id = x.id;
    v_umum := v_umum || jsonb_build_object('id', x.id, 'nomor', x.nomor, 'pemilik_nama', wa.nama_sales(v_sales));
  end loop;
  return jsonb_build_object('umum', v_umum);
end; $$;

-- p = {ids:[…], ok:bool} → ok: diumumkan_pada = now; gagal: percobaan_umum + 1 (diulang ≤ 4x dalam 30 menit).
create or replace function wa.inti_bagi_umum(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if jsonb_typeof(p->'ids') is distinct from 'array' then perform public.lempar('PT400', 'ids harus array', 'INPUT_001'); end if;
  if coalesce((p->>'ok')::boolean, false) then
    update wa.penugasan w set diumumkan_pada = now(), percobaan_umum = w.percobaan_umum + 1, diubah_pada = now()
     where w.id in (select (e)::bigint from jsonb_array_elements_text(p->'ids') e) and w.diumumkan_pada is null;
  else
    update wa.penugasan w set percobaan_umum = w.percobaan_umum + 1, diubah_pada = now()
     where w.id in (select (e)::bigint from jsonb_array_elements_text(p->'ids') e) and w.diumumkan_pada is null;
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('diubah', v_n);
end; $$;

-- ============================================================ API agent (owner/bot)
-- Daftar penugasan p={hari? 1–30 (default 3)} → {items:[{nomor, status, alasan, pemilik, pemilik_nama, masuk_pada,
-- ditugaskan_pada, diumumkan}]}. Memuat NOMOR (untuk mencocokkan lead di routine): hanya owner/bot.
create or replace function wa.inti_bagi_daftar(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_hari int := least(greatest(coalesce((p->>'hari')::int, 3), 1), 30);
begin
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
      'nomor', x.nomor, 'status', x.status, 'alasan', x.alasan, 'pemilik', x.pemilik, 'pemilik_nama', wa.nama_sales(x.pemilik),
      'masuk_pada', public.iso_utc(x.masuk_pada), 'ditugaskan_pada', public.iso_utc(x.ditugaskan_pada),
      'diumumkan', x.diumumkan_pada is not null) order by x.masuk_pada desc)
    from wa.penugasan x where x.dibuat_pada > now() - make_interval(days => v_hari)), '[]'::jsonb));
end; $$;

-- Setelan p={aktif?, sales?:[member_id…], jeda_detik?, hari_baru?} (kosong = lihat). Hasil setelan + hitungan hari ini
-- (tanpa nomor). sales harus anggota aktif; aktif=true butuh ≥ 1 sales.
create or replace function wa.inti_bagi_setel(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s wa.bagi_setel; v_sales bigint[]; v_hari_ini date := (now() at time zone 'Asia/Jakarta')::date;
begin
  select * into s from wa.bagi_setel for update;
  if p ? 'sales' then
    if jsonb_typeof(p->'sales') is distinct from 'array' or jsonb_array_length(p->'sales') > 10 then
      perform public.lempar('PT400', 'sales harus array id anggota (maks 10)', 'INPUT_001');
    end if;
    select coalesce(array_agg(v order by o), '{}') into v_sales
      from (select distinct on (e) e::bigint v, o from jsonb_array_elements_text(p->'sales') with ordinality t(e, o)
             where e ~ '^[0-9]{1,18}$' order by e, o) q;
    if jsonb_array_length(p->'sales') <> coalesce(array_length(v_sales, 1), 0)
       or exists (select 1 from unnest(v_sales) m where not exists (select 1 from public.members mb where mb.id = m and mb.aktif)) then
      perform public.lempar('PT400', 'sales berisi id yang bukan anggota aktif atau dobel', 'INPUT_001');
    end if;
    s.sales := v_sales;
  end if;
  if p ? 'jeda_detik' then s.jeda_detik := (p->>'jeda_detik')::int; end if;
  if p ? 'hari_baru' then s.hari_baru := (p->>'hari_baru')::int; end if;
  if p ? 'aktif' then s.aktif := coalesce((p->>'aktif')::boolean, false); end if;
  if s.aktif and coalesce(array_length(s.sales, 1), 0) = 0 then
    perform public.lempar('PT400', 'aktif butuh minimal 1 sales', 'INPUT_001');
  end if;
  if p ?| array['sales', 'jeda_detik', 'hari_baru', 'aktif'] then
    update wa.bagi_setel g set aktif = s.aktif, sales = s.sales, jeda_detik = s.jeda_detik, hari_baru = s.hari_baru,
                               diubah_pada = now(), diubah_oleh = public.aktor()
     where g.id;
  end if;
  return jsonb_build_object('aktif', s.aktif, 'jeda_detik', s.jeda_detik, 'hari_baru', s.hari_baru,
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', m, 'nama', wa.nama_sales(m)) order by o)
                         from unnest(s.sales) with ordinality t(m, o)), '[]'::jsonb),
    'hari_ini', jsonb_build_object(
      'ditugaskan', coalesce((select jsonb_object_agg(n, c) from (select wa.nama_sales(x.pemilik) n, count(*) c from wa.penugasan x
                               where x.status = 'ditugaskan' and (x.ditugaskan_pada at time zone 'Asia/Jakarta')::date = v_hari_ini
                               group by 1) q), '{}'::jsonb),
      'belum_diumumkan', (select count(*) from wa.penugasan x where x.status = 'ditugaskan' and x.diumumkan_pada is null
                            and (x.ditugaskan_pada at time zone 'Asia/Jakarta')::date = v_hari_ini),
      'batal', coalesce((select jsonb_object_agg(a, c) from (select coalesce(x.alasan, '-') a, count(*) c from wa.penugasan x
                          where x.status = 'batal' and (x.dibuat_pada at time zone 'Asia/Jakarta')::date = v_hari_ini group by 1) q), '{}'::jsonb),
      'calon', (select count(*) from wa.penugasan x where x.status = 'calon')));
end; $$;

-- ============================================================ pintu
create or replace function public.x_wa_bagi_calon(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_bagi_calon(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_bagi_ambil(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_bagi_ambil(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_bagi_hasil(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_bagi_hasil(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_bagi_umum(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_bagi_umum(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_bagi_daftar(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); perform wa.wajib_owner_bot(); return wa.inti_bagi_daftar(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_bagi_setel(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tulis boolean := coalesce(p, '{}'::jsonb) ?| array['sales', 'jeda_detik', 'hari_baru', 'aktif'];
begin
  perform public.mulai_api(p_aktor, 'api', case when v_tulis then 'tulis' else 'baca' end);
  perform wa.wajib_owner_bot();
  return wa.inti_bagi_setel(coalesce(p, '{}'::jsonb));
end; $$;

-- ============================================================ cron + pg_net (secret Vault sama dengan wa.picu)
-- Memanggil /x/wa/bagi hanya bila saklar aktif dan ada calon jatuh tempo atau pengumuman yang perlu diulang.
-- Sekaligus retensi: baris > 30 hari dihapus.
create or replace function wa.picu_bagi()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_tok text; s wa.bagi_setel;
begin
  delete from wa.penugasan x where x.dibuat_pada < now() - interval '30 days';
  select * into s from wa.bagi_setel;
  if not s.aktif then return null; end if;
  if not exists (select 1 from wa.penugasan x
                  where (x.status = 'calon' and x.masuk_pada <= now() - make_interval(secs => s.jeda_detik))
                     or (x.status = 'ditugaskan' and x.diumumkan_pada is null and x.percobaan_umum between 1 and 4
                         and x.ditugaskan_pada > now() - interval '30 minutes')) then
    return null;
  end if;
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'wa_api_url';
  select d.decrypted_secret into v_tok from vault.decrypted_secrets d where d.name = 'wa_token_proses';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then return null; end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/x/wa/bagi',
    body := '{}'::jsonb,
    headers := jsonb_build_object('authorization', 'Bearer ' || v_tok, 'content-type', 'application/json'),
    timeout_milliseconds := 120000);
end; $$;

select cron.schedule('wa-bagi', '* * * * *', $$select wa.picu_bagi()$$);

-- ============================================================ hak (fail-closed)
revoke all on function wa.nama_sales(bigint), wa.inti_bagi_calon(jsonb), wa.inti_bagi_ambil(jsonb), wa.inti_bagi_hasil(jsonb),
  wa.inti_bagi_umum(jsonb), wa.inti_bagi_daftar(jsonb), wa.inti_bagi_setel(jsonb), wa.picu_bagi()
  from public, anon, authenticated, service_role;
revoke all on function public.x_wa_bagi_calon(jsonb), public.x_wa_bagi_ambil(jsonb), public.x_wa_bagi_hasil(jsonb),
  public.x_wa_bagi_umum(jsonb), public.x_wa_bagi_daftar(bigint, jsonb), public.x_wa_bagi_setel(bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.x_wa_bagi_calon(jsonb), public.x_wa_bagi_ambil(jsonb), public.x_wa_bagi_hasil(jsonb),
  public.x_wa_bagi_umum(jsonb), public.x_wa_bagi_daftar(bigint, jsonb), public.x_wa_bagi_setel(bigint, jsonb)
  to service_role;
