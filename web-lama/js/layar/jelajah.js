// Jelajah: Space → Folder → List (web_struktur) dengan hitungan terbuka/telat. Arsip disembunyikan (bisa dibuka).
import { sesi, struktur } from '../sesi.js';
import { h, kosongkan } from '../util.js';

function tautanList(l) {
  const n = l.hitungan || {};
  return h('a', { class: 'tautan-list', href: `/l/${encodeURIComponent(l.id)}`, 'data-list': l.id },
    h('span', { class: 'nama-list' }, l.name,
      l.tidak_ditagih ? h('span', { class: 'chip garis', text: 'tidak ditagih' }) : null,
      l.archived ? h('span', { class: 'chip garis', text: 'arsip' }) : null,
      sesi.cermin && l.sumber === 'clickup' ? h('span', { class: 'chip cermin', title: 'List ClickUp: hanya-baca selama mode cermin' }, 'ClickUp') : null),
    h('span', { class: 'angka' },
      n.telat ? h('span', { class: 'chip telat', title: 'Telat' }, `${n.telat} telat`) : null,
      h('span', { title: 'Terbuka' }, `${n.terbuka || 0} terbuka`)));
}

export async function tampil(ctx) {
  ctx.judul('Jelajah');
  const arsip = ctx.query.get('arsip') === '1';
  const data = await struktur(true);
  const wadah = h('div');
  const tombolArsip = h('button', { type: 'button', class: 'tombol kecil', 'aria-pressed': arsip ? 'true' : 'false',
    onclick: () => ctx.navigasi(arsip ? '/jelajah' : '/jelajah?arsip=1', { ganti: true }) }, arsip ? 'Sembunyikan arsip' : 'Tampilkan arsip');
  ctx.el.append(h('div', { class: 'baris-aksi kanan' }, tombolArsip), wadah);

  const tampak = (x) => arsip || !x.archived;
  const spaces = data.spaces.filter(tampak);
  if (!spaces.length) { kosongkan(wadah, h('p', { class: 'kosong', text: 'Belum ada space.' })); return; }
  kosongkan(wadah, spaces.map((sp) => h('section', { class: 'pohon-space', 'data-space': sp.id },
    h('h3', {}, sp.name, sp.private ? h('span', { class: 'chip garis', text: 'privat' }) : null,
      sp.archived ? h('span', { class: 'chip garis', text: 'arsip' }) : null),
    sp.folders.filter(tampak).map((f) => {
      const lists = f.lists.filter(tampak);
      if (!lists.length) return null;
      if (f.hidden) return h('div', { class: 'pohon-folder' }, lists.map(tautanList));  // folder tersembunyi = list langsung
      return h('details', { class: 'pohon-folder', open: true },
        h('summary', {}, f.name, f.archived ? h('span', { class: 'chip garis', text: 'arsip' }) : null,
          h('span', { class: 'redup kecil', text: `· ${lists.length} list` })),
        lists.map(tautanList));
    }),
    sp.lists.filter(tampak).map(tautanList))));
}
