-- Modul Pipeline — kategori papan PRIBADI per pengguna (revisi Hannes 13 Okt 2026). Layar Pipeline punya tampilan
-- Papan: kolom = kategori buatan pengguna sendiri (tambah / ganti nama / hapus / geser), lead diseret antar kolom
-- seperti Papan "Tugas Saya".
--
-- PRIBADI: kategori & penempatan lead hanya milik dan terlihat oleh pembuatnya (Riksa menyusun papannya tanpa
-- mengganggu papan Michael/Hannes). TIDAK mengubah data lead: tahap, pemilik, FU, dan ringkasan tetap. Lead tanpa
-- penempatan = kolom "Tanpa kategori" (implisit, bukan baris). Semua yang punya akses modul (admin/rep/baca) boleh
-- menyusun papannya sendiri — tidak membuka data baru, hanya pengelompokan.
--
-- ADITIF: 2 tabel + fungsi baru; tidak menyentuh tabel/fungsi lama. Konvensi ikut 20261011120000/20261011120100:
-- RLS ON, policy SELECT saja, tulis lewat fungsi SECURITY DEFINER inti_/web_, grant fail-closed.

-- ============================================================ tabel
create table public.pipeline_kategori (
  id          text primary key default public.id_baru('pk', 8),
  member_id   bigint not null references public.members (id) on delete cascade,
  nama        text not null,
  urutan      integer not null default 0,
  dibuat_pada timestamptz not null default now(),
  constraint pipeline_kategori_nama_isi check (length(btrim(nama)) between 1 and 40),
  constraint pipeline_kategori_id_pola check (id ~ '^pk[0-9a-z]+$'),
  -- sasaran FK komposit pipeline_kategori_lead: kategori penempatan pasti milik anggota yang sama
  constraint pipeline_kategori_id_member_uniq unique (id, member_id)
);
-- nama unik per pengguna (tanpa beda huruf besar/kecil)
create unique index pipeline_kategori_nama_uniq on public.pipeline_kategori (member_id, lower(nama));
create index pipeline_kategori_member_idx on public.pipeline_kategori (member_id, urutan);

-- Penempatan lead di papan pengguna: 1 lead paling banyak 1 kategori per pengguna. Hapus kategori → lead kembali
-- ke "Tanpa kategori" (cascade); hapus lead → penempatannya ikut hilang.
create table public.pipeline_kategori_lead (
  member_id   bigint not null references public.members (id) on delete cascade,
  lead_id     text not null references public.lead (id) on delete cascade,
  kategori_id text not null,
  diubah_pada timestamptz not null default now(),
  primary key (member_id, lead_id),
  constraint pipeline_kategori_lead_kategori_fk foreign key (kategori_id, member_id)
    references public.pipeline_kategori (id, member_id) on delete cascade
);
create index pipeline_kategori_lead_kategori_idx on public.pipeline_kategori_lead (kategori_id, member_id);
create index pipeline_kategori_lead_lead_idx on public.pipeline_kategori_lead (lead_id);

-- ============================================================ RLS: hanya baris milik sendiri
alter table public.pipeline_kategori      enable row level security;
alter table public.pipeline_kategori_lead enable row level security;

create policy baca_sendiri on public.pipeline_kategori for select to authenticated
  using (member_id = (select public.member_saya()) and (select public.boleh_pipeline()));
create policy baca_sendiri on public.pipeline_kategori_lead for select to authenticated
  using (member_id = (select public.member_saya()) and (select public.boleh_pipeline()));

-- fail-closed: hak bawaan Supabase memberi service_role hak tulis ke tabel baru → cabut dulu, lalu SELECT saja
revoke all on public.pipeline_kategori, public.pipeline_kategori_lead from anon, authenticated, service_role;
grant select on public.pipeline_kategori, public.pipeline_kategori_lead to authenticated, service_role;

-- ============================================================ fungsi
-- Batas jumlah kategori per pengguna (papan tetap terbaca di HP).
create or replace function public.pipeline_kategori_maks()
returns integer language sql immutable set search_path = '' as $$ select 30 $$;

-- Aktor yang menyusun papan; 403 bila tak punya akses modul Pipeline.
create or replace function public.pipeline_kategori_aktor()
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  if public.pipeline_peran_aktor() is null then
    perform public.lempar('PT403', 'Tidak punya akses Pipeline', 'ACCESS_001');
  end if;
  return public.penilai();
end; $$;

-- Nama kategori dirapikan (spasi ganda → satu, tepi dibuang) + divalidasi.
create or replace function public.pipeline_kategori_nama(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if v = '' then perform public.lempar('PT400', 'Nama kategori wajib diisi', 'INPUT_001'); end if;
  if length(v) > 40 then perform public.lempar('PT400', 'Nama kategori maksimal 40 karakter', 'INPUT_001'); end if;
  return v;
end; $$;

-- Keadaan papan pengguna: kategori (urut) + posisi {lead_id: kategori_id}.
create or replace function public.inti_pipeline_kategori()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_m bigint := public.pipeline_kategori_aktor();
begin
  return jsonb_build_object(
    'kategori', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'nama', k.nama, 'urutan', k.urutan)
                  order by k.urutan, k.dibuat_pada, k.id), '[]'::jsonb)
                 from public.pipeline_kategori k where k.member_id = v_m),
    'posisi', (select coalesce(jsonb_object_agg(kl.lead_id, kl.kategori_id), '{}'::jsonb)
               from public.pipeline_kategori_lead kl where kl.member_id = v_m));
end; $$;

-- Kelola kategori sendiri. p.aksi:
--   buat        {nama}          → kategori baru di ujung kanan
--   ganti_nama  {id, nama}
--   hapus       {id}            → lead di dalamnya kembali ke "Tanpa kategori"
--   urut        {ids: [..]}     → urutan baru; harus memuat SEMUA kategori pengguna, tepat sekali
-- Hasil: keadaan papan terkini (inti_pipeline_kategori).
create or replace function public.inti_pipeline_kategori_simpan(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_m bigint := public.pipeline_kategori_aktor();
  v_aksi text := coalesce(p->>'aksi', '');
  v_id text := nullif(p->>'id', '');
  v_nama text;
  v_ids text[];
  v_jumlah integer;
begin
  -- serialkan tulis kategori per pengguna (batas jumlah & urutan tetap konsisten bila dua tab menyimpan bersamaan)
  perform pg_advisory_xact_lock(hashtextextended('pipeline_kategori:' || v_m::text, 0));

  if v_aksi = 'buat' then
    v_nama := public.pipeline_kategori_nama(p->>'nama');
    select count(*) into v_jumlah from public.pipeline_kategori where member_id = v_m;
    if v_jumlah >= public.pipeline_kategori_maks() then
      perform public.lempar('PT400', format('Maksimal %s kategori', public.pipeline_kategori_maks()), 'INPUT_001');
    end if;
    begin
      insert into public.pipeline_kategori (member_id, nama, urutan)
      values (v_m, v_nama, coalesce((select max(urutan) + 1 from public.pipeline_kategori where member_id = v_m), 0));
    exception when unique_violation then
      perform public.lempar('PT409', format('Kategori "%s" sudah ada', v_nama), 'KONFLIK_001');
    end;

  elsif v_aksi = 'ganti_nama' then
    v_nama := public.pipeline_kategori_nama(p->>'nama');
    begin
      update public.pipeline_kategori set nama = v_nama where id = v_id and member_id = v_m;
    exception when unique_violation then
      perform public.lempar('PT409', format('Kategori "%s" sudah ada', v_nama), 'KONFLIK_001');
    end;
    if not found then perform public.lempar('PT404', 'Kategori tidak ditemukan', 'ITEM_013'); end if;

  elsif v_aksi = 'hapus' then
    delete from public.pipeline_kategori where id = v_id and member_id = v_m;
    if not found then perform public.lempar('PT404', 'Kategori tidak ditemukan', 'ITEM_013'); end if;

  elsif v_aksi = 'urut' then
    if jsonb_typeof(p->'ids') is distinct from 'array' then
      perform public.lempar('PT400', 'ids wajib berupa array id kategori', 'INPUT_001');
    end if;
    select coalesce(array_agg(x), '{}') into v_ids from jsonb_array_elements_text(p->'ids') as x;
    if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) as x)
       or (select array_agg(id order by id) from public.pipeline_kategori where member_id = v_m)
          is distinct from (select array_agg(x order by x) from unnest(v_ids) as x) then
      perform public.lempar('PT409', 'Daftar kategori berubah; muat ulang halaman', 'KONFLIK_001');
    end if;
    update public.pipeline_kategori k set urutan = u.n - 1
      from unnest(v_ids) with ordinality as u(id, n)
     where k.id = u.id and k.member_id = v_m;

  else
    perform public.lempar('PT400', 'Aksi kategori tidak dikenal', 'INPUT_001');
  end if;

  return public.inti_pipeline_kategori();
end; $$;

-- Pindahkan lead ke kategori sendiri. p = {lead_id, kategori_id | null}; null = "Tanpa kategori".
create or replace function public.inti_pipeline_kategori_pindah(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_m bigint := public.pipeline_kategori_aktor();
  v_lead text := nullif(p->>'lead_id', '');
  v_kat text := nullif(p->>'kategori_id', '');
begin
  perform public.pipeline_lead_wajib(v_lead);
  if v_kat is null then
    delete from public.pipeline_kategori_lead where member_id = v_m and lead_id = v_lead;
  else
    if not exists (select 1 from public.pipeline_kategori where id = v_kat and member_id = v_m) then
      perform public.lempar('PT404', 'Kategori tidak ditemukan', 'ITEM_013');
    end if;
    insert into public.pipeline_kategori_lead (member_id, lead_id, kategori_id)
    values (v_m, v_lead, v_kat)
    on conflict (member_id, lead_id) do update set kategori_id = excluded.kategori_id, diubah_pada = now();
  end if;
  return jsonb_build_object('lead_id', v_lead, 'kategori_id', v_kat);
end; $$;

-- ============================================================ bungkus web_ (JWT)
create or replace function public.web_pipeline_kategori() returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_kategori(); end; $$;
create or replace function public.web_pipeline_kategori_simpan(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_kategori_simpan(p); end; $$;
create or replace function public.web_pipeline_kategori_pindah(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(); return public.inti_pipeline_kategori_pindah(p); end; $$;

-- ============================================================ hak: inti internal; web_ → authenticated
revoke all on function
  public.pipeline_kategori_maks(), public.pipeline_kategori_aktor(), public.pipeline_kategori_nama(text),
  public.inti_pipeline_kategori(), public.inti_pipeline_kategori_simpan(jsonb), public.inti_pipeline_kategori_pindah(jsonb),
  public.web_pipeline_kategori(), public.web_pipeline_kategori_simpan(jsonb), public.web_pipeline_kategori_pindah(jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.web_pipeline_kategori(), public.web_pipeline_kategori_simpan(jsonb), public.web_pipeline_kategori_pindah(jsonb)
to authenticated;
