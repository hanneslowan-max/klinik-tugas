-- Bot WA 0878: fakta produk & contoh balasan dipindah dari kode (PROMPT_SISTEM wa.ts) ke tabel, supaya bisa diubah tanpa
-- deploy (keputusan Hannes 11 Nov 2026, pop-up B24 sesi rhj-brain: "Pindahkan sekarang"). Validator Edge tetap mengunci
-- harga/janji; teks baru juga dicek validator yang sama di Edge sebelum disimpan (/x/wa/pengetahuan).
--   jenis 'fakta'  : satu fakta per baris, masuk bagian FAKTA TERKUNCI prompt (maks 30 aktif).
--   jenis 'contoh' : situasi + contoh balasan (acuan nada/urutan pertanyaan, maks 8 aktif).
-- Tabel kosong / semua nonaktif → Edge memakai fakta bawaan di kode (fail-safe, bot tidak kehilangan fakta terkunci).
create table wa.pengetahuan (
  id           bigint generated always as identity primary key,
  jenis        text not null check (jenis in ('fakta', 'contoh')),
  situasi      text check (situasi is null or char_length(situasi) between 3 and 200),
  teks         text not null check (char_length(teks) between 3 and 700),
  aktif        boolean not null default true,
  urutan       int not null default 100 check (urutan between 0 and 1000),
  dibuat_pada  timestamptz not null default now(),
  diubah_pada  timestamptz not null default now(),
  oleh         bigint,
  check (jenis = 'contoh' or situasi is null),
  check (jenis = 'fakta' or situasi is not null)
);
alter table wa.pengetahuan enable row level security;
revoke all on table wa.pengetahuan from public, anon, authenticated, service_role;

-- Isi awal = fakta terkunci yang sudah di-ACC (PROMPT_SISTEM PR #37/#38), tanpa perubahan isi.
insert into wa.pengetahuan (jenis, teks, urutan) values
  ('fakta', 'Pallet mesh: ada ukuran standar Stocky 2, 3, 5, 7, 9 dan BISA custom (dibuat di pabrik RHJ). Finishing standar electroplating.', 10),
  ('fakta', 'Lemari arsip TIDAK bisa custom.', 20),
  ('fakta', 'RHJ TIDAK menjual roda scaffolding, roda teflon, roda pintu geser, roda pagar. Bila ditanya, katakan dengan sopan produk itu tidak tersedia di RHJ, tanpa menyebut merek atau toko lain.', 30);

-- Untuk Edge /x/wa/proses (service_role): fakta + contoh aktif, urut.
create or replace function wa.inti_pengetahuan_aktif()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'fakta', coalesce((select jsonb_agg(k.teks order by k.urutan, k.id) from wa.pengetahuan k
                        where k.jenis = 'fakta' and k.aktif), '[]'::jsonb),
    'contoh', coalesce((select jsonb_agg(jsonb_build_object('situasi', k.situasi, 'teks', k.teks) order by k.urutan, k.id)
                         from wa.pengetahuan k where k.jenis = 'contoh' and k.aktif), '[]'::jsonb));
$$;

-- Daftar lengkap (termasuk nonaktif) untuk owner/bot.
create or replace function wa.inti_pengetahuan_daftar(p jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'jenis', k.jenis, 'situasi', k.situasi, 'teks', k.teks,
                                               'aktif', k.aktif, 'urutan', k.urutan,
                                               'diubah_pada', public.iso_utc(k.diubah_pada), 'oleh', k.oleh)
                            order by k.jenis desc, k.urutan, k.id), '[]'::jsonb)
    from wa.pengetahuan k;
$$;

-- p = {id?, jenis (wajib bila baru), situasi?, teks?, aktif?, urutan?}. Tanpa id → baris baru. Dengan id → ubah kolom yang
-- dikirim. Batas aktif: fakta ≤ 30, contoh ≤ 8. Validasi isi (harga/janji/tautan…) dilakukan Edge sebelum memanggil ini.
create or replace function wa.inti_pengetahuan_simpan(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  r wa.pengetahuan;
  v_n int;
begin
  if v_id is null then
    if coalesce(p->>'jenis', '') not in ('fakta', 'contoh') then
      perform public.lempar('PT400', 'jenis harus fakta|contoh', 'INPUT_001');
    end if;
    if nullif(btrim(coalesce(p->>'teks', '')), '') is null then perform public.lempar('PT400', 'teks wajib', 'INPUT_001'); end if;
    insert into wa.pengetahuan (jenis, situasi, teks, aktif, urutan, oleh)
    values (p->>'jenis', nullif(btrim(coalesce(p->>'situasi', '')), ''), btrim(p->>'teks'),
            coalesce((p->>'aktif')::boolean, true), coalesce(nullif(p->>'urutan', '')::int, 100), public.aktor())
    returning * into r;
  else
    update wa.pengetahuan k set
      situasi = case when p ? 'situasi' then nullif(btrim(coalesce(p->>'situasi', '')), '') else k.situasi end,
      teks = case when p ? 'teks' then btrim(coalesce(p->>'teks', '')) else k.teks end,
      aktif = coalesce((p->>'aktif')::boolean, k.aktif),
      urutan = coalesce(nullif(p->>'urutan', '')::int, k.urutan),
      diubah_pada = now(), oleh = public.aktor()
    where k.id = v_id returning * into r;
    if r.id is null then perform public.lempar('PT404', 'pengetahuan tidak ditemukan', 'ITEM_013'); end if;
  end if;
  select count(*) into v_n from wa.pengetahuan k where k.jenis = r.jenis and k.aktif;
  if r.jenis = 'fakta' and v_n > 30 then perform public.lempar('PT400', 'fakta aktif maks 30', 'INPUT_001'); end if;
  if r.jenis = 'contoh' and v_n > 8 then perform public.lempar('PT400', 'contoh aktif maks 8', 'INPUT_001'); end if;
  if r.jenis = 'fakta' and v_n = 0 then
    perform public.lempar('PT400', 'minimal 1 fakta aktif (fakta terkunci tidak boleh kosong)', 'INPUT_001');
  end if;
  return jsonb_build_object('id', r.id, 'jenis', r.jenis, 'situasi', r.situasi, 'teks', r.teks, 'aktif', r.aktif,
                            'urutan', r.urutan);
end; $$;

create or replace function public.x_wa_pengetahuan_aktif(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return wa.inti_pengetahuan_aktif(); end; $$;
create or replace function public.x_wa_pengetahuan_daftar(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'baca'); perform wa.wajib_owner_bot(); return wa.inti_pengetahuan_daftar(coalesce(p, '{}'::jsonb)); end; $$;
create or replace function public.x_wa_pengetahuan_simpan(p_aktor bigint, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_api(p_aktor, 'api', 'tulis'); perform wa.wajib_owner_bot(); return wa.inti_pengetahuan_simpan(coalesce(p, '{}'::jsonb)); end; $$;

revoke all on function wa.inti_pengetahuan_aktif(), wa.inti_pengetahuan_daftar(jsonb), wa.inti_pengetahuan_simpan(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.x_wa_pengetahuan_aktif(jsonb), public.x_wa_pengetahuan_daftar(bigint, jsonb),
  public.x_wa_pengetahuan_simpan(bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.x_wa_pengetahuan_aktif(jsonb), public.x_wa_pengetahuan_daftar(bigint, jsonb),
  public.x_wa_pengetahuan_simpan(bigint, jsonb) to service_role;
