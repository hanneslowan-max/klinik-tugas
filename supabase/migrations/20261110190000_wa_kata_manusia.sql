-- Isi awal wa.kata_manusia: daftar ACC Hannes 10 Nov 2026 (pop-up B24 sesi rhj-brain, semua kelompok).
-- Sumber: rhj-brain deliverables/anvil/WA-BOT-KATA-MANUSIA.json. Regex JavaScript (flag iu) di Edge wa.ts.
-- Idempoten: pola yang sudah ada tidak digandakan.
insert into wa.kata_manusia (pola, catatan) values
  ($k$\b(komplain|complain|keluhan|kecewa|tidak puas|gak puas|ga puas)\b$k$, 'kelompok komplain (ACC Hannes 10 Nov 2026)'),
  ($k$\b(rusak|patah|cacat|retur|refund|tukar barang|dikembalikan|kembalikan|tidak sesuai|ga sesuai|gak sesuai|salah kirim|barang kurang)\b$k$, 'kelompok rusak_retur (ACC Hannes 10 Nov 2026)'),
  ($k$\b(sudah (tf|transfer|bayar)|bukti (tf|transfer|bayar)|pelunasan|tagihan|invoice|faktur|kwitansi|dp sudah)\b$k$, 'kelompok bayar_tagihan (ACC Hannes 10 Nov 2026)'),
  ($k$\b(resi|belum sampai|belum datang|belum diterima|kapan (dikirim|sampai)|status (kiriman|pengiriman)|kurir|supir)\b$k$, 'kelompok kirim_berjalan (ACC Hannes 10 Nov 2026)'),
  ($k$\b(otp|kode verifikasi|kode otp|password|kata sandi)\b$k$, 'kelompok otp_keamanan (ACC Hannes 10 Nov 2026)'),
  ($k$\b(stop|berhenti|jangan (balas|chat|kirim)|unsubscribe|unsub)\b$k$, 'kelompok stop (ACC Hannes 10 Nov 2026)'),
  ($k$\b(somasi|polisi|pengacara|lapor(kan)? ke)\b$k$, 'kelompok hukum (ACC Hannes 10 Nov 2026)')
on conflict (pola) do nothing;
