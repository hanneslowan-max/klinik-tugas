// Cari: nama, kode (Y7, FX-PM-…), isi, ID lama, atau tempel URL app.clickup.com/t/… (web_cari).
// URL list ClickUp (/v/l/…, /v/li/…, /v/b/…) atau tautan list aplikasi (/l/<id>) → web_cari.rujukan {type:'list'} →
// langsung membuka list itu; URL folder/space → kartu di wadah itu + tautan ke Jelajah (perbaikan P6).
import { rpc, pesanGalat } from '../api.js';
import { struktur } from '../sesi.js';
import { h, kosongkan } from '../util.js';
import { daftarTugas } from '../komponen.js';

/** ID tugas dari URL ClickUp / URL app / ID polos. */
export function idDariRujukan(q) {
  const s = q.trim();
  const m = s.match(/app\.clickup\.com\/t\/(?:\d+\/)?([A-Za-z0-9_-]+)/) || s.match(/\/t\/([A-Za-z0-9_-]+)(?:[/?#]|$)/);
  return m ? m[1] : null;
}

export async function tampil(ctx) {
  ctx.judul('Cari');
  const q0 = ctx.query.get('q') || '';
  const sp0 = ctx.query.get('space') || '';
  const input = h('input', { type: 'search', name: 'q', value: q0, placeholder: 'Nama, kode (Y7), isi, ID, atau URL ClickUp', 'aria-label': 'Kata kunci', autocomplete: 'off', enterkeyhint: 'search' });
  const pilihSpace = h('select', { name: 'space', 'aria-label': 'Space' }, h('option', { value: '', text: 'Semua space' }));
  const hasil = h('div', { 'aria-live': 'polite' });
  ctx.el.append(
    h('form', { role: 'search', onsubmit: (e) => { e.preventDefault(); jalankan(); } },
      h('label', { class: 'bidang' }, h('span', { class: 'sr', text: 'Cari' }), input),
      h('div', { class: 'filter' }, pilihSpace, h('button', { type: 'submit', class: 'tombol utama' }, 'Cari'))),
    h('p', { class: 'redup kecil', text: 'Tempel URL app.clickup.com/t/… atau tautan tugas untuk langsung membuka kartunya.' }),
    hasil);

  struktur().then((s) => {
    for (const sp of s.spaces.filter((x) => !x.archived)) pilihSpace.append(h('option', { value: sp.id, selected: sp.id === sp0, text: sp.name }));
  }).catch(() => {});

  async function jalankan() {
    const q = input.value.trim();
    ctx.setQuery({ q, space: pilihSpace.value });
    if (!q) { kosongkan(hasil); return; }
    kosongkan(hasil, h('p', { class: 'kosong', text: 'Mencari…' }));
    try {
      const r = await rpc('web_cari', { p_q: q, p_space: pilihSpace.value || null });
      const idRujukan = idDariRujukan(q);
      const persis = r.hasil.find((t) => t.id === q || (idRujukan && t.id === idRujukan));
      if (persis && (idRujukan || r.hasil.length === 1 && persis.id === q)) {
        ctx.navigasi(`/t/${encodeURIComponent(persis.id)}`);
        return;
      }
      const ruj = r.rujukan;
      if (ruj && ruj.type === 'list' && ruj.id) {
        ctx.navigasi(`/l/${encodeURIComponent(ruj.id)}`);
        return;
      }
      const NAMA_WADAH = { folder: 'folder', space: 'space' };
      kosongkan(hasil,
        ruj && NAMA_WADAH[ruj.type] ? h('div', { class: 'kotak-info', 'data-uji': 'rujukan-wadah' },
          `Tautan ${NAMA_WADAH[ruj.type]} ClickUp: kartu di ${NAMA_WADAH[ruj.type]} itu ada di bawah. `,
          h('a', { href: '/jelajah', class: 'tautan-sentuh' }, 'Buka Jelajah')) : null,
        h('p', { class: 'redup kecil', text: `${r.hasil.length} hasil${r.hasil.length >= 50 ? ' (maks. 50, persempit kata kunci)' : ''}` }),
        daftarTugas(r.hasil, { tampilList: true, kosong: idRujukan ? `Tugas ${idRujukan} tidak ditemukan.` : 'Tidak ada yang cocok.' }));
    } catch (e) {
      kosongkan(hasil, h('div', { class: 'kotak-galat', role: 'alert' }, pesanGalat(e)));
    }
  }
  if (q0) await jalankan(); else input.focus();
}
