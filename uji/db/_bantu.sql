-- Pembantu tes (dimuat tiap file tes via \ir, di DALAM transaksi yang di-ROLLBACK di akhir file).
-- Konvensi: tiap cek lulus → NOTICE 'LULUS: ...'; gagal → EXCEPTION 'GAGAL: ...' (psql ON_ERROR_STOP → exit≠0).
-- Data yang dipakai: anggota & struktur dari supabase/seed.sql (sintetis).

create schema uji;
grant usage on schema uji to public;

create function uji.cek(kondisi boolean, pesan text) returns void language plpgsql as $$
begin
  if kondisi is distinct from true then
    raise exception 'GAGAL: %', pesan;
  end if;
  raise notice 'LULUS: %', pesan;
end $$;

create function uji.sama(nyata anyelement, harap anyelement, pesan text) returns void language plpgsql as $$
begin
  if nyata is distinct from harap then
    raise exception 'GAGAL: % (nyata=%, harap=%)', pesan, nyata, harap;
  end if;
  raise notice 'LULUS: %', pesan;
end $$;

-- Perintah WAJIB gagal dengan SQLSTATE `kode` (opsional: pesan mengandung teks, hint sama persis).
create function uji.galat(perintah text, kode text, pesan text, mengandung text default null, hint text default null)
returns void language plpgsql as $$
declare
  v_state text;
  v_msg   text;
  v_hint  text;
begin
  begin
    execute perintah;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
    if v_state = kode
       and (mengandung is null or position(mengandung in v_msg) > 0)
       and (hint is null or v_hint = hint) then
      raise notice 'LULUS: % [%: %]', pesan, v_state, v_msg;
      return;
    end if;
    raise exception 'GAGAL: % (sqlstate=%, pesan=%, hint=%; harap %)', pesan, v_state, v_msg, v_hint, kode;
  end;
  raise exception 'GAGAL: % (tidak ada galat; harap %)', pesan, kode;
end $$;

-- Perintah WAJIB berhasil.
create function uji.jalan(perintah text, pesan text) returns void language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute perintah;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise exception 'GAGAL: % (%: %)', pesan, sqlstate, v_msg;
  end;
  raise notice 'LULUS: %', pesan;
end $$;

-- Ganti peran seperti request PostgREST (berlaku sampai `reset role;` / akhir transaksi).
create function uji.jadi(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function uji.jadi_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

create function uji.jadi_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;

-- Konteks tulis seperti fungsi SECURITY DEFINER: app.sumber + app.actor_id (transaksi lokal).
create function uji.konteks(p_sumber text, p_aktor bigint) returns void language plpgsql as $$
begin
  perform set_config('app.sumber', coalesce(p_sumber, ''), true);
  perform set_config('app.actor_id', coalesce(p_aktor::text, ''), true);
end $$;

create function uji.mode(p_mode text) returns void language plpgsql as $$
begin
  update public.app_settings set value = to_jsonb(p_mode) where key = 'mode';
end $$;

grant execute on all functions in schema uji to public;
