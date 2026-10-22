-- Pipeline: jadwal FU berikutnya OTOMATIS = hari ini + 2 hari kerja (IMP-PIP-261015-1, ACC Hannes 20 Okt 2026).
-- Data 18 Okt: Riksa 0 dari 23 lead aktif punya fu_berikutnya — rep mencatat FU tanpa mengisi "Rencana berikutnya",
-- jadi lead tidak pernah muncul lagi di tab "Follow up hari ini".
--
-- Aturan (hanya di inti_pipeline_fu_catat = tombol "Catat follow-up" lewat web_pipeline_fu_catat):
--   * rencana_berikutnya DIISI rep           → dipakai apa adanya (isian manual selalu menang, juga di lead tertutup);
--   * KOSONG dan lead AKTIF (BARU/PENAWARAN) → hari_ini_wib() + 2 hari kerja;
--   * KOSONG dan lead TERTUTUP (ORDER/BATAL/DIALIHKAN) → tetap kosong (perilaku lama: fu_berikutnya dikosongkan).
-- Hari kerja = definisi aplikasi (docs/ARSITEKTUR.md, sama dengan public.hari_kerja): Senin–Jumat dan bukan tanggal di
-- hari_libur (daftar libur diatur admin). Tanggal "hari ini" = public.hari_ini_wib() (zona Asia/Jakarta). Contoh: catat
-- Senin → Rabu; Kamis → Senin; Jumat → Selasa; Sabtu/Minggu → Selasa.
-- Tanggal otomatis disimpan sebagai lead_aktivitas.rencana_berikutnya (riwayat menampilkannya seperti isian manual);
-- trigger pipeline_aktivitas_sesudah tetap yang menyalinnya ke lead.fu_berikutnya.
--
-- TIDAK berubah: trigger pipeline_aktivitas_sesudah (alat impor, catatan "Data order diubah", catatan "Order dibatalkan"
-- tetap menulis rencana apa adanya), inti_pipeline_fu_set (atur rencana massal), tabel/data lama. Tanpa UPDATE data.
-- Hak: inti_pipeline_fu_catat = create or replace (grant/revoke lama tetap); pembantu baru internal (tanpa EXECUTE
-- untuk role API).

-- tanggal p_dari + p_n hari kerja (Senin–Jumat, bukan hari_libur). p_n <= 0 → p_dari.
create or replace function public.pipeline_tambah_hari_kerja(p_dari date, p_n integer)
returns date language plpgsql stable set search_path = '' as $$
declare v date := p_dari; k integer := 0;
begin
  if p_dari is null or p_n is null then return null; end if;
  while k < p_n loop
    v := v + 1;
    if extract(isodow from v) < 6 and not exists (select 1 from public.hari_libur h where h.tanggal = v) then
      k := k + 1;
    end if;
  end loop;
  return v;
end; $$;

-- BERBASIS definisi di 20261011120100_pipeline_fungsi (belum pernah diubah); hanya penentuan v_rencana yang baru.
create or replace function public.inti_pipeline_fu_catat(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_lead public.lead; v_rencana date;
begin
  v_lead := public.pipeline_lead_wajib(p->>'lead_id');
  perform public.pipeline_boleh_ubah(v_lead.pemilik);
  v_rencana := nullif(p->>'rencana_berikutnya', '')::date;
  -- kosong + lead aktif → jadwal otomatis +2 hari kerja; lead tertutup tidak dijadwalkan
  if v_rencana is null and v_lead.tahap in ('BARU', 'PENAWARAN') then
    v_rencana := public.pipeline_tambah_hari_kerja(public.hari_ini_wib(), 2);
  end if;
  insert into public.lead_aktivitas (lead_id, jenis, hasil, rencana_berikutnya, oleh)
    values (v_lead.id, coalesce(nullif(p->>'jenis', ''), 'Catatan'), nullif(p->>'hasil', ''),
            v_rencana, public.aktor());
  return public.j_pipeline_lead(v_lead.id, false);
end; $$;

-- ============================================================ hak: pembantu internal (pola 20261013121000_pipeline_hak_ketat)
revoke all on function public.pipeline_tambah_hari_kerja(date, integer) from public, anon, authenticated, service_role;
