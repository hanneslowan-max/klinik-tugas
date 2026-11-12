-- Lampiran via API: aktifkan unggah lampiran lewat Edge `api` (POST /v2/task/{id}/attachment), scope tulis.
-- Edge (service role) mengunggah berkas ke Storage lalu memanggil x_lampiran_catat untuk mencatat barisnya.
-- Logika perekam dipisah ke inti_lampiran_catat supaya web (mulai_web) & API (mulai_api) berbagi validasi yang sama.
-- Aturan mode cermin (kartu ClickUp tak bisa dilampiri) & atribusi pengunggah tetap ditegakkan trigger lampiran_sebelum,
-- jadi berlaku sama untuk web maupun service role.

-- Inti perekam (dipanggil sesudah konteks aktor diset mulai_web/mulai_api). MIME & ukuran dari metadata objek Storage
-- bila ada (p_mime/p_size cadangan). Idempoten per storage_path.
create or replace function public.inti_lampiran_catat(p_task text, p_comment text, p_path text, p_title text,
                                                      p_mime text, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta  jsonb;
  v_mime  text;
  v_size  bigint;
  v_title text;
  v_id    text;
  v_izin  text[];
begin
  if not exists (select 1 from public.tasks where id = p_task and deleted_at is null)
     or not public.tugas_terlihat(p_task) then
    perform public.lempar('PT404', 'Tugas tidak ditemukan', 'ITEM_013');
  end if;
  if public.lampiran_task_dari_path(p_path) is distinct from p_task then
    perform public.lempar('PT400', format('Path lampiran wajib t/%s/<nama>', p_task), 'INPUT_001');
  end if;
  select a.id into v_id from public.attachments a where a.storage_path = p_path and a.deleted_at is null limit 1;
  if v_id is not null then
    return public.j_lampiran_web(v_id);                 -- sudah tercatat (idempoten)
  end if;
  select o.metadata into v_meta from storage.objects o where o.bucket_id = 'lampiran' and o.name = p_path;
  if not found then
    perform public.lempar('PT400', 'Berkas belum terunggah ke Storage', 'INPUT_001');
  end if;
  v_mime := coalesce(v_meta ->> 'mimetype', p_mime);
  v_size := coalesce(nullif(v_meta ->> 'size', '')::bigint, p_size);
  select b.allowed_mime_types into v_izin from storage.buckets b where b.id = 'lampiran';
  if v_mime is null or (v_izin is not null and not (v_mime = any (v_izin))) then
    perform public.lempar('PT400', format('Tipe berkas tidak diizinkan: %s', coalesce(v_mime, '(kosong)')), 'INPUT_001');
  end if;
  if v_size is not null and v_size > 26214400 then
    perform public.lempar('PT400', 'Berkas melebihi 25 MB', 'INPUT_001');
  end if;
  if nullif(p_comment, '') is not null
     and not exists (select 1 from public.comments c where c.id = p_comment and c.task_id = p_task and c.deleted_at is null) then
    perform public.lempar('PT404', 'Komentar tidak ditemukan', 'ITEM_013');
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), regexp_replace(p_path, '^.*/', ''));
  insert into public.attachments (task_id, comment_id, title, extension, mimetype, size, storage_path, status_salin)
  values (p_task, nullif(p_comment, ''), v_title, lower(substring(v_title from '\.([A-Za-z0-9]+)$')), v_mime, v_size,
          p_path, 'ok')          -- trigger lampiran_sebelum: tolak kartu ClickUp saat cermin + isi uploaded_by dari aktor
  returning id into v_id;
  return public.j_lampiran_web(v_id);
end;
$$;

-- Web (anggota, mulai_web). Perilaku sama persis dengan sebelumnya — sekarang lewat inti bersama.
create or replace function public.web_lampiran_catat(p_task text, p_comment text, p_path text, p_title text,
                                                     p_mime text, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_web();
  return public.inti_lampiran_catat(p_task, p_comment, p_path, p_title, p_mime, p_size);
end;
$$;

-- API (token scope tulis, mulai_api). Aktor = anggota pemilik token; sumber 'api'.
create or replace function public.x_lampiran_catat(p_aktor bigint, p_task text, p_comment text, p_path text,
                                                   p_title text, p_mime text, p_size bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mulai_api(p_aktor, 'api', 'tulis');
  return public.inti_lampiran_catat(p_task, p_comment, p_path, p_title, p_mime, p_size);
end;
$$;

-- Hak (ARSITEKTUR §4): inti = pembantu internal (tidak untuk role API); x_* = service_role saja.
-- web_lampiran_catat mempertahankan grant authenticated-nya (create or replace tidak mengubah grant).
revoke all on function public.inti_lampiran_catat(text, text, text, text, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.x_lampiran_catat(bigint, text, text, text, text, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.x_lampiran_catat(bigint, text, text, text, text, text, bigint) to service_role;
