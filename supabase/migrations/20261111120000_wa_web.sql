-- Halaman web "Bot WA" (owner saja; keputusan Hannes 11 Nov 2026, pop-up B24 sesi rhj-brain: "Bangun halaman Bot WA").
-- Pemantau mutu bot TANPA isi chat pelanggan (memang tidak disimpan) dan TANPA nomor telepon: keluaran hanya metadata
-- wa.log + teks balasan BOT + 8 karakter awal nomor_hash + id percakapan Kapso (untuk dicari di inbox Kapso).
--   web_wa_ringkas(p)            = wa.inti_ringkas (hari 1–90)
--   web_wa_log(p)                = daftar keputusan terbaru (filter keputusan/alasan/hari, halaman per id)
--   web_wa_saklar(p)             = wa.inti_saklar (mati|kirim, catatan), aktor = owner web
--   web_wa_pengetahuan_daftar()  = fakta & contoh balasan (aktif & nonaktif)
-- SIMPAN fakta/contoh dari web TIDAK lewat fungsi web_* (supaya teks tidak bisa disimpan tanpa validator bot):
-- web memanggil Edge POST /x/admin/wa-pengetahuan (sesi owner) → periksaPengetahuan() → x_wa_pengetahuan_simpan.

create or replace function public.web_wa_ringkas(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(true); return wa.inti_ringkas(coalesce(p, '{}'::jsonb)); end; $$;

-- p = {hari? 1–90 (default 7), keputusan? (catat|kirim|diam|batal|tolak|gagal|tunda), alasan? (awalan), sebelum? (id),
--      batas? 1–100 (default 50)} → {items: [...], berikut: id|null}. Baris 'masuk'/'keluar_*' = catatan webhook.
create or replace function public.web_wa_log(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hari int := coalesce(nullif(p->>'hari', '')::int, 7);
  v_kep text := nullif(btrim(coalesce(p->>'keputusan', '')), '');
  v_alasan text := nullif(btrim(coalesce(p->>'alasan', '')), '');
  v_sebelum bigint := nullif(p->>'sebelum', '')::bigint;
  v_batas int := coalesce(nullif(p->>'batas', '')::int, 50);
  v_items jsonb;
  v_n int;
begin
  perform public.mulai_web(true);
  if v_hari not between 1 and 90 then perform public.lempar('PT400', 'hari harus 1–90', 'INPUT_001'); end if;
  if v_batas not between 1 and 100 then perform public.lempar('PT400', 'batas harus 1–100', 'INPUT_001'); end if;
  if v_kep is not null and v_kep not in ('catat', 'kirim', 'diam', 'batal', 'tolak', 'gagal', 'tunda') then
    perform public.lempar('PT400', 'keputusan tidak dikenal', 'INPUT_001');
  end if;
  if v_alasan is not null and char_length(v_alasan) > 60 then perform public.lempar('PT400', 'alasan maks 60 karakter', 'INPUT_001'); end if;

  select coalesce(jsonb_agg(x.j order by x.id desc), '[]'::jsonb), count(*) into v_items, v_n
    from (
      select l.id, jsonb_build_object(
               'id', l.id, 'waktu', public.iso_utc(l.waktu), 'arah', l.arah, 'jenis', l.jenis, 'keputusan', l.keputusan,
               'alasan', l.alasan, 'periode', l.periode, 'teks_bot', l.teks_bot, 'panjang', l.panjang,
               'token_masuk', l.token_masuk, 'token_keluar', l.token_keluar, 'biaya_usd', l.biaya_usd, 'model', l.model,
               'nomor', left(l.nomor_hash, 8),
               'percakapan', (select a.percakapan from wa.antrean a where a.id = l.antrean_id)) j
        from wa.log l
       where l.waktu >= now() - make_interval(days => v_hari)
         and (v_kep is null or l.keputusan = v_kep)
         and (v_alasan is null or l.alasan like replace(replace(replace(v_alasan, '\', '\\'), '%', '\%'), '_', '\_') || '%')
         and (v_sebelum is null or l.id < v_sebelum)
       order by l.id desc
       limit v_batas
    ) x;
  return jsonb_build_object(
    'items', v_items,
    'berikut', case when v_n = v_batas then (v_items->(v_n - 1)->>'id')::bigint end);
end; $$;

create or replace function public.web_wa_saklar(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(true); return wa.inti_saklar(coalesce(p, '{}'::jsonb)); end; $$;

create or replace function public.web_wa_pengetahuan_daftar()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform public.mulai_web(true); return wa.inti_pengetahuan_daftar('{}'::jsonb); end; $$;

revoke all on function public.web_wa_ringkas(jsonb), public.web_wa_log(jsonb), public.web_wa_saklar(jsonb),
  public.web_wa_pengetahuan_daftar() from public, anon, authenticated, service_role;
grant execute on function public.web_wa_ringkas(jsonb), public.web_wa_log(jsonb), public.web_wa_saklar(jsonb),
  public.web_wa_pengetahuan_daftar() to authenticated;
