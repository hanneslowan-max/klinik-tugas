-- Bot WA 0878: MODE UJI (keputusan Hannes 11 Nov 2026, pop-up B24 sesi rhj-brain: "Mode uji (nomor Bapak)").
-- saklar 'uji' = bot HANYA membalas nomor di wa.uji, KAPAN SAJA (termasuk jam kerja); nomor lain -> batal 'saklar_uji'
-- (pelanggan tidak dibalas bot). Jalur sama dengan produksi: webhook -> antrean -> AI -> validator -> kirim Kapso; pemutus
-- otomatis & jaga juga aktif di mode uji. saklar 'kirim' tidak berubah (nomor uji diperlakukan seperti pelanggan biasa).
-- Daftar nomor uji diisi lewat CLI/API (bukan di repo).

alter table wa.pengaturan drop constraint if exists pengaturan_saklar_check;
alter table wa.pengaturan add constraint pengaturan_saklar_check check (saklar in ('mati', 'kirim', 'uji'));

create table wa.uji (
  nomor   text primary key check (nomor ~ '^62[0-9]{8,13}$'),
  catatan text check (catatan is null or char_length(catatan) <= 200),
  sejak   timestamptz not null default now(),
  oleh    bigint
);
alter table wa.uji enable row level security;
revoke all on table wa.uji from public, anon, authenticated, service_role;

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
    -- mode uji: nomor di wa.uji tetap diantrekan di jam kerja (Hannes menguji bot kapan saja)
    if wa.jam_kerja(v_waktu) and not (g.saklar = 'uji' and exists (select 1 from wa.uji u where u.nomor = v_nomor)) then
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
  if v_pemutus is not null and g.saklar in ('kirim', 'uji') then
    update wa.pengaturan set saklar = 'mati', saklar_alasan = 'pemutus', saklar_catatan = v_pemutus,
                             saklar_diubah_pada = v_now, saklar_diubah_oleh = null, diubah_pada = now() where id;
    perform wa.catat(v_now, 'sistem', 'catat', 'pemutus: ' || v_pemutus);
  end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'pemutus', v_pemutus is not null and g.saklar in ('kirim', 'uji'));
end; $$;

create or replace function wa.inti_saklar(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_s text := lower(btrim(coalesce(p->>'status', '')));
begin
  if v_s not in ('mati', 'kirim', 'uji') then perform public.lempar('PT400', 'status harus mati, uji, atau kirim', 'INPUT_001'); end if;
  if v_s = 'uji' and not exists (select 1 from wa.uji) then
    perform public.lempar('PT400', 'mode uji butuh minimal 1 nomor di daftar uji (wa uji --nomor ...)', 'INPUT_001');
  end if;
  update wa.pengaturan set saklar = v_s, saklar_alasan = 'manual', saklar_catatan = left(nullif(p->>'catatan', ''), 200),
                           saklar_diubah_pada = now(), saklar_diubah_oleh = public.aktor(), diubah_pada = now() where id;
  perform wa.catat(now(), 'sistem', 'catat', 'saklar ' || v_s || ' oleh ' || public.aktor());
  return (select jsonb_build_object('saklar', g.saklar, 'saklar_alasan', g.saklar_alasan,
                                    'saklar_diubah_pada', public.iso_utc(g.saklar_diubah_pada)) from wa.pengaturan g);
end; $$;

-- p = {nomor?, hapus?:bool, catatan?}: tanpa nomor -> daftar (nomor disamarkan 4 digit akhir); dengan nomor -> tambah/hapus.
-- Daftar jadi kosong sementara saklar 'uji' -> saklar dimatikan.
create or replace function wa.inti_uji(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_n text := wa.norm_nomor(p->>'nomor');
begin
  if nullif(btrim(coalesce(p->>'nomor', '')), '') is not null then
    if v_n is null then perform public.lempar('PT400', 'nomor tidak sah (contoh 0812..., 62812...)', 'INPUT_001'); end if;
    if coalesce((p->>'hapus')::boolean, false) then
      delete from wa.uji u where u.nomor = v_n;
      if not exists (select 1 from wa.uji) then
        update wa.pengaturan set saklar = 'mati', saklar_alasan = 'manual', saklar_catatan = 'daftar uji kosong',
                                 saklar_diubah_pada = now(), saklar_diubah_oleh = public.aktor(), diubah_pada = now()
         where id and saklar = 'uji';
      end if;
    else
      insert into wa.uji (nomor, catatan, oleh) values (v_n, left(nullif(p->>'catatan', ''), 200), public.aktor())
      on conflict (nomor) do update set catatan = excluded.catatan, oleh = excluded.oleh;
    end if;
  end if;
  return jsonb_build_object(
    'saklar', (select g.saklar from wa.pengaturan g),
    'nomor', coalesce((select jsonb_agg(jsonb_build_object('nomor', '...' || right(u.nomor, 4), 'catatan', u.catatan,
                                                            'sejak', public.iso_utc(u.sejak)) order by u.sejak) from wa.uji u), '[]'::jsonb));
end; $$;

create or replace function public.x_wa_uji(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); perform wa.wajib_owner_bot(); return wa.inti_uji(coalesce(p, '{}'::jsonb)); end; $$;

revoke all on function wa.inti_uji(jsonb), wa.inti_webhook(jsonb), wa.inti_ambil(jsonb), wa.inti_hasil(jsonb), wa.inti_saklar(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.x_wa_uji(bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.x_wa_uji(bigint, jsonb) to service_role;
