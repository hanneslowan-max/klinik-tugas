// Tugas Saya: Telat · Hari ini · ≤3 hari kerja · Nanti · Tanpa due (web_tugas_saya). Bisa melihat anggota lain.
import { rpc, pesanGalat } from '../api.js';
import { sesi, anggota } from '../sesi.js';
import { h, kosongkan, fmtTanggal } from '../util.js';
import { daftarTugas } from '../komponen.js';

const GRUP = [
  { kunci: 'telat', judul: 'Telat', kelas: 'telat' },
  { kunci: 'hari_ini', judul: 'Hari ini', kelas: 'hari-ini' },
  { kunci: 'tiga_hk', judul: '≤3 hari kerja', kelas: 'dekat' },
  { kunci: 'nanti', judul: 'Nanti', kelas: '' },
  { kunci: 'tanpa_due', judul: 'Tanpa due', kelas: '', tutup: true },
];

export async function tampil(ctx) {
  ctx.judul('Tugas Saya');
  const idSaya = sesi.member.id;
  const pilihMember = ctx.query.get('m');
  const target = pilihMember ? Number(pilihMember) : null;

  const wadahIsi = h('div', { 'aria-busy': 'true' }, h('p', { class: 'kosong', text: 'Memuat…' }));
  const pemilih = h('select', { 'aria-label': 'Tugas milik', class: 'kecil' });
  const kepala = h('div', { class: 'baris-aksi' },
    h('label', { class: 'spasi' }, h('span', { class: 'redup kecil', text: 'Tugas milik ' }), pemilih));
  ctx.el.append(kepala, wadahIsi);

  anggota().then((daftar) => {
    const orang = daftar.filter((m) => m.aktif && m.role !== 'bot');
    pemilih.replaceChildren(...orang.map((m) => h('option', { value: String(m.id), selected: Number(m.id) === (target || Number(idSaya)),
      text: Number(m.id) === Number(idSaya) ? `Saya (${m.username})` : m.username })));
  }).catch(() => {});
  pemilih.addEventListener('change', () => {
    const v = Number(pemilih.value);
    ctx.navigasi(v === Number(idSaya) ? '/saya' : `/saya?m=${v}`, { ganti: true });
  });

  let data;
  try {
    data = await rpc('web_tugas_saya', target && target !== Number(idSaya) ? { p_member: target } : {});
  } catch (e) {
    kosongkan(wadahIsi, h('div', { class: 'kotak-galat', role: 'alert' }, pesanGalat(e)));
    return;
  }
  wadahIsi.removeAttribute('aria-busy');
  const bukanSaya = target && target !== Number(idSaya);
  ctx.judul(bukanSaya ? `Tugas ${data.member?.username || ''}` : 'Tugas Saya');

  const total = GRUP.reduce((n, g) => n + (data[g.kunci] || []).length, 0);
  kosongkan(wadahIsi,
    h('p', { class: 'redup kecil', text: `${fmtTanggal(data.tanggal)} (WIB) · ${total} kartu terbuka` }),
    total === 0 ? h('p', { class: 'kosong', text: 'Tidak ada kartu terbuka.' }) : null,
    GRUP.map((g) => {
      const isi = data[g.kunci] || [];
      if (!isi.length) return null;
      return h('details', { class: `grup ${g.kelas}`, open: !g.tutup, 'data-grup': g.kunci },
        h('summary', {}, h('span', { text: g.judul }), h('span', { class: 'jumlah', text: String(isi.length) })),
        daftarTugas(isi, { tampilList: true }));
    }));
}
