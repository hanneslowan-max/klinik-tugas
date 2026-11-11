-- Lead Anvil LANGSUNG saat chat dibagi (keputusan Hannes 11 Nov 2026, pop-up B24: "AI nilai dulu, lalu langsung buat").
-- Sesudah penugasan 'ditugaskan', Edge (bagi.ts) membaca chat lewat Kapso dan meminta AI (kunci bot WA) menilai: calon
-- pembeli → lead dibuat lewat inti_pipeline_lead_otomatis (aturan & dedupe sama dengan routine per jam; pemilik = sales yang
-- ditunjuk); bukan pembeli → selesai; belum jelas (sapaan saja) → dinilai ulang saat pelanggan menulis lagi (≤ 6x, ≤ 24 jam),
-- routine per jam tetap cadangan. Isi chat tidak disimpan di DB (hanya hasil lead seperti routine).
-- Saklar: wa.bagi_setel.lead_aktif (bawaan false) + lead_aktor (anggota agent/owner pembuat lead).

alter table wa.bagi_setel add column lead_aktif boolean not null default false;
alter table wa.bagi_setel add column lead_aktor bigint references public.members (id);
alter table wa.bagi_setel add column lead_sejak timestamptz;
alter table wa.penugasan add column lead_status text check (lead_status is null or lead_status in ('tunggu', 'dibuat', 'terbuka', 'bukan', 'gagal'));
alter table wa.penugasan add column lead_kode text check (lead_kode is null or lead_kode ~ '^L-[0-9]{1,9}$');
alter table wa.penugasan add column lead_jenis text check (lead_jenis is null or lead_jenis ~ '^[a-z_]{1,30}$');
alter table wa.penugasan add column lead_alasan text check (lead_alasan is null or char_length(lead_alasan) <= 200);
alter table wa.penugasan add column lead_percobaan int not null default 0;
alter table wa.penugasan add column lead_dinilai_pada timestamptz;
alter table wa.penugasan add column lead_nilai_berikut timestamptz;
create index penugasan_lead_idx on wa.penugasan (lead_nilai_berikut) where status = 'ditugaskan' and lead_status = 'tunggu';

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
      update wa.penugasan x set lead_nilai_berikut = v_waktu + interval '1 minute', diubah_pada = now()
       where x.nomor = v_nomor and x.status = 'ditugaskan' and x.lead_status = 'tunggu' and x.lead_percobaan < 6
         and x.ditugaskan_pada > v_now - interval '24 hours';
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
  if p ? 'lead_aktor' then
    if coalesce(p->>'lead_aktor', '') !~ '^[0-9]{1,18}$'
       or not exists (select 1 from public.members mb where mb.id = (p->>'lead_aktor')::bigint and mb.aktif and mb.role in ('owner', 'bot')) then
      perform public.lempar('PT400', 'lead_aktor harus id anggota owner/bot aktif', 'INPUT_001');
    end if;
    s.lead_aktor := (p->>'lead_aktor')::bigint;
  end if;
  if p ? 'lead' then
    if coalesce((p->>'lead')::boolean, false) and not s.lead_aktif then s.lead_sejak := now(); end if;
    s.lead_aktif := coalesce((p->>'lead')::boolean, false);
  end if;
  if s.lead_aktif and s.lead_aktor is null then
    perform public.lempar('PT400', 'lead butuh lead_aktor (id agent/owner)', 'INPUT_001');
  end if;
  if p ? 'aktif' then s.aktif := coalesce((p->>'aktif')::boolean, false); end if;
  if s.aktif and coalesce(array_length(s.sales, 1), 0) = 0 then
    perform public.lempar('PT400', 'aktif butuh minimal 1 sales', 'INPUT_001');
  end if;
  if p ?| array['sales', 'jeda_detik', 'hari_baru', 'aktif', 'luar_jam', 'lead', 'lead_aktor'] then
    update wa.bagi_setel g set aktif = s.aktif, luar_jam = s.luar_jam, lead_aktif = s.lead_aktif, lead_aktor = s.lead_aktor, lead_sejak = s.lead_sejak, sales = s.sales, jeda_detik = s.jeda_detik, hari_baru = s.hari_baru,
                               diubah_pada = now(), diubah_oleh = public.aktor()
     where g.id;
  end if;
  return jsonb_build_object('aktif', s.aktif, 'luar_jam', s.luar_jam, 'lead', s.lead_aktif, 'lead_aktor', s.lead_aktor, 'jeda_detik', s.jeda_detik, 'hari_baru', s.hari_baru,
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
      'calon', (select count(*) from wa.penugasan x where x.status = 'calon'),
      'lead', coalesce((select jsonb_object_agg(a, c) from (select coalesce(x.lead_status, 'belum') a, count(*) c from wa.penugasan x
                         where x.status = 'ditugaskan' and (x.ditugaskan_pada at time zone 'Asia/Jakarta')::date = v_hari_ini group by 1) q), '{}'::jsonb)));
end; $$;

create or replace function public.x_wa_bagi_setel(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tulis boolean := coalesce(p, '{}'::jsonb) ?| array['sales', 'jeda_detik', 'hari_baru', 'aktif', 'luar_jam', 'lead', 'lead_aktor'];
begin
  perform public.mulai_api(p_aktor, 'api', case when v_tulis then 'tulis' else 'baca' end);
  perform wa.wajib_owner_bot();
  return wa.inti_bagi_setel(coalesce(p, '{}'::jsonb));
end; $$;

create or replace function wa.inti_bagi_daftar(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_hari int := least(greatest(coalesce((p->>'hari')::int, 3), 1), 30);
begin
  return jsonb_build_object('items', coalesce((select jsonb_agg(jsonb_build_object(
      'nomor', x.nomor, 'status', x.status, 'alasan', x.alasan, 'pemilik', x.pemilik, 'pemilik_nama', wa.nama_sales(x.pemilik),
      'masuk_pada', public.iso_utc(x.masuk_pada), 'ditugaskan_pada', public.iso_utc(x.ditugaskan_pada),
      'diumumkan', x.diumumkan_pada is not null, 'lead_status', x.lead_status, 'lead_kode', x.lead_kode) order by x.masuk_pada desc)
    from wa.penugasan x where x.dibuat_pada > now() - make_interval(days => v_hari)), '[]'::jsonb));
end; $$;

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
                         and x.ditugaskan_pada > now() - interval '30 minutes')
                     or (s.lead_aktif and x.status = 'ditugaskan' and x.ditugaskan_pada >= greatest(now() - interval '24 hours', s.lead_sejak)
                         and ((x.lead_status is null) or (x.lead_status = 'tunggu' and x.lead_nilai_berikut <= now())))) then
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

-- Penugasan yang perlu dinilai (Edge /x/wa/bagi): p={sekarang?, batas? 1–10 (default 5)} → {aktif, items:[{id, nomor,
-- percakapan, masuk_pada, pemilik, alasan, luar_jam, percobaan}]}: ditugaskan sejak lead_sejak (≤ 24 jam), belum dinilai
-- (lead_status null) atau menunggu dengan jadwal nilai ulang jatuh tempo.
create or replace function wa.inti_bagi_nilai_ambil(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s wa.bagi_setel;
  v_now timestamptz := wa.waktu_dari(p);
  v_batas int := least(greatest(coalesce((p->>'batas')::int, 5), 1), 10);
begin
  select * into s from wa.bagi_setel;
  if not s.lead_aktif then return jsonb_build_object('aktif', false, 'items', '[]'::jsonb); end if;
  return jsonb_build_object('aktif', true, 'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'nomor', x.nomor, 'percakapan', x.percakapan, 'masuk_pada', public.iso_utc(x.masuk_pada), 'pemilik', x.pemilik,
      'alasan', x.alasan, 'luar_jam', not wa.jam_kerja(x.masuk_pada), 'percobaan', x.lead_percobaan) order by x.ditugaskan_pada)
    from (select * from wa.penugasan x
           where x.status = 'ditugaskan' and x.ditugaskan_pada >= greatest(v_now - interval '24 hours', s.lead_sejak)
             and (x.lead_status is null or (x.lead_status = 'tunggu' and x.lead_nilai_berikut <= v_now))
           order by x.ditugaskan_pada limit v_batas) x), '[]'::jsonb));
end; $$;

-- Hasil penilaian satu penugasan: p={id, keputusan:'buat'|'bukan'|'tunggu'|'gagal', jenis?, alasan?, sementara?,
-- lead?:{kunci_luar, sumber, pelanggan?, kontak_nama?, kota?, produk?, kebutuhan?, catatan?, sumber_bukti?,
-- sumber_bukti_kode?, chat_pada?}}. 'buat' → inti_pipeline_lead_otomatis sebagai lead_aktor dengan hp = nomor penugasan
-- dan pemilik = sales yang ditunjuk (alasan_pemilik balasan bila sales sudah membalas, else giliran); galat → 'gagal'.
-- 'tunggu' → dinilai ulang saat pesan baru masuk (webhook); 'gagal' sementara → ulang 5 menit lagi (≤ 4x).
-- Hasil {status, kode?, galat?}.
create or replace function wa.inti_bagi_lead(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s wa.bagi_setel; x wa.penugasan; v_kep text := p->>'keputusan'; v_item jsonb; v_r jsonb; v_st text; v_galat text;
  v_jenis text := nullif(left(regexp_replace(lower(coalesce(p->>'jenis', '')), '[^a-z_]', '_', 'g'), 30), '');
  v_alasan text := nullif(left(coalesce(p->>'alasan', ''), 200), '');
begin
  select * into s from wa.bagi_setel;
  if coalesce(p->>'id', '') !~ '^[0-9]{1,18}$' then perform public.lempar('PT400', 'id wajib', 'INPUT_001'); end if;
  select * into x from wa.penugasan w where w.id = (p->>'id')::bigint and w.status = 'ditugaskan' for update;
  if not found then return jsonb_build_object('status', 'tidak_ada'); end if;
  if x.lead_status in ('dibuat', 'terbuka', 'bukan') then
    return jsonb_build_object('status', x.lead_status, 'kode', x.lead_kode);
  end if;

  if v_kep = 'tunggu' then
    update wa.penugasan w set lead_status = 'tunggu', lead_jenis = coalesce(v_jenis, 'lain'), lead_alasan = v_alasan,
      lead_percobaan = w.lead_percobaan + 1, lead_dinilai_pada = now(), lead_nilai_berikut = null, diubah_pada = now()
     where w.id = x.id;
    return jsonb_build_object('status', 'tunggu');
  elsif v_kep = 'bukan' then
    update wa.penugasan w set lead_status = 'bukan', lead_jenis = v_jenis, lead_alasan = v_alasan,
      lead_percobaan = w.lead_percobaan + 1, lead_dinilai_pada = now(), lead_nilai_berikut = null, diubah_pada = now()
     where w.id = x.id;
    return jsonb_build_object('status', 'bukan');
  elsif v_kep = 'gagal' then
    update wa.penugasan w set
      lead_status = case when w.lead_percobaan + 1 >= 4 or not coalesce((p->>'sementara')::boolean, false) then 'gagal' else 'tunggu' end,
      lead_alasan = v_alasan, lead_percobaan = w.lead_percobaan + 1, lead_dinilai_pada = now(),
      lead_nilai_berikut = now() + interval '5 minutes', diubah_pada = now()
     where w.id = x.id returning lead_status into v_st;
    return jsonb_build_object('status', v_st);
  elsif v_kep is distinct from 'buat' then
    perform public.lempar('PT400', 'keputusan harus buat, bukan, tunggu, atau gagal', 'INPUT_001');
  end if;

  if s.lead_aktor is null then perform public.lempar('PT400', 'lead_aktor belum disetel', 'INPUT_001'); end if;
  if jsonb_typeof(p->'lead') is distinct from 'object' then perform public.lempar('PT400', 'lead wajib objek', 'INPUT_001'); end if;
  v_item := (p->'lead') - 'hp' - 'pemilik' - 'alasan_pemilik'
            || jsonb_build_object('hp', x.nomor, 'pemilik', x.pemilik,
                                  'alasan_pemilik', case when x.alasan = 'sudah_membalas' then 'balasan' else 'giliran' end);
  begin
    perform public.mulai_api(s.lead_aktor, 'api', 'tulis');
    v_r := public.inti_pipeline_lead_otomatis(v_item);
  exception when others then
    get stacked diagnostics v_galat = message_text;
    update wa.penugasan w set lead_status = 'gagal', lead_jenis = 'calon_pembeli', lead_alasan = left('lead: ' || v_galat, 200),
      lead_percobaan = w.lead_percobaan + 1, lead_dinilai_pada = now(), lead_nilai_berikut = null, diubah_pada = now()
     where w.id = x.id;
    return jsonb_build_object('status', 'gagal', 'galat', left(v_galat, 200));
  end;
  v_st := case v_r->>'status' when 'lead_terbuka_ada' then 'terbuka' else 'dibuat' end;
  update wa.penugasan w set lead_status = v_st, lead_kode = v_r->>'kode', lead_jenis = 'calon_pembeli', lead_alasan = v_alasan,
    lead_percobaan = w.lead_percobaan + 1, lead_dinilai_pada = now(), lead_nilai_berikut = null, diubah_pada = now()
   where w.id = x.id;
  return jsonb_build_object('status', v_st, 'kode', v_r->>'kode', 'lead', v_r->>'status');
end; $$;

create or replace function public.x_wa_bagi_nilai_ambil(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_bagi_nilai_ambil(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_bagi_lead(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_bagi_lead(coalesce(p, '{}'::jsonb)); end; $$;

revoke all on function wa.inti_bagi_nilai_ambil(jsonb), wa.inti_bagi_lead(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.x_wa_bagi_nilai_ambil(jsonb), public.x_wa_bagi_lead(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.x_wa_bagi_nilai_ambil(jsonb), public.x_wa_bagi_lead(jsonb) to service_role;
