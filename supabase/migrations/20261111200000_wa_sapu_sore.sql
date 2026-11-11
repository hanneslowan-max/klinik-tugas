-- SAPU SORE (keputusan Hannes 11 Nov 2026 ±17:50 WIB): tiap hari kerja 17.10 WIB bot mendeteksi chat pelanggan yang masuk
-- di jam kerja (bawaan sejak 16.00) dan BELUM dibalas sales, lalu bot AI membalasnya dengan pemberitahuan bahwa sekarang di
-- luar jam kerja dan informasi lengkap disampaikan sales besok pagi ([HARI]).
-- Alur: pg_cron 10 10 * * 1-5 (UTC = 17.10 WIB) → wa.picu_sapu() (hari kerja + setelan aktif + saklar bot kirim) → pg_net
--   POST /x/wa/sapu (token TOKEN_WA_PROSES) → Edge membaca chat sejak jam_mulai lewat API Kapso → x_wa_sapu_antre (baris
--   wa.antrean sapu=true, jatuh tempo sekarang) → cron wa-proses → bot membalas (aturan biasa, kecuali 'chat_berjalan' tidak
--   berlaku: chatnya memang percakapan hari ini; sales yang membalas sesudah pesan pelanggan tetap membatalkan).
-- Jalankan manual: POST /x/wa/sapu-jalan (token tulis owner/bot; CLI `wa sapu --jalan`).

create table wa.sapu_setel (
  id          boolean primary key default true check (id),
  aktif       boolean not null default false,
  jam_mulai   time not null default '16:00',
  terakhir    timestamptz,
  terakhir_hasil jsonb,
  diubah_pada timestamptz not null default now(),
  diubah_oleh bigint
);
insert into wa.sapu_setel (id) values (true);
alter table wa.sapu_setel enable row level security;
revoke all on table wa.sapu_setel from public, anon, authenticated, service_role;

alter table wa.antrean add column sapu boolean not null default false;

create or replace function wa.inti_ambil(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g wa.pengaturan;
  v_now timestamptz := wa.waktu_dari(p);
  v_batas int := coalesce(nullif(p->>'batas', '')::int, 10);
  r wa.antrean;
  v_uji boolean;
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

    v_uji := exists (select 1 from wa.uji u where u.nomor = r.nomor);
    if g.saklar = 'mati' then v_alasan := 'saklar_mati';
    elsif g.saklar = 'uji' and not v_uji then v_alasan := 'saklar_uji';
    elsif wa.jam_kerja(v_now) and not (g.saklar = 'uji' and v_uji) then v_alasan := 'jam_kerja';
    elsif exists (select 1 from wa.diam d where d.nomor = r.nomor) then v_alasan := 'daftar_diam';
    elsif v_sales is not null and v_sales >= r.pesan_pertama_pada - interval '1 minute' then v_alasan := 'sales_membalas';
    elsif not r.sapu and v_sales is not null and v_sales > r.pesan_pertama_pada - interval '24 hours' then v_alasan := 'chat_berjalan';
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
      'percobaan', r.percobaan, 'sapu', r.sapu,
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

-- Edge: p = {sekarang?, items:[{nomor, percakapan?, pesan_pertama_pada, pesan_terakhir_pada, id_pesan_terakhir?}]} (≤ 100)
-- → antrean sapu (jatuh tempo sekarang). Dilewati: nomor tidak sah, nomor diam, sudah ada antrean aktif, sudah ada antrean
-- sapu hari ini. Hasil {antre, lewat:{alasan:n}}.
create or replace function wa.inti_sapu_antre(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := wa.waktu_dari(p);
  it jsonb; v_nomor text; v_awal timestamptz; v_akhir timestamptz; v_aid bigint; v_alasan text;
  v_n int := 0; v_lewat jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') > 100 then
    perform public.lempar('PT400', 'items harus array (maks 100)', 'INPUT_001');
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    v_nomor := wa.norm_nomor(it->>'nomor');
    v_alasan := null;
    begin
      v_awal := (it->>'pesan_pertama_pada')::timestamptz;
      v_akhir := coalesce((it->>'pesan_terakhir_pada')::timestamptz, v_awal);
    exception when others then v_awal := null;
    end;
    if v_nomor is null or v_awal is null or v_awal > v_now then v_alasan := 'tidak_sah';
    elsif exists (select 1 from wa.diam d where d.nomor = v_nomor) then v_alasan := 'daftar_diam';
    elsif exists (select 1 from wa.antrean a where a.nomor = v_nomor and a.status in ('tunggu', 'proses')) then v_alasan := 'antrean_aktif';
    elsif exists (select 1 from wa.antrean a where a.nomor = v_nomor and a.sapu
                    and (a.tempo_dasar at time zone 'Asia/Jakarta')::date = (v_now at time zone 'Asia/Jakarta')::date) then v_alasan := 'sudah_disapu';
    end if;
    if v_alasan is not null then
      v_lewat := jsonb_set(v_lewat, array[v_alasan], to_jsonb(coalesce((v_lewat->>v_alasan)::int, 0) + 1));
      continue;
    end if;
    insert into wa.antrean (nomor, percakapan, periode, pesan_pertama_pada, pesan_terakhir_pada, id_pesan_terakhir,
                            tempo_dasar, jatuh_tempo, sapu)
    values (v_nomor, nullif(left(it->>'percakapan', 100), ''), wa.tanggal_buka(v_now), v_awal, v_akhir,
            nullif(left(it->>'id_pesan_terakhir', 200), ''), v_now, v_now, true)
    returning id into v_aid;
    perform wa.catat(v_now, 'sistem', 'catat', 'sapu_sore', v_nomor, null, null, v_aid, wa.tanggal_buka(v_now));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('antre', v_n, 'lewat', v_lewat);
end; $$;

-- Edge: catat hasil sapu (tanpa nomor) p={hasil:{…}} → terakhir/terakhir_hasil. Juga dipakai untuk membaca setelan.
create or replace function wa.inti_sapu_mulai(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s wa.sapu_setel; g wa.pengaturan; v_now timestamptz := wa.waktu_dari(p);
begin
  select * into s from wa.sapu_setel;
  select * into g from wa.pengaturan;
  if p ? 'hasil' then
    update wa.sapu_setel x set terakhir = now(), terakhir_hasil = p->'hasil' where x.id;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('aktif', s.aktif, 'saklar', g.saklar,
    'sejak', public.iso_utc(((v_now at time zone 'Asia/Jakarta')::date + s.jam_mulai) at time zone 'Asia/Jakarta'),
    'sampai', public.iso_utc(((v_now at time zone 'Asia/Jakarta')::date + g.jam_tutup) at time zone 'Asia/Jakarta'));
end; $$;

-- Setelan (owner/bot): p={aktif?, jam_mulai? 'HH:MM'} (kosong = lihat).
create or replace function wa.inti_sapu_setel(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s wa.sapu_setel; g wa.pengaturan;
begin
  select * into g from wa.pengaturan;
  if p ? 'jam_mulai' then
    if coalesce(p->>'jam_mulai', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p->>'jam_mulai')::time >= g.jam_tutup then
      perform public.lempar('PT400', 'jam_mulai harus HH:MM sebelum jam tutup', 'INPUT_001');
    end if;
    update wa.sapu_setel x set jam_mulai = (p->>'jam_mulai')::time, diubah_pada = now(), diubah_oleh = public.aktor() where x.id;
  end if;
  if p ? 'aktif' then
    update wa.sapu_setel x set aktif = coalesce((p->>'aktif')::boolean, false), diubah_pada = now(), diubah_oleh = public.aktor() where x.id;
  end if;
  select * into s from wa.sapu_setel;
  return jsonb_build_object('aktif', s.aktif, 'jam_mulai', to_char(s.jam_mulai, 'HH24:MI'), 'jam_tutup', to_char(g.jam_tutup, 'HH24:MI'),
    'terakhir', public.iso_utc(s.terakhir), 'terakhir_hasil', s.terakhir_hasil,
    'hari_ini', jsonb_build_object(
      'antre', (select count(*) from wa.antrean a where a.sapu and (a.dibuat_pada at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date),
      'per_status', coalesce((select jsonb_object_agg(k, c) from (select a.status || coalesce(':' || a.alasan, '') k, count(*) c from wa.antrean a
                        where a.sapu and (a.dibuat_pada at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
                          and char_length(coalesce(a.alasan, '')) <= 40 group by 1) q), '{}'::jsonb),
      'dibalas_bot', (select count(*) from wa.antrean a where a.sapu and a.status = 'selesai'
                        and (a.dibuat_pada at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
                        and exists (select 1 from wa.log l where l.antrean_id = a.id and l.arah = 'keluar_bot'))));
end; $$;

create or replace function public.x_wa_sapu_antre(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_sapu_antre(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_sapu_mulai(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_sapu_mulai(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_sapu_setel(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.mulai_api(p_aktor, 'api', case when coalesce(p, '{}'::jsonb) ?| array['aktif', 'jam_mulai', 'jalan'] then 'tulis' else 'baca' end);
  perform wa.wajib_owner_bot();
  return wa.inti_sapu_setel(coalesce(p, '{}'::jsonb) - 'jalan');
end; $$;

-- cron 17.10 WIB hari kerja (hari libur dilewati), hanya bila setelan aktif dan saklar bot kirim.
create or replace function wa.picu_sapu()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_tok text;
begin
  if not exists (select 1 from wa.sapu_setel s where s.aktif) then return null; end if;
  if not exists (select 1 from wa.pengaturan g where g.saklar = 'kirim') then return null; end if;
  if not wa.hari_kerja((now() at time zone 'Asia/Jakarta')::date) then return null; end if;
  select d.decrypted_secret into v_url from vault.decrypted_secrets d where d.name = 'wa_api_url';
  select d.decrypted_secret into v_tok from vault.decrypted_secrets d where d.name = 'wa_token_proses';
  if coalesce(v_url, '') = '' or coalesce(v_tok, '') = '' then return null; end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/x/wa/sapu',
    body := '{}'::jsonb,
    headers := jsonb_build_object('authorization', 'Bearer ' || v_tok, 'content-type', 'application/json'),
    timeout_milliseconds := 120000);
end; $$;

select cron.schedule('wa-sapu', '10 10 * * 1-5', $$select wa.picu_sapu()$$);   -- 17.10 WIB

revoke all on function wa.inti_sapu_antre(jsonb), wa.inti_sapu_mulai(jsonb), wa.inti_sapu_setel(jsonb), wa.picu_sapu(), wa.inti_ambil(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.x_wa_sapu_antre(jsonb), public.x_wa_sapu_mulai(jsonb), public.x_wa_sapu_setel(bigint, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.x_wa_sapu_antre(jsonb), public.x_wa_sapu_mulai(jsonb), public.x_wa_sapu_setel(bigint, jsonb) to service_role;
