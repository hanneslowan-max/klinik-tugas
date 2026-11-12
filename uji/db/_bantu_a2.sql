-- Pembantu tes A2 (fungsi api_/x_/impor_/web_). Dimuat SESUDAH _bantu.sql, di dalam transaksi yang di-rollback.

-- Kunci objek JSON, terurut.
create function uji.kunci(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(j) k
$$;

-- Himpunan kunci task json kontrak §6 (tanpa markdown_description/attachments).
create function uji.kunci_task() returns text[] language sql immutable as $$
  select array_agg(k order by k) from unnest(array[
    'id','custom_id','custom_item_id','name','text_content','description','status','orderindex','date_created',
    'date_updated','date_closed','date_done','archived','creator','assignees','group_assignees','watchers','checklists',
    'tags','parent','top_level_parent','priority','due_date','due_date_time','start_date','start_date_time','points',
    'time_estimate','custom_fields','dependencies','linked_tasks','locations','team_id','url','sharing',
    'permission_level','list','project','folder','space']) k
$$;

-- Tempat menyimpan hasil panggilan (bisa ditulis role mana pun di dalam tes).
create table uji.hasil (k text primary key, j jsonb);
grant all on uji.hasil to public;

create function uji.simpan(p_k text, p_j jsonb) returns jsonb language sql as $$
  insert into uji.hasil (k, j) values (p_k, p_j) on conflict (k) do update set j = excluded.j returning j
$$;
create function uji.ambil(p_k text) returns jsonb language sql stable as $$
  select j from uji.hasil where k = p_k
$$;

-- ms epoch (string) dari timestamptz, sama rumus public.ms().
create function uji.ms(t timestamptz) returns text language sql immutable as $$
  select floor(extract(epoch from t) * 1000)::bigint::text
$$;

-- Header PostgREST x-token-id (null = hapus header).
create function uji.token(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.headers',
    case when p_id is null then '' else json_build_object('x-token-id', p_id)::text end, true);
end $$;

-- Jumlah activity (dibaca sebagai postgres/service_role).
create function uji.n_act(p_task text, p_jenis text default null) returns int language sql stable as $$
  select count(*)::int from public.activity where task_id = p_task and (p_jenis is null or jenis = p_jenis)
$$;
create function uji.akt(p_task text, p_jenis text) returns public.activity language sql stable as $$
  select a from public.activity a where a.task_id = p_task and a.jenis = p_jenis order by a.id desc limit 1
$$;

grant execute on all functions in schema uji to public;

-- sha256 hex (sisi tes; public.sha256_hex internal tidak bisa dipanggil role API).
create function uji.sha(p text) returns text language sql immutable security definer set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;
grant execute on function uji.sha(text) to public;
create function uji.dari_ms(p bigint) returns timestamptz language sql immutable as $$
  select timestamptz '1970-01-01 00:00:00+00' + p * interval '1 millisecond'
$$;
grant execute on function uji.dari_ms(bigint) to public;
