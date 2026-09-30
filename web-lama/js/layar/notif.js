// Notifikasi (assign, mention, komentar) milik sendiri. Lonceng di header di-poll tiap 60 dtk (app.js); membuka satu
// notifikasi / "Tandai semua dibaca" langsung menurunkan angka lonceng (setNotifBelum) lalu disamakan dengan server.
import { rpc, pesanGalat } from '../api.js';
import { muatProfil, sesi, setNotifBelum } from '../sesi.js';
import { h, kosongkan, avatar, fmtRelatif, fmtWaktu, toast } from '../util.js';

const JENIS = { assign: 'menugaskan Anda', mention: 'menyebut Anda', komentar: 'berkomentar' };

export async function tampil(ctx) {
  ctx.judul('Notifikasi');
  const daftar = h('ul', { class: 'daftar-tugas', 'data-uji': 'daftar-notif' });
  const tombolSemua = h('button', { type: 'button', class: 'tombol kecil', onclick: async () => {
    try {
      const r = await rpc('web_notif_baca', { p_ids: null });
      setNotifBelum(0);
      toast(`${r.dibaca} notifikasi ditandai dibaca`, 'sukses', 2000);
      await muat();
    } catch (e) { toast(pesanGalat(e), 'galat'); }
  } }, 'Tandai semua dibaca');
  ctx.el.append(h('div', { class: 'baris-aksi kanan' }, tombolSemua), daftar);

  let belum = 0;
  async function muat() {
    const r = await rpc('web_notif', { p_limit: 100 });
    tombolSemua.disabled = r.belum === 0;
    belum = r.belum;
    setNotifBelum(r.belum);
    if (!r.items.length) { kosongkan(daftar, h('li', { class: 'kosong', text: 'Belum ada notifikasi.' })); return; }
    kosongkan(daftar, r.items.map((n) => {
      const href = n.task ? `/t/${encodeURIComponent(n.task.id)}${n.comment_id ? `#c-${n.comment_id}` : ''}` : null;
      return h('li', { class: `baris-tugas${n.read_at ? '' : ' belum'}`, 'data-notif': n.id, 'data-jenis': n.jenis },
        h('a', { class: 'tautan-tugas', href: href || '#', onclick: (e) => {
          if (!href) e.preventDefault();
          if (n.read_at) return;
          // lonceng langsung turun (navigasi ke kartu tidak menunggu), lalu disamakan dengan server
          n.read_at = new Date().toISOString();
          belum = Math.max(0, belum - 1);
          setNotifBelum(belum);
          rpc('web_notif_baca', { p_ids: [n.id] }).catch(() => {}).finally(() => { muatProfil().catch(() => {}); });
        } },
        h('div', { class: 'nama' }, n.read_at ? null : h('span', { class: 'chip info', text: 'baru' }), ' ',
          n.actor ? n.actor.username : 'Seseorang', ' ', JENIS[n.jenis] || n.jenis,
          n.task ? [' di ', h('strong', { text: n.task.name })] : null, n.task && n.task.deleted ? ' (di Sampah)' : ''),
        n.cuplikan ? h('div', { class: 'redup kecil', text: `"${n.cuplikan}"` }) : null,
        h('div', { class: 'meta' }, n.actor ? avatar(n.actor) : null, h('span', { title: fmtWaktu(n.created_at), text: fmtRelatif(n.created_at, sesi.hariIni) }))));
    }));
  }
  try { await muat(); } catch (e) { kosongkan(daftar, h('li', { class: 'kotak-galat', text: pesanGalat(e) })); }
}
