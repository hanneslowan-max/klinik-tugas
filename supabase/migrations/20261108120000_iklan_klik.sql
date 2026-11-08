-- Klik iklan Google → ORDER (ACC Hannes 4 Nov 2026, "lanjut kerjakan rancangan ukur sampai order"; brief
-- rhj-brain deliverables/anvil/BRIEF-KLIK-IKLAN-SAMPAI-ORDER.md, rancangan deliverables/ads/RANCANGAN-UKUR-IKLAN-SAMPAI-ORDER-4Nov.md).
--
-- ALUR
--   1. Situs rodahammerindo.com / palletmeshindonesia.com membuat kode unik per kunjungan iklan (GA-RH-7K3F / GA-OY-7K3F)
--      saat URL membawa gclid/gbraid/wbraid, menaruhnya di pesan WA ("Ref: GA-RH-7K3F"), dan mengirim SATU baris ke
--      Edge `api` POST /x/iklan/klik (publik, CORS hanya dua domain itu) → x_iklan_klik_catat → tabel iklan_klik.
--   2. Routine Kapso Catat membaca kode dari chat WA 0878 → lead.sumber_bukti_kode (20261021120000_pipeline_sumber_bukti,
--      tidak berubah).
--   3. Google Ads (unggah terjadwal HTTPS) membaca GET /x/iklan/unggah.csv (token env TOKEN_UNGGAH_IKLAN, bukan token API
--      app) → x_iklan_unggah: lead ORDER yang sumber_bukti_kode-nya cocok dengan iklan_klik.kode → CSV konversi offline.
--   4. Admin/baca Pipeline memantau keutuhan kode: web_iklan_ringkas (kartu di layar Ringkasan) / x_iklan_ringkas
--      (GET /x/iklan/ringkas, token baca).
--
-- PRIVASI: iklan_klik HANYA berisi kode, ID klik iklan (gclid/gbraid/wbraid), jenisnya, waktu klik, domain, dan path
-- halaman mendarat (tanpa query string). TIDAK ada IP, user agent, cookie, nama, nomor telepon. Baris > 90 hari dihapus
-- (batas unggah Google): oportunistik di setiap x_iklan_klik_catat + job terjadwal x_rawat_iklan_klik
-- (.github/workflows/rawat.yml → impor/rawat.mjs --iklan-klik → POST /x/rawat/iklan-klik). Tidak ikut x_export/backup.
--
-- DEFINISI pencocokan (x_iklan_unggah, satu sumber untuk CSV & ringkasan):
--   * lead tahap ORDER, tanggal_sp & nilai_transaksi terisi, sumber_bukti_kode = iklan_klik.kode (kode unik → ≤1 baris
--     per lead; kirim ulang/ubah lead tidak menggandakan baris).
--   * Waktu konversi = tanggal_sp 12:00:00 WIB. Bila itu SEBELUM waktu klik (SP di hari klik, klik sesudah 12:00) dipakai
--     waktu klik + 1 menit (Google menolak konversi sebelum klik). SP sebelum tanggal klik (WIB) = bukan hasil klik itu →
--     tidak dihitung. Waktu konversi > waktu klik + 90 hari → tidak dihitung (batas Google). Waktu konversi di masa depan
--     (SP hari ini sebelum 12:00 / SP bertanggal depan) → ditunda ke unggahan berikutnya.
--   * Nama konversi dari kode: GA-RH → "Order SP RH", GA-OY → "Order SP OY". Nilai = nilai_transaksi (IDR).
--   * Hanya jenis_id gclid masuk CSV. gbraid/wbraid (iOS) dilewati dan dihitung (`dilewati_braid`) sampai format unggahnya
--     dipastikan.
--
-- ADITIF: tabel & fungsi baru + satu indeks di lead. Tidak ada UPDATE/DELETE data lama.

-- ============================================================ tabel
create table public.iklan_klik (
  kode        text primary key,
  id_klik     text not null,
  jenis_id    text not null,
  waktu_klik  timestamptz not null,
  domain      text not null,
  halaman     text not null default '/',
  dibuat_pada timestamptz not null default now(),
  constraint iklan_klik_kode_pola check (kode ~ '^GA-(RH|OY)-[A-Z0-9]{4}$'),
  -- karakter URL tak-bercadang saja (gclid/gbraid/wbraid berupa base64url); 8–200 karakter
  constraint iklan_klik_id_pola check (id_klik ~ '^[A-Za-z0-9_.~-]{8,200}$'),
  constraint iklan_klik_jenis_sah check (jenis_id in ('gclid', 'gbraid', 'wbraid')),
  constraint iklan_klik_domain_sah check (domain in ('rodahammerindo.com', 'palletmeshindonesia.com')),
  constraint iklan_klik_domain_kode check (
    (domain = 'rodahammerindo.com' and kode like 'GA-RH-%') or (domain = 'palletmeshindonesia.com' and kode like 'GA-OY-%')),
  -- path saja: diawali '/', tanpa query string / fragmen / spasi / karakter kontrol, maks 300
  -- (panjang dicek terpisah: regex Postgres membatasi pengulangan {m,n} ≤ 255)
  constraint iklan_klik_halaman_pola check (halaman ~ '^/[^?#[:space:][:cntrl:]]*$' and char_length(halaman) <= 300)
);
comment on table public.iklan_klik is
  'Pasangan kode Ref situs (GA-RH-xxxx / GA-OY-xxxx) ↔ ID klik Google Ads. Tanpa data pribadi; dihapus > 90 hari. '
  'Ditulis hanya lewat x_iklan_klik_catat (Edge POST /x/iklan/klik).';

create index iklan_klik_waktu_idx on public.iklan_klik (waktu_klik);
-- rem global penerima publik (lihat inti_iklan_klik_catat)
create index iklan_klik_dibuat_idx on public.iklan_klik (dibuat_pada);
-- ringkasan mencari lead per kode klik
create index if not exists lead_sumber_bukti_kode_idx on public.lead (sumber_bukti_kode) where sumber_bukti_kode is not null;

-- Tanpa akses langsung untuk role API mana pun: tulis/baca hanya lewat fungsi di bawah.
alter table public.iklan_klik enable row level security;
revoke all on public.iklan_klik from public, anon, authenticated, service_role;

-- ============================================================ catat klik (publik lewat Edge)
-- p = {"kode":"GA-RH-7K3F", "id_klik":"Cj0KCQ…", "jenis_id":"gclid", "waktu_klik":"2026-11-08T10:15:00+07:00",
--      "domain":"rodahammerindo.com", "halaman":"/Product/casters/"}
--   * kode: dirapikan (trim + huruf besar), wajib ^GA-(RH|OY)-[A-Z0-9]{4}$, awalan cocok dengan domain (RH ↔
--     rodahammerindo.com, OY ↔ palletmeshindonesia.com).
--   * id_klik: [A-Za-z0-9_.~-]{8,200} (huruf besar/kecil dipertahankan). jenis_id: gclid | gbraid | wbraid.
--   * domain: huruf kecil, awalan "www." dibuang, wajib salah satu dari dua domain.
--   * waktu_klik: opsional (kosong = now()); ISO DENGAN zona, ≤ 3 hari lalu, ≤ 5 menit ke depan.
--   * halaman: opsional (kosong = '/'); query string & fragmen dibuang, dipotong 300 karakter, wajib diawali '/',
--     tanpa spasi/karakter kontrol.
--   * Kunci lain → PT400.
-- Idempoten: kode yang sudah ada dengan id_klik SAMA → tidak ditulis ({"baru":false}). Kode sama dengan id_klik BEDA
-- (tabrakan kode acak antar-pengunjung) → PT409 supaya situs membuat kode baru; baris pertama tidak diubah.
-- Retensi: baris dengan waktu_klik < now() − 90 hari dihapus di setiap panggilan (indeks waktu_klik).
-- Rem global: > 1000 baris baru dalam 1 jam terakhir → PT429 (lalu lintas iklan asli ±60 klik/hari). Batas laju Edge per
-- origin hanya per isolate dan Origin bisa dipalsukan dari luar browser; rem ini menjaga DB tidak dibanjiri.
create or replace function public.inti_iklan_klik_catat(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_k text; v_kode text; v_id text; v_jenis text; v_domain text; v_teks text; v_waktu timestamptz; v_hal text;
  v_lama text; v_n int;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    perform public.lempar('PT400', 'Body harus objek {kode, id_klik, jenis_id, domain, waktu_klik?, halaman?}', 'INPUT_001');
  end if;
  select k into v_k from jsonb_object_keys(p) k
   where k not in ('kode', 'id_klik', 'jenis_id', 'waktu_klik', 'domain', 'halaman') limit 1;
  if v_k is not null then
    perform public.lempar('PT400', format('Kunci tidak dikenal: %s (yang sah: kode, id_klik, jenis_id, waktu_klik, domain, halaman)', v_k), 'INPUT_001');
  end if;
  select k into v_k from jsonb_each(p) e(k, v) where jsonb_typeof(e.v) not in ('string', 'null') limit 1;
  if v_k is not null then perform public.lempar('PT400', format('%s harus teks', v_k), 'INPUT_001'); end if;

  v_kode := upper(btrim(coalesce(p->>'kode', '')));
  if v_kode !~ '^GA-(RH|OY)-[A-Z0-9]{4}$' then
    perform public.lempar('PT400', 'kode harus berformat GA-RH-XXXX atau GA-OY-XXXX', 'INPUT_001');
  end if;
  v_id := btrim(coalesce(p->>'id_klik', ''));
  if v_id !~ '^[A-Za-z0-9_.~-]{8,200}$' then
    perform public.lempar('PT400', 'id_klik tidak sah (8–200 karakter huruf/angka/_.~-)', 'INPUT_001');
  end if;
  v_jenis := lower(btrim(coalesce(p->>'jenis_id', '')));
  if v_jenis not in ('gclid', 'gbraid', 'wbraid') then
    perform public.lempar('PT400', 'jenis_id harus gclid, gbraid, atau wbraid', 'INPUT_001');
  end if;
  v_domain := regexp_replace(lower(btrim(coalesce(p->>'domain', ''))), '^www\.', '');
  if v_domain not in ('rodahammerindo.com', 'palletmeshindonesia.com') then
    perform public.lempar('PT400', 'domain harus rodahammerindo.com atau palletmeshindonesia.com', 'INPUT_001');
  end if;
  if (v_domain = 'rodahammerindo.com') <> (v_kode like 'GA-RH-%') then
    perform public.lempar('PT400', format('kode %s tidak cocok dengan domain %s', v_kode, v_domain), 'INPUT_001');
  end if;

  v_teks := nullif(btrim(coalesce(p->>'waktu_klik', '')), '');
  if v_teks is null then
    v_waktu := now();
  else
    if v_teks !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
      perform public.lempar('PT400', 'waktu_klik harus waktu ISO dengan zona, mis. 2026-11-08T10:15:00+07:00', 'INPUT_001');
    end if;
    begin
      v_waktu := v_teks::timestamptz;
    exception when others then
      perform public.lempar('PT400', 'waktu_klik tidak valid', 'INPUT_001');
    end;
    if v_waktu > now() + interval '5 minutes' or v_waktu < now() - interval '3 days' then
      perform public.lempar('PT400', 'waktu_klik di luar rentang (3 hari lalu s/d sekarang)', 'INPUT_001');
    end if;
  end if;

  v_hal := left(split_part(split_part(coalesce(p->>'halaman', ''), '#', 1), '?', 1), 300);
  if v_hal = '' then v_hal := '/'; end if;
  if v_hal !~ '^/[^[:space:][:cntrl:]]*$' then
    perform public.lempar('PT400', 'halaman harus path yang diawali "/" tanpa spasi', 'INPUT_001');
  end if;

  if (select count(*) from (select 1 from public.iklan_klik k where k.dibuat_pada > now() - interval '1 hour' limit 1001) x) > 1000
     and not exists (select 1 from public.iklan_klik k where k.kode = v_kode) then
    perform public.lempar('PT429', 'Terlalu banyak klik tercatat dalam 1 jam, coba lagi nanti', 'APP_002');
  end if;

  insert into public.iklan_klik (kode, id_klik, jenis_id, waktu_klik, domain, halaman)
  values (v_kode, v_id, v_jenis, v_waktu, v_domain, v_hal)
  on conflict (kode) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    select k.id_klik into v_lama from public.iklan_klik k where k.kode = v_kode;
    if v_lama is distinct from v_id then
      perform public.lempar('PT409', 'Kode sudah dipakai kunjungan lain, buat kode baru', 'KONFLIK_001');
    end if;
  end if;

  delete from public.iklan_klik k where k.waktu_klik < now() - interval '90 days';
  return jsonb_build_object('baru', v_n > 0);
end; $$;

-- Pintu service_role (Edge, rute publik tanpa token app → tanpa p_aktor, seperti api_token_cek).
create or replace function public.x_iklan_klik_catat(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin return public.inti_iklan_klik_catat(coalesce(p, '{}'::jsonb)); end; $$;

-- ============================================================ pencocokan ORDER ↔ klik (CSV + ringkasan)
-- Hasil: {"baris":[{"lead_id","kode","id_klik","nama","waktu","nilai"}…] (hanya gclid, urut waktu),
--         "dilewati_braid": n (cocok tapi gbraid/wbraid), "ditunda": n (waktu konversi di masa depan)}.
create or replace function public.inti_iklan_unggah()
returns jsonb language sql stable security definer set search_path = '' as $$
  with c as (
    select l.id as lead_id, k.kode, k.id_klik, k.jenis_id, l.nilai_transaksi,
           greatest(((l.tanggal_sp + time '12:00') at time zone 'Asia/Jakarta'),
                    date_trunc('second', k.waktu_klik) + interval '1 minute') as waktu_konv
      from public.lead l
      join public.iklan_klik k on k.kode = l.sumber_bukti_kode
     where l.tahap = 'ORDER' and l.tanggal_sp is not null and l.nilai_transaksi is not null
       and l.tanggal_sp >= public.wib_date(k.waktu_klik)
       and ((l.tanggal_sp + time '12:00') at time zone 'Asia/Jakarta') <= k.waktu_klik + interval '90 days'
  )
  select jsonb_build_object(
    'baris', coalesce(jsonb_agg(jsonb_build_object(
        'lead_id', c.lead_id, 'kode', c.kode, 'id_klik', c.id_klik,
        'nama', case when c.kode like 'GA-RH-%' then 'Order SP RH' else 'Order SP OY' end,
        'waktu', to_char(c.waktu_konv at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
        'nilai', c.nilai_transaksi) order by c.waktu_konv, c.lead_id)
      filter (where c.jenis_id = 'gclid' and c.waktu_konv <= now()), '[]'::jsonb),
    'dilewati_braid', count(*) filter (where c.jenis_id <> 'gclid'),
    'ditunda', count(*) filter (where c.jenis_id = 'gclid' and c.waktu_konv > now()))
  from c
$$;

-- Pintu service_role untuk GET /x/iklan/unggah.csv. Token (env TOKEN_UNGGAH_IKLAN) diperiksa Edge, bukan DB: Google
-- Ads tidak memegang token app, dan isi CSV hanya ID klik + nilai order (tanpa data pelanggan).
create or replace function public.x_iklan_unggah()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin return public.inti_iklan_unggah(); end; $$;

-- ============================================================ ringkasan keutuhan kode (admin/baca Pipeline)
-- Per domain, jendela 7 & 30 hari menurut waktu_klik:
--   klik         = baris iklan_klik tercatat
--   kode_di_lead = klik yang kodenya muncul di ≥1 lead (sumber_bukti_kode)
--   lead         = lead yang membawa kode klik itu; order = di antaranya yang tahap ORDER; nilai = jumlah nilai_transaksi order
--   braid        = klik ber-jenis gbraid/wbraid (tidak bisa masuk CSV)
-- lead_kode_tanpa_klik = lead masuk 30 hari terakhir ber-kode unik GA-xx-XXXX yang kodenya TIDAK ada di iklan_klik
--   (situs gagal mencatat / kode diketik ulang pelanggan). unggah = isi CSV saat ini (baris gclid, dilewati, ditunda).
create or replace function public.inti_iklan_ringkas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_u jsonb;
begin
  if coalesce(public.pipeline_peran_aktor(), '') not in ('admin', 'baca') then
    perform public.lempar('PT403', 'Ringkasan klik iklan hanya untuk admin/baca Pipeline', 'ACCESS_001');
  end if;
  v_u := public.inti_iklan_unggah();
  return (
    with kl as materialized (
      select k.kode, k.domain, k.jenis_id, k.waktu_klik from public.iklan_klik k where k.waktu_klik >= now() - interval '30 days'),
    ld as materialized (
      select l.id, l.sumber_bukti_kode as kode, l.tahap, l.nilai_transaksi
        from public.lead l where l.sumber_bukti_kode in (select kl.kode from kl)),
    dom (domain, singkat, urut) as (values ('rodahammerindo.com', 'RH', 1), ('palletmeshindonesia.com', 'OY', 2)),
    per (domain, singkat, urut, hari, j) as (
      select d.domain, d.singkat, d.urut, h.hari, jsonb_build_object(
        'klik', (select count(*) from kl where kl.domain = d.domain and kl.waktu_klik >= now() - make_interval(days => h.hari)),
        'braid', (select count(*) from kl where kl.domain = d.domain and kl.waktu_klik >= now() - make_interval(days => h.hari)
                    and kl.jenis_id <> 'gclid'),
        'kode_di_lead', (select count(*) from kl where kl.domain = d.domain and kl.waktu_klik >= now() - make_interval(days => h.hari)
                           and exists (select 1 from ld where ld.kode = kl.kode)),
        'lead', (select count(*) from ld join kl on kl.kode = ld.kode
                  where kl.domain = d.domain and kl.waktu_klik >= now() - make_interval(days => h.hari)),
        'order', (select count(*) from ld join kl on kl.kode = ld.kode
                   where kl.domain = d.domain and kl.waktu_klik >= now() - make_interval(days => h.hari) and ld.tahap = 'ORDER'),
        'nilai', (select coalesce(sum(ld.nilai_transaksi), 0) from ld join kl on kl.kode = ld.kode
                   where kl.domain = d.domain and kl.waktu_klik >= now() - make_interval(days => h.hari) and ld.tahap = 'ORDER'))
      from dom d cross join (values (7), (30)) h (hari))
    select jsonb_build_object(
      'per_domain', (select jsonb_agg(jsonb_build_object('domain', p7.domain, 'singkat', p7.singkat, 'h7', p7.j, 'h30', p30.j)
                                      order by p7.urut)
                       from per p7 join per p30 on p30.domain = p7.domain and p30.hari = 30 where p7.hari = 7),
      'lead_kode_tanpa_klik', (select count(*) from public.lead l
                                where l.tanggal_masuk > public.hari_ini_wib() - 30
                                  and l.sumber_bukti_kode ~ '^GA-(RH|OY)-[A-Z0-9]{4}$'
                                  and not exists (select 1 from public.iklan_klik k where k.kode = l.sumber_bukti_kode)),
      'tersimpan', (select count(*) from public.iklan_klik),
      'unggah', jsonb_build_object('baris', jsonb_array_length(v_u->'baris'), 'dilewati_braid', v_u->'dilewati_braid',
                                   'ditunda', v_u->'ditunda',
                                   'nilai', (select coalesce(sum((b->>'nilai')::bigint), 0) from jsonb_array_elements(v_u->'baris') b)),
      'dibuat', public.iso_utc(now()))
  );
end; $$;

create or replace function public.web_iklan_ringkas() returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_iklan_ringkas(); end; $$;
create or replace function public.x_iklan_ringkas(p_aktor bigint) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); return public.inti_iklan_ringkas(); end; $$;

-- ============================================================ retensi 90 hari (job terjadwal)
-- Dipanggil Edge POST /x/rawat/iklan-klik (token scope impor, owner/bot) dari .github/workflows/rawat.yml.
-- p_dry → hanya hitung kandidat. Hasil {"hari":90, "dihapus":n, "dry":bool}.
create or replace function public.inti_iklan_klik_bersih(p_dry boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if coalesce(p_dry, false) then
    select count(*) into v_n from public.iklan_klik k where k.waktu_klik < now() - interval '90 days';
  else
    delete from public.iklan_klik k where k.waktu_klik < now() - interval '90 days';
    get diagnostics v_n = row_count;
  end if;
  return jsonb_build_object('hari', 90, 'dihapus', v_n, 'dry', coalesce(p_dry, false));
end; $$;

create or replace function public.x_rawat_iklan_klik(p_aktor bigint, p_dry boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'impor');
  if not exists (select 1 from public.members m where m.id = public.aktor() and m.role in ('owner', 'bot')) then
    perform public.lempar('PT403', 'Perawatan klik iklan hanya untuk owner atau bot', 'ACCESS_001');
  end if;
  return public.inti_iklan_klik_bersih(p_dry);
end; $$;

-- ============================================================ hak (fail-closed): inti internal; x_ → service_role; web_ → authenticated
revoke all on function
  public.inti_iklan_klik_catat(jsonb), public.x_iklan_klik_catat(jsonb),
  public.inti_iklan_unggah(), public.x_iklan_unggah(),
  public.inti_iklan_ringkas(), public.web_iklan_ringkas(), public.x_iklan_ringkas(bigint),
  public.inti_iklan_klik_bersih(boolean), public.x_rawat_iklan_klik(bigint, boolean)
from public, anon, authenticated, service_role;
grant execute on function
  public.x_iklan_klik_catat(jsonb), public.x_iklan_unggah(), public.x_iklan_ringkas(bigint), public.x_rawat_iklan_klik(bigint, boolean)
to service_role;
grant execute on function public.web_iklan_ringkas() to authenticated;
