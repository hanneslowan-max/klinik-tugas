-- Pembagian seketika juga untuk chat LUAR JAM KERJA (keputusan Hannes 11 Nov 2026 ±17:20 WIB: "bagiin juga yang luar jam
-- langsung aja"). Setelan baru wa.bagi_setel.luar_jam (bawaan false = perilaku 20261111170000); true → calon juga dari chat
-- di luar jam kerja (malam, Sabtu/Minggu, hari libur). Pengumuman menandai baris luar jam. Balasan bot (origin cloud_api)
-- tidak dihitung sebagai balasan sales (bagi.ts).

alter table wa.bagi_setel add column luar_jam boolean not null default false;

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
    elsif not s.luar_jam and not wa.jam_kerja(v_waktu) then
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
    'umum', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nomor', x.nomor, 'pemilik_nama', wa.nama_sales(x.pemilik),
                                                        'luar_jam', not wa.jam_kerja(x.masuk_pada))
                                       order by x.ditugaskan_pada)
                        from wa.penugasan x where x.status = 'ditugaskan' and x.diumumkan_pada is null
                          and x.percobaan_umum between 1 and 4 and x.ditugaskan_pada > v_now - interval '30 minutes'), '[]'::jsonb));
end; $$;

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
    v_umum := v_umum || jsonb_build_object('id', x.id, 'nomor', x.nomor, 'pemilik_nama', wa.nama_sales(v_sales),
                                           'luar_jam', not wa.jam_kerja(x.masuk_pada));
  end loop;
  return jsonb_build_object('umum', v_umum);
end; $$;

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
  if p ? 'luar_jam' then s.luar_jam := coalesce((p->>'luar_jam')::boolean, false); end if;
  if p ? 'aktif' then s.aktif := coalesce((p->>'aktif')::boolean, false); end if;
  if s.aktif and coalesce(array_length(s.sales, 1), 0) = 0 then
    perform public.lempar('PT400', 'aktif butuh minimal 1 sales', 'INPUT_001');
  end if;
  if p ?| array['sales', 'jeda_detik', 'hari_baru', 'aktif', 'luar_jam'] then
    update wa.bagi_setel g set aktif = s.aktif, luar_jam = s.luar_jam, sales = s.sales, jeda_detik = s.jeda_detik, hari_baru = s.hari_baru,
                               diubah_pada = now(), diubah_oleh = public.aktor()
     where g.id;
  end if;
  return jsonb_build_object('aktif', s.aktif, 'luar_jam', s.luar_jam, 'jeda_detik', s.jeda_detik, 'hari_baru', s.hari_baru,
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

create or replace function public.x_wa_bagi_setel(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tulis boolean := coalesce(p, '{}'::jsonb) ?| array['sales', 'jeda_detik', 'hari_baru', 'aktif', 'luar_jam'];
begin
  perform public.mulai_api(p_aktor, 'api', case when v_tulis then 'tulis' else 'baca' end);
  perform wa.wajib_owner_bot();
  return wa.inti_bagi_setel(coalesce(p, '{}'::jsonb));
end; $$;
