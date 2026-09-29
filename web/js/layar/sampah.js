// Sampah (owner): tugas terhapus lunak → pulihkan (web_pulihkan) / hapus permanen (Edge /x/admin/purge: web_purge +
// hapus objek Storage lampiran; lihat komponen.hapusPermanen).
import { rpc, pilih, pesanGalat } from '../api.js';
import { h, kosongkan, fmtWaktu, konfirmasi, toast } from '../util.js';
import { hapusPermanen } from '../komponen.js';

export async function tampil(ctx) {
  ctx.judul('Sampah');
  const daftar = h('ul', { class: 'daftar-tugas', 'data-uji': 'daftar-sampah' });
  ctx.el.append(
    h('p', { class: 'redup kecil', text: 'Tugas yang dihapus owner. Pulihkan, atau hapus permanen (riwayat tetap tersimpan).' }), daftar);

  async function muat() {
    const [tugas, lists, anggota] = await Promise.all([
      pilih('tasks', (q) => q.select('id,name,list_id,parent_id,deleted_at,deleted_by,sumber').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(500)),
      pilih('lists', (q) => q.select('id,name')),
      rpc('web_anggota'),
    ]);
    const namaList = new Map(lists.map((l) => [l.id, l.name]));
    const namaAnggota = new Map(anggota.map((m) => [String(m.id), m.username]));
    if (!tugas.length) { kosongkan(daftar, h('li', { class: 'kosong', text: 'Sampah kosong.' })); return; }
    kosongkan(daftar, tugas.map((t) => h('li', { class: 'baris-tugas', 'data-id': t.id },
      h('a', { class: 'tautan-tugas', href: `/t/${encodeURIComponent(t.id)}` },
        h('div', { class: 'nama', text: t.name }),
        h('div', { class: 'meta' }, h('span', { text: namaList.get(t.list_id) || t.list_id }),
          h('span', { text: `dihapus ${fmtWaktu(t.deleted_at)}` }),
          t.deleted_by ? h('span', { text: `oleh ${namaAnggota.get(String(t.deleted_by)) || t.deleted_by}` }) : null,
          t.parent_id ? h('span', { class: 'chip garis', text: 'sub-tugas' }) : null)),
      h('div', { class: 'baris-aksi' },
        h('button', { type: 'button', class: 'tombol kecil', onclick: async () => {
          try { await rpc('web_pulihkan', { p_task: t.id }); toast('Tugas dipulihkan', 'sukses'); await muat(); } catch (e) { toast(pesanGalat(e), 'galat'); }
        } }, 'Pulihkan'),
        h('button', { type: 'button', class: 'tombol kecil bahaya', onclick: async () => {
          if (!await konfirmasi(`Hapus permanen "${t.name}" beserta sub-tugas, komentar, dan berkas lampirannya? Tidak bisa dibatalkan.`,
            { ya: 'Hapus permanen', bahaya: true })) return;
          if (await hapusPermanen(t.id)) {
            try { await muat(); } catch (e) { toast(pesanGalat(e), 'galat'); }
          }
        } }, 'Hapus permanen')))));
  }
  try { await muat(); } catch (e) { kosongkan(daftar, h('li', { class: 'kotak-galat', text: pesanGalat(e) })); }
}
