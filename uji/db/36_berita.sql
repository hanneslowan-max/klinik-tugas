-- 36 · Modul Berita (20261107120000_berita.sql): hak (owner/bot saja), simpan tarikan (lewati item kotor, dobel URL &
-- judul lintas sumber, status sumber, retensi 14 hari), kandidat (jendela sejak edisi terakhir, tanpa yang sudah
-- dipilih, umpan balik), simpan edisi (validasi semua-atau-tidak, urutan menurut skor), web owner (edisi, semua item +
-- paginasi + saringan, tanda dibaca/simpan/kurang, tersimpan) dan penolakan anggota biasa.
-- Aktor: budi 100000001 (owner, uid 1111…), citra 100000002 (member, uid 2222…), bot 900000000002 (token tulis/baca).
begin;
\ir _bantu.sql
\ir _bantu_a2.sql

-- mulai dari keadaan bersih (DB lokal bisa berisi tarikan uji manual; semua dibatalkan di akhir berkas)
delete from public.berita_edisi;
delete from public.berita;
update public.berita_sumber set terakhir_tarik = null, terakhir_ok = null, terakhir_galat = null, terakhir_item = null;

insert into public.api_tokens (id, member_id, nama, prefix, token_hash, scope) values
  ('b0b0b0b0-0000-4000-8000-000000000361', 900000000002, 'bot tulis (uji 36)', 'rtk_b361', uji.sha('rtk_uji36_tulis'), 'tulis'),
  ('b0b0b0b0-0000-4000-8000-000000000362', 900000000002, 'bot baca (uji 36)', 'rtk_b362', uji.sha('rtk_uji36_baca'), 'baca'),
  ('b0b0b0b0-0000-4000-8000-000000000363', 100000002, 'citra tulis (uji 36)', 'rtk_b363', uji.sha('rtk_uji36_citra'), 'tulis');

-- ------------------------------------------------------------ skema & hak
select uji.sama((select count(*)::int from public.berita_sumber where aktif), 36, '36 sumber feed awal aktif');
select uji.cek((select bool_and(relrowsecurity) from pg_class
                 where oid in ('public.berita_sumber'::regclass, 'public.berita'::regclass, 'public.berita_edisi'::regclass,
                               'public.berita_pilihan'::regclass, 'public.berita_tanda'::regclass)), 'RLS aktif di 5 tabel berita');
select uji.cek(not has_table_privilege('authenticated', 'public.berita', 'SELECT')
               and not has_table_privilege('authenticated', 'public.berita_pilihan', 'SELECT')
               and not has_table_privilege('anon', 'public.berita_sumber', 'SELECT')
               and not has_table_privilege('service_role', 'public.berita_tanda', 'SELECT'),
  'tabel berita tanpa akses langsung authenticated/anon; tanda owner tidak terbaca service_role');
select uji.cek(has_function_privilege('authenticated', 'public.web_berita(jsonb)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.web_berita(jsonb)', 'EXECUTE')
               and has_function_privilege('service_role', 'public.x_berita_simpan(bigint, jsonb)', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.x_berita_simpan(bigint, jsonb)', 'EXECUTE')
               and not has_function_privilege('service_role', 'public.berita_wajib_aktor()', 'EXECUTE')
               and not has_function_privilege('authenticated', 'public.j_berita_pilihan(public.berita_pilihan, bigint)', 'EXECUTE'),
  'web_berita* authenticated, x_berita_* service_role, pembantu tidak terbuka');

-- ------------------------------------------------------------ tarik: agent
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000361');
select uji.cek(jsonb_array_length(public.x_berita_sumber(900000000002)) = 36, 'x_berita_sumber: 36 feed aktif untuk bot');
select uji.galat($$select public.x_berita_sumber(100000002)$$, 'PT401', 'token bot dengan p_aktor anggota lain → 401');
select uji.token('b0b0b0b0-0000-4000-8000-000000000363');
select uji.galat($$select public.x_berita_sumber(100000002)$$, 'PT403', 'anggota biasa (token sendiri) → 403', 'owner atau agent');
select uji.token('b0b0b0b0-0000-4000-8000-000000000362');
select uji.galat($$select public.x_berita_simpan(900000000002, '{"hasil":[]}')$$, 'PT403', 'token baca tidak bisa menyimpan tarikan', 'Scope');
select uji.token('b0b0b0b0-0000-4000-8000-000000000361');

select uji.simpan('tarik1', public.x_berita_simpan(900000000002, jsonb_build_object('hasil', jsonb_build_array(
  jsonb_build_object('sumber_id', 'antara-ekonomi', 'ok', true, 'items', jsonb_build_array(
    jsonb_build_object('url', 'https://contoh.id/a1', 'judul', 'BI tahan suku bunga 5,75 persen', 'cuplikan', 'Bank Indonesia menahan…',
                       'terbit', to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    jsonb_build_object('url', 'https://contoh.id/a2', 'judul', 'Harga baja HRC naik', 'terbit', 'bukan tanggal'),
    jsonb_build_object('url', 'https://contoh.id/a3', 'judul', 'Dari masa depan', 'terbit', '2099-01-01T00:00:00Z'),
    jsonb_build_object('url', 'javascript:alert(1)', 'judul', 'URL jahat'),
    jsonb_build_object('url', 'https://contoh.id/a5', 'judul', '   '),
    jsonb_build_object('url', 'https://contoh.id/a1', 'judul', 'URL sama, judul lain'))),
  jsonb_build_object('sumber_id', 'gnews-id', 'ok', true, 'items', jsonb_build_array(
    jsonb_build_object('url', 'https://news.google.com/x1', 'judul', 'BI Tahan Suku Bunga 5,75 Persen!', 'penerbit', 'Kontan'),
    jsonb_build_object('url', 'https://news.google.com/x2', 'judul', 'Tarif impor baja dari China diperketat', 'penerbit', 'Kontan'))),
  jsonb_build_object('sumber_id', 'bbc-world', 'ok', false, 'galat', 'HTTP 503', 'items', '[]'::jsonb)))));
select uji.sama(uji.ambil('tarik1')->>'baru', '4', 'tarikan: 4 item baru (a1, a2, a3, x2)');
select uji.sama(uji.ambil('tarik1')->>'dobel', '2', 'dobel: URL sama + judul sama lintas sumber (beda huruf/tanda baca)');
select uji.sama(uji.ambil('tarik1')->>'dilewati', '2', 'item kotor dilewati (URL non-http, judul kosong)');
select uji.sama((uji.ambil('tarik1')->>'sumber_galat')::int, 1, '1 sumber galat');
select uji.cek((select terbit_at is null from public.berita where url = 'https://contoh.id/a2'), 'tanggal tak terbaca → null');
select uji.cek((select terbit_at <= now() from public.berita where url = 'https://contoh.id/a3'), 'tanggal masa depan dipatok ke sekarang');
select uji.sama((select penerbit from public.berita where url = 'https://news.google.com/x2'), 'Kontan', 'penerbit Google News tersimpan');
select uji.cek((select terakhir_galat = 'HTTP 503' and terakhir_ok is null from public.berita_sumber where id = 'bbc-world'), 'status sumber galat tercatat');
select uji.cek((select terakhir_galat is null and terakhir_item = 6 from public.berita_sumber where id = 'antara-ekonomi'), 'status sumber ok tercatat');
select uji.galat($$select public.x_berita_simpan(900000000002, '{"hasil":[{"sumber_id":"tidak-ada","ok":true,"items":[]}]}')$$,
  'PT400', 'sumber_id tidak dikenal → 400', 'tidak dikenal');
select uji.galat($$select public.x_berita_simpan(900000000002, '{"items":[]}')$$, 'PT400', 'tanpa hasil[] → 400');

-- retensi 14 hari
reset role;
insert into public.berita (sumber_id, url, judul, judul_kunci, ditarik_at)
values ('antara-ekonomi', 'https://contoh.id/lama', 'Berita lama sekali', public.berita_kunci('Berita lama sekali'), now() - interval '15 days');
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000361');
select uji.sama(public.x_berita_simpan(900000000002, '{"hasil":[]}')->>'dihapus', '1', 'item > 14 hari dihapus saat simpan');

-- ------------------------------------------------------------ kandidat
select uji.simpan('k1', public.x_berita_kandidat(900000000002, '{}'));
select uji.sama((uji.ambil('k1')->>'jumlah')::int, 4, 'kandidat awal (belum ada edisi, 12 jam): 4');
select uji.cek(uji.ambil('k1')->'edisi_terakhir' = 'null'::jsonb, 'belum ada edisi');
select uji.cek(exists (select 1 from jsonb_array_elements(uji.ambil('k1')->'sumber_galat') g where g->>'id' = 'bbc-world'), 'sumber galat dilaporkan ke kurator');
select uji.cek((select bool_and(k ? 'id' and k ? 'judul' and k ? 'sumber' and k ? 'wilayah') from jsonb_array_elements(uji.ambil('k1')->'kandidat') k),
  'kandidat memuat id, judul, sumber, wilayah');
select uji.galat($$select public.x_berita_kandidat(900000000002, '{"jam":100}')$$, 'PT400', 'jam > 48 → 400');
select uji.token('b0b0b0b0-0000-4000-8000-000000000362');
select uji.cek((public.x_berita_kandidat(900000000002, '{"jam":2}')->>'jumlah')::int = 4, 'token baca boleh membaca kandidat (jam=2)');
select uji.token('b0b0b0b0-0000-4000-8000-000000000361');

-- ------------------------------------------------------------ edisi
select uji.galat($$select public.x_berita_edisi_simpan(900000000002, '{"garis_besar":"x","pilihan":[]}')$$, 'PT400', 'pilihan kosong → 400', '1–30');
select uji.galat($$select public.x_berita_edisi_simpan(900000000002, '{"garis_besar":"x","rahasia":1,"pilihan":[]}')$$, 'PT400', 'kunci asing → 400', 'rahasia');
select uji.galat(format($$select public.x_berita_edisi_simpan(900000000002, '{"garis_besar":"x","pilihan":[{"berita_id":%s,"wilayah":"dalam","kategori":"cuaca","skor":3,"ringkasan":"r","dampak":"d"}]}')$$,
                        (select id from public.berita where url = 'https://contoh.id/a1')),
  'PT400', 'kategori tidak dikenal → 400 dengan indeks', 'pilihan[0]: kategori');
select uji.galat($$select public.x_berita_edisi_simpan(900000000002, '{"garis_besar":"x","pilihan":[{"judul":"t","sumber":"s","wilayah":"luar","kategori":"bisnis","skor":3,"ringkasan":"r","dampak":"d"}]}')$$,
  'PT400', 'tanpa berita_id wajib url', 'url wajib');
select uji.galat($$select public.x_berita_edisi_simpan(900000000002, '{"garis_besar":"x","pilihan":[{"url":"https://a.b/1","judul":"t","sumber":"s","wilayah":"luar","kategori":"bisnis","skor":6,"ringkasan":"r","dampak":"d"}]}')$$,
  'PT400', 'skor 6 → 400', 'skor');
select uji.galat($$select public.x_berita_edisi_simpan(900000000002, '{"garis_besar":"x","pilihan":[{"url":"https://a.b/1","judul":"t","sumber":"s","wilayah":"luar","kategori":"bisnis","skor":3,"ringkasan":"r","dampak":"d"},{"url":"https://a.b/1","judul":"t2","sumber":"s","wilayah":"luar","kategori":"bisnis","skor":3,"ringkasan":"r","dampak":"d"}]}')$$,
  'PT400', 'url ganda → 400', 'ganda');
select uji.galat($$select public.x_berita_edisi_simpan(900000000002, '{"garis_besar":"x","pilihan":[{"berita_id":999999999,"wilayah":"luar","kategori":"bisnis","skor":3,"ringkasan":"r","dampak":"d"}]}')$$,
  'PT400', 'berita_id tidak ada → 400', 'tidak ada');
select uji.sama((select count(*)::int from public.berita_edisi), 0, 'edisi gagal tidak menyisakan baris');

select uji.simpan('e1', public.x_berita_edisi_simpan(900000000002, jsonb_build_object(
  'garis_besar', 'BI menahan suku bunga; tarif impor baja diperketat.', 'pantau', 'Rilis inflasi Senin.', 'kandidat', 4,
  'pilihan', jsonb_build_array(
    jsonb_build_object('url', 'https://luar.example/ekspor', 'judul', 'Permintaan logistik Asia naik', 'sumber', 'The Loadstar',
                       'wilayah', 'luar', 'kategori', 'logistik', 'skor', 3, 'ringkasan', 'r3', 'dampak', 'd3'),
    jsonb_build_object('berita_id', (select id from public.berita where url = 'https://news.google.com/x2'),
                       'wilayah', 'dalam', 'kategori', 'kebijakan', 'skor', 5, 'ringkasan', 'Tarif impor baja…',
                       'dampak', 'Harga bahan baku roda/troli bisa naik.', 'bahan_relasi', 'Tanya pemasok soal stok.'),
    jsonb_build_object('berita_id', (select id from public.berita where url = 'https://contoh.id/a1'),
                       'judul', 'BI tahan suku bunga di 5,75%', 'wilayah', 'dalam', 'kategori', 'ekonomi', 'skor', 4,
                       'ringkasan', 'r1', 'dampak', 'd1')))));
select uji.sama((uji.ambil('e1')->>'pilihan')::int, 3, 'edisi tersimpan dengan 3 pilihan');
select uji.sama((select string_agg(skor::text, ',' order by urutan) from public.berita_pilihan where edisi_id = (uji.ambil('e1')->>'id')::bigint),
  '5,4,3', 'urutan tampil = skor turun');
select uji.sama((select sumber from public.berita_pilihan where url = 'https://news.google.com/x2'), 'Kontan', 'sumber bawaan = penerbit kandidat');
select uji.sama((select judul from public.berita_pilihan where url = 'https://contoh.id/a1'), 'BI tahan suku bunga di 5,75%', 'judul kiriman agent menang atas judul kandidat');
select uji.cek((select terbit_at is not null from public.berita_pilihan where url = 'https://contoh.id/a1'), 'terbit bawaan dari kandidat');
select uji.sama((select dibuat_oleh from public.berita_edisi where id = (uji.ambil('e1')->>'id')::bigint), 900000000002::bigint, 'dibuat_oleh = bot');

select uji.simpan('k2', public.x_berita_kandidat(900000000002, '{"jam":2}'));
select uji.sama((uji.ambil('k2')->>'jumlah')::int, 2, 'kandidat sesudah edisi: yang sudah dipilih (a1, x2) tidak dikirim lagi');
select uji.sama(jsonb_array_length(uji.ambil('k2')->'edisi_terakhir'->'pilihan'), 3, 'edisi_terakhir memuat 3 judul pilihan');

-- ------------------------------------------------------------ web: owner
reset role;
select uji.token(null);
select uji.simpan('pid', to_jsonb((select id from public.berita_pilihan where url = 'https://news.google.com/x2')));
select uji.simpan('pid_a1', to_jsonb((select id from public.berita_pilihan where url = 'https://contoh.id/a1')));
select uji.jadi('11111111-1111-4111-8111-111111111111');
select uji.simpan('w1', public.web_berita());
select uji.sama((uji.ambil('w1')->'edisi'->>'id')::bigint, (uji.ambil('e1')->>'id')::bigint, 'web_berita: edisi terbaru');
select uji.sama(jsonb_array_length(uji.ambil('w1')->'edisi'->'pilihan'), 3, 'web_berita: 3 pilihan');
select uji.sama(uji.ambil('w1')->'edisi'->'pilihan'->0->>'kategori', 'kebijakan', 'pilihan pertama = skor tertinggi');
select uji.sama((uji.ambil('w1')->'daftar_edisi'->0->>'wajib')::int, 1, 'daftar edisi: hitungan wajib baca (skor 5)');
select uji.sama((uji.ambil('w1')->'sumber'->>'galat')::int, 1, 'ringkasan sumber: 1 galat');
select uji.galat($$select public.web_berita('{"edisi":987654}')$$, 'PT404', 'edisi tidak ada → 404');

select uji.cek((public.web_berita_tanda(jsonb_build_object('pilihan_id', uji.ambil('pid'), 'disimpan', true, 'dibaca', true))->>'disimpan')::boolean,
  'tanda simpan + dibaca');
select uji.cek(not (public.web_berita_tanda(jsonb_build_object('pilihan_id', uji.ambil('pid'), 'kurang', false))->>'kurang')::boolean
               and (public.web_berita_tanda(jsonb_build_object('pilihan_id', uji.ambil('pid')))->>'disimpan')::boolean,
  'kunci yang tidak dikirim tidak berubah');
select uji.galat($$select public.web_berita_tanda('{"pilihan_id":1,"disimpan":"ya"}')$$, 'PT400', 'tanda bukan boolean → 400');
select uji.sama(jsonb_array_length(public.web_berita_tersimpan()->'items'), 1, 'tersimpan: 1');
select uji.sama((public.web_berita()->>'tersimpan')::int, 1, 'web_berita: hitungan tersimpan');
select uji.cek((public.web_berita_tanda(jsonb_build_object('pilihan_id', uji.ambil('pid_a1'), 'kurang', true))->>'kurang')::boolean,
  'tanda kurang relevan');

select uji.simpan('s1', public.web_berita_semua('{"batas":2}'));
select uji.sama(jsonb_array_length(uji.ambil('s1')->'items'), 2, 'semua: halaman 1 berisi 2');
select uji.cek(uji.ambil('s1')->'berikut' <> 'null'::jsonb, 'semua: ada halaman berikut');
select uji.simpan('s2', public.web_berita_semua(jsonb_build_object('batas', 2, 'sebelum', uji.ambil('s1')->'berikut')));
select uji.sama(jsonb_array_length(uji.ambil('s2')->'items'), 2, 'semua: halaman 2 berisi 2');
select uji.cek(uji.ambil('s2')->'berikut' = 'null'::jsonb, 'semua: halaman terakhir tanpa berikut');
select uji.cek(not exists (select 1 from jsonb_array_elements(uji.ambil('s1')->'items') a join jsonb_array_elements(uji.ambil('s2')->'items') b on a->>'id' = b->>'id'),
  'paginasi tanpa item berulang');
select uji.sama(jsonb_array_length(public.web_berita_semua('{"wilayah":"dalam"}')->'items'), 4, 'saring wilayah dalam');
select uji.sama(jsonb_array_length(public.web_berita_semua('{"sumber":"gnews-id"}')->'items'), 1, 'saring sumber');
select uji.sama(jsonb_array_length(public.web_berita_semua('{"q":"baja"}')->'items'), 2, 'cari kata "baja"');
select uji.sama(jsonb_array_length(public.web_berita_semua('{"q":"impor  china"}')->'items'), 1, 'cari beberapa kata: semua harus ada, urutan bebas');
select uji.sama(jsonb_array_length(public.web_berita_semua('{"q":"100%"}')->'items'), 0, 'tanda % dicari harfiah');
select uji.sama(jsonb_array_length(public.web_berita_semua()->'sumber'), 36, 'status 36 sumber ikut dikirim');
select uji.galat($$select public.web_berita_semua('{"wilayah":"mars"}')$$, 'PT400', 'wilayah salah → 400');

-- umpan balik owner sampai ke kurator
reset role;
select uji.jadi_service();
select uji.token('b0b0b0b0-0000-4000-8000-000000000362');
select uji.simpan('k3', public.x_berita_kandidat(900000000002, '{}'));
select uji.sama(jsonb_array_length(uji.ambil('k3')->'umpan_balik'->'disimpan'), 1, 'umpan balik: 1 disimpan');
select uji.sama(uji.ambil('k3')->'umpan_balik'->'kurang'->0->>'kategori', 'ekonomi', 'umpan balik: kurang relevan + kategori');

-- ------------------------------------------------------------ anggota biasa ditolak
reset role;
select uji.token(null);
select uji.jadi('22222222-2222-4222-8222-222222222222');
select uji.galat($$select public.web_berita()$$, 'PT403', 'member biasa: web_berita → 403', 'owner');
select uji.galat($$select public.web_berita_semua()$$, 'PT403', 'member biasa: web_berita_semua → 403');
select uji.galat($$select public.web_berita_tersimpan()$$, 'PT403', 'member biasa: web_berita_tersimpan → 403');
select uji.galat(format($$select public.web_berita_tanda('{"pilihan_id":%s,"disimpan":true}')$$, uji.ambil('pid')), 'PT403', 'member biasa: tanda → 403');
select uji.galat($$select count(*) from public.berita$$, '42501', 'member biasa: tabel berita tertutup');
reset role;
select uji.jadi_anon();
select uji.galat($$select public.web_berita()$$, '42501', 'anon: tidak bisa memanggil web_berita');

rollback;
