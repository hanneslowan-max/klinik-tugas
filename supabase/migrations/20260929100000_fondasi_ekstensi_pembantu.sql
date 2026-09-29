-- A1 · Fondasi 1/7: ekstensi, hak default (fail-closed), pembantu dasar tanpa tabel.
-- Kontrak: docs/ARSITEKTUR.md §0, §1, §3. Semua objek di schema public.

-- Ekstensi (schema extensions, pola Supabase)
create extension if not exists pgcrypto with schema extensions;   -- gen_random_bytes, digest, crypt
create extension if not exists citext   with schema extensions;   -- members.email
create extension if not exists pg_trgm  with schema extensions;   -- pencarian kode kartu (ILIKE '%Y7%')

-- Hak default untuk objek yang DIBUAT KEMUDIAN oleh role postgres di schema public.
-- Supabase bawaan memberi anon/authenticated SEMUA hak ke tabel/fungsi baru. Kita balik jadi fail-closed:
--   * tabel/sequence/fungsi baru TIDAK otomatis terbuka ke anon/authenticated;
--   * fungsi baru tidak lagi EXECUTE untuk PUBLIC (global untuk role postgres).
-- Akibat untuk area lain (A2): fungsi web_* WAJIB `grant execute ... to authenticated` eksplisit,
-- fungsi api_*/x_*/impor_* cukup tetap milik service_role (default service_role masih ada).
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- Lempar galat berformat kontrak §5: ERRCODE 'PTxyz' → PostgREST HTTP xyz, HINT = ECODE ClickUp.
create or replace function public.lempar(p_kode text, p_pesan text, p_hint text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = p_kode, message = p_pesan, hint = coalesce(p_hint, '');
end;
$$;
comment on function public.lempar(text, text, text) is
  'Lempar galat kontrak §5, mis. lempar(''PT404'',''Tugas tidak ditemukan'',''ITEM_013'').';

-- ID acak base36: prefix + len karakter [0-9a-z], dari gen_random_bytes (tanpa bias modulo).
create or replace function public.id_baru(prefix text, len integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  abjad constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  hasil text := '';
  acak bytea;
  v integer;
begin
  if len is null or len < 1 or len > 64 then
    raise exception using errcode = 'PT400', message = 'id_baru: panjang harus 1..64', hint = 'INPUT_001';
  end if;
  while length(hasil) < len loop
    acak := extensions.gen_random_bytes(len + 8);
    for i in 0 .. length(acak) - 1 loop
      v := get_byte(acak, i);
      continue when v >= 252;               -- 252 = 7*36: buang sisa supaya sebaran rata
      hasil := hasil || substr(abjad, (v % 36) + 1, 1);
      exit when length(hasil) >= len;
    end loop;
  end loop;
  return coalesce(prefix, '') || hasil;
end;
$$;

-- Tanggal WIB dari timestamptz. Rumus = wibDate() di clickup.mjs (ms + 7 jam → tanggal UTC).
create or replace function public.wib_date(t timestamptz)
returns date
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ((t at time zone 'UTC') + interval '7 hours')::date
$$;

-- Hari ini (WIB). GUC app.hari_ini (YYYY-MM-DD) hanya untuk tes/penghitungan deterministik;
-- klien PostgREST tidak bisa menyetel GUC ini.
create or replace function public.hari_ini_wib()
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.hari_ini', true), '')::date, public.wib_date(now()))
$$;

-- Sumber aktif transaksi: 'ui' (default) / 'api' / 'impor' / 'sinkron' / 'sistem'.
-- Hanya diset fungsi SECURITY DEFINER lewat set_config('app.sumber', ..., true).
create or replace function public.sumber_aktif()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := coalesce(nullif(current_setting('app.sumber', true), ''), 'ui');
begin
  if v not in ('ui', 'api', 'impor', 'sinkron', 'sistem') then
    raise exception using errcode = 'PT400', message = format('app.sumber tidak dikenal: %s', v), hint = 'INPUT_001';
  end if;
  return v;
end;
$$;
