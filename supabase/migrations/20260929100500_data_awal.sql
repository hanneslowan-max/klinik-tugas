-- A1 · Fondasi 6/7: data awal wajib (bukan data uji). Kontrak ARSITEKTUR.md §1, §2.
-- Workspace tunggal (nama bisa ditimpa impor) + pengaturan default.

insert into public.workspace (id, name)
values ('1100340000004525', 'Roda Hammerindo Workspace')
on conflict (id) do nothing;

insert into public.app_settings (key, value) values
  ('mode',         '"cermin"'::jsonb),
  ('app_base_url', '"https://tugas.palletmeshindonesia.com"'::jsonb)
on conflict (key) do nothing;
