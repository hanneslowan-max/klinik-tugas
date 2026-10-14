-- Pipeline: ORDER bisa DIBATALKAN dengan alasan TERTULIS (revisi Hannes 14 Okt 2026: "customer bisa membatalkan
-- setelah terjadi order"; keputusan: lead pindah ke BATAL).
--
-- Aksi baru 'batal_order' di inti_pipeline_tahap (dipanggil lewat web_pipeline_tahap yang sudah ada):
--   * hanya untuk lead ORDER; hak = admin/owner, atau rep PEMILIK lead (order tanpa pemilik: admin, atau rep Klaim dulu);
--   * p.alasan = teks bebas WAJIB, 5–500 karakter sesudah di-trim → tahap BATAL, alasan_batal = 'Order dibatalkan'
--     (kategori baru, khusus aksi ini), alasan_batal_lain = teks;
--   * data order (no_sp, tanggal_sp, nilai_transaksi, no_po, bayar_*) TIDAK disentuh → tetap tampil sebagai riwayat;
--     No SP tetap terpakai (dokumen sudah terbit). Keluar dari tab Order & omzet, masuk hitungan batal (ringkas_v2);
--   * jejak: lead_riwayat_tahap ORDER→BATAL (trigger: siapa + kapan) + lead_aktivitas 'Catatan' berisi alasan;
--     rencana FU (fu_berikutnya) dikosongkan.
-- Penjaga baru: lead ORDER tidak bisa lagi dipindah lewat aksi penawaran/order/batal/alihkan (PT409) — sebelumnya bisa
-- lewat RPC tanpa alasan walau UI tidak menyediakan tombolnya. Order yang DIBATALKAN final: aksi tahap apa pun → PT409
-- (status bayar/No PO lama tidak terbawa ke "order ulang", alasan tertulis tidak terhapus, penjaga impor ulang tetap
-- berlaku; customer yang order lagi = lead baru). Aksi 'order' pada lead BATAL biasa (lewat API) mengosongkan alasan lama.
--
-- BERBASIS versi inti_pipeline_tahap di 20261014120000_pipeline_nilai_penawaran_wajib (PR #12, nilai penawaran wajib);
-- cabang penawaran/order/alihkan lainnya identik. Bila 20261014120000 diterapkan SESUDAH berkas ini, terapkan ulang
-- berkas ini (create or replace menimpa).
-- Data: hanya CHECK alasan_batal diganti superset (+ 'Order dibatalkan'): semua baris lama tetap sah. Tanpa
-- UPDATE/DELETE data. Hak eksekusi tetap (create or replace mempertahankan grant/revoke).

alter table public.lead
  drop constraint lead_alasan_batal_check,
  add constraint lead_alasan_batal_check check (alasan_batal is null or alasan_batal in (
    'Harga', 'Stok/waktu kirim', 'Spesifikasi tidak cocok', 'Tidak ada respon',
    'Beli di tempat lain', 'Proyek batal/ditunda', 'Lainnya', 'Order dibatalkan'));

create or replace function public.inti_pipeline_tahap(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_lead public.lead; v_aksi text := p->>'aksi';
  v_pemilik bigint; v_kode text; v_sp text; v_tgl_sp date; v_nilai bigint; v_alasan text;
begin
  v_lead := public.pipeline_lead_wajib(p->>'lead_id');
  -- kunci baris (pola inti_pipeline_order_ubah): pembatalan & ubah data order tidak bisa saling menyalip
  select * into v_lead from public.lead where id = v_lead.id for update;
  perform public.pipeline_boleh_ubah(v_lead.pemilik);

  -- Lead ORDER hanya keluar lewat 'batal_order' (alasan tertulis wajib); data order diubah lewat web_pipeline_order_ubah.
  if v_lead.tahap = 'ORDER' and v_aksi in ('penawaran', 'order', 'batal', 'alihkan') then
    perform public.lempar('PT409', 'Lead sudah ORDER: pakai "Batalkan order" (alasan wajib ditulis) atau "Data order"', 'KONFLIK_001');
  end if;
  -- Order yang sudah dibatalkan FINAL (dialog: "tidak bisa diurungkan"): tanpa ini "order ulang" lewat RPC membawa status
  -- bayar/No PO order lama, dan penawaran/batal/alihkan menghapus alasan tertulis + mematikan penjaga alat impor.
  if v_lead.tahap = 'BATAL' and v_lead.alasan_batal = 'Order dibatalkan' and v_aksi in ('penawaran', 'order', 'batal', 'alihkan') then
    perform public.lempar('PT409', 'Order ini sudah dibatalkan dan tidak bisa dipindah tahap lagi (customer order lagi = lead baru)', 'KONFLIK_001');
  end if;

  if v_aksi = 'penawaran' then
    -- Nilai penawaran WAJIB > 0 (Hannes 14 Okt, IMP-PIP-261014-1): jadwal FU memakai patokan > Rp20 jt.
    -- Penawaran ulang boleh tanpa angka baru bila lead sudah punya nilai > 0.
    v_nilai := coalesce(nullif(p->>'nilai_penawaran', '')::bigint, v_lead.nilai_penawaran);
    if v_nilai is null or v_nilai <= 0 then
      perform public.lempar('PT400', 'Nilai penawaran wajib diisi (> 0): total rupiah di penawaran', 'INPUT_001');
    end if;
    update public.lead set tahap = 'PENAWARAN', nilai_penawaran = v_nilai where id = v_lead.id;

  elsif v_aksi = 'order' then
    v_tgl_sp := coalesce(nullif(p->>'tanggal_sp', '')::date, public.hari_ini_wib());
    if v_tgl_sp > public.hari_ini_wib() then perform public.lempar('PT400', 'Tanggal SP tidak boleh di masa depan', 'INPUT_001'); end if;
    v_nilai := nullif(p->>'nilai_transaksi', '')::bigint;
    if v_nilai is null or v_nilai <= 0 then perform public.lempar('PT400', 'Nilai transaksi wajib > 0 untuk order', 'INPUT_001'); end if;
    v_pemilik := coalesce(v_lead.pemilik, public.aktor());        -- klaim bila belum ada pemilik
    select kode_sp into v_kode from public.pipeline_akses where member_id = v_pemilik;
    if nullif(p->>'no_sp', '') is not null then
      v_sp := btrim(p->>'no_sp');
    else
      if nullif(p->>'nomor', '') is null then perform public.lempar('PT400', 'Nomor SP wajib', 'INPUT_001'); end if;
      if v_kode is null then perform public.lempar('PT400', 'Pemilik lead belum punya kode SP (RSG/MCE)', 'INPUT_001'); end if;
      v_sp := regexp_replace(p->>'nomor', '[^0-9]', '', 'g') || '/' || v_kode || '/'
            || public.pipeline_romawi(extract(month from v_tgl_sp)::int) || '/' || extract(year from v_tgl_sp)::text;
    end if;
    if v_sp !~ '^\d+/(RSG|MCE)/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/20\d\d$' then
      perform public.lempar('PT400', format('No SP tidak sesuai pola: %s', v_sp), 'INPUT_001');
    end if;
    if exists (select 1 from public.lead where no_sp = v_sp and id <> v_lead.id) then
      perform public.lempar('PT409', format('No SP sudah dipakai lead lain: %s', v_sp), 'KONFLIK_001');
    end if;
    -- alasan batal lama (lead BATAL biasa yang diorder ulang lewat API) tidak boleh tertinggal
    update public.lead set tahap = 'ORDER', pemilik = v_pemilik, no_sp = v_sp,
      tanggal_sp = v_tgl_sp, nilai_transaksi = v_nilai, alasan_batal = null, alasan_batal_lain = null where id = v_lead.id;

  elsif v_aksi = 'batal' then
    if nullif(p->>'alasan_batal', '') is null then perform public.lempar('PT400', 'Alasan batal wajib', 'INPUT_001'); end if;
    if p->>'alasan_batal' = 'Order dibatalkan' then
      perform public.lempar('PT400', 'Alasan "Order dibatalkan" khusus untuk tombol Batalkan order', 'INPUT_001');
    end if;
    if p->>'alasan_batal' = 'Lainnya' and nullif(p->>'alasan_batal_lain', '') is null then
      perform public.lempar('PT400', 'Alasan batal "Lainnya" wajib diisi teks', 'INPUT_001');
    end if;
    update public.lead set tahap = 'BATAL', alasan_batal = p->>'alasan_batal',
      alasan_batal_lain = nullif(p->>'alasan_batal_lain', '') where id = v_lead.id;

  elsif v_aksi = 'batal_order' then
    -- Hak lebih ketat dari pipeline_boleh_ubah: rep hanya untuk lead MILIKNYA (order tanpa pemilik → admin, atau rep
    -- Klaim dulu). Keputusan revisi #7: data order = rep pemilik + admin.
    if public.pipeline_peran_aktor() <> 'admin' and v_lead.pemilik is distinct from public.aktor() then
      perform public.lempar('PT403', 'Hanya rep pemilik lead atau admin yang bisa membatalkan order', 'ACCESS_001');
    end if;
    if v_lead.tahap <> 'ORDER' then
      perform public.lempar('PT409', 'Batalkan order hanya untuk lead berstatus ORDER', 'KONFLIK_001');
    end if;
    v_alasan := btrim(replace(coalesce(p->>'alasan', ''), E'\r\n', E'\n'), E' \t\r\n');
    if char_length(v_alasan) < 5 then
      perform public.lempar('PT400', 'Alasan pembatalan wajib ditulis (minimal 5 karakter)', 'INPUT_001');
    end if;
    if char_length(v_alasan) > 500 then
      perform public.lempar('PT400', 'Alasan pembatalan maksimal 500 karakter', 'INPUT_001');
    end if;
    -- Data order (No SP, tanggal SP, nominal, No PO, pembayaran) SENGAJA tidak disentuh: riwayat. No SP tetap terpakai.
    update public.lead set tahap = 'BATAL', alasan_batal = 'Order dibatalkan', alasan_batal_lain = v_alasan
     where id = v_lead.id;
    -- Jejak permanen alasan + pelaku + waktu (lead_riwayat_tahap ORDER→BATAL dicatat trigger, tanpa alasan).
    -- rencana_berikutnya NULL → trigger pipeline_aktivitas_sesudah mengosongkan lead.fu_berikutnya: order batal tidak
    -- di-follow-up lagi (dan riwayat tidak menampilkan "Rencana berikutnya" di bawah catatan pembatalan).
    insert into public.lead_aktivitas (lead_id, oleh, jenis, hasil, rencana_berikutnya)
      values (v_lead.id, public.aktor(), 'Catatan', 'Order dibatalkan. Alasan: ' || v_alasan, null);

  elsif v_aksi = 'alihkan' then
    if nullif(p->>'dialihkan_ke', '') is null then perform public.lempar('PT400', 'Tujuan pengalihan wajib diisi', 'INPUT_001'); end if;
    update public.lead set tahap = 'DIALIHKAN', dialihkan_ke = btrim(p->>'dialihkan_ke') where id = v_lead.id;

  else
    perform public.lempar('PT400', format('Aksi tahap tidak dikenal: %s', coalesce(v_aksi, '(kosong)')), 'INPUT_001');
  end if;

  return public.j_pipeline_lead(v_lead.id, false);
end; $$;
