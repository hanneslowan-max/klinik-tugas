-- Modul Pipeline — baca daftar akses untuk layar admin "Akses Pipeline" (owner). ADITIF: menyimpan/menghapus akses
-- sudah ada di web_pipeline_akses_simpan (migrasi 20261011120100). Di sini hanya PEMBACAAN: daftar akses saat ini +
-- kandidat anggota yang bisa diberi akses. Owner & bot admin implisit (pipeline_peran_aktor), jadi tak perlu baris
-- pipeline_akses sendiri — kandidat = anggota aktif role 'member'.

create or replace function public.inti_pipeline_akses_daftar()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'akses', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'member_id', pa.member_id, 'username', m.username, 'nama', m.nama,
          'role', m.role, 'aktif', m.aktif, 'peran', pa.peran, 'kode_sp', pa.kode_sp)
        -- admin dulu, lalu rep, lalu baca; dalam peran urut nama pengguna
        order by case pa.peran when 'admin' then 0 when 'rep' then 1 else 2 end, m.username), '[]'::jsonb)
      from public.pipeline_akses pa
        join public.members m on m.id = pa.member_id),
    'anggota', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'username', m.username, 'nama', m.nama, 'role', m.role)
        order by m.username), '[]'::jsonb)
      from public.members m
      where m.aktif and m.role = 'member'));
$$;

create or replace function public.web_pipeline_akses_daftar()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(true); return public.inti_pipeline_akses_daftar(); end; $$;

revoke all on function public.inti_pipeline_akses_daftar() from public, anon, authenticated, service_role;
grant execute on function public.web_pipeline_akses_daftar() to authenticated;
