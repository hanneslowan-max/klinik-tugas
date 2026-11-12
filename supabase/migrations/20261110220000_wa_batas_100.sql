-- Bot WA 0878: batas pesan bot dinaikkan (keputusan Hannes 10 Nov 2026 malam, pop-up B24 sesi rhj-brain:
-- "Naikan batas nya jadi 100 per 24 jam"). Menggantikan 3 per periode luar jam / 4 per 24 jam.
-- Batas per periode ikut 100 (praktis tidak membatasi); yang mengikat = 100 per 24 jam per nomor.
-- Pengaman lingkaran (lawan balasan otomatis) ada di Edge wa.ts (nilaiChat → diam auto_reply).
alter table wa.pengaturan drop constraint if exists pengaturan_maks_per_periode_check;
alter table wa.pengaturan drop constraint if exists pengaturan_maks_per_24jam_check;
alter table wa.pengaturan add constraint pengaturan_maks_per_periode_check check (maks_per_periode between 0 and 100);
alter table wa.pengaturan add constraint pengaturan_maks_per_24jam_check check (maks_per_24jam between 0 and 100);
alter table wa.pengaturan alter column maks_per_periode set default 100;
alter table wa.pengaturan alter column maks_per_24jam set default 100;
update wa.pengaturan set maks_per_periode = 100, maks_per_24jam = 100;
