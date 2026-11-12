// Komponen bersama: baris tugas, kartu papan, pemilih anggota/list, dialog buat tugas, hapus permanen.
import { rpc, pesanGalat, edgeAdmin } from './api.js';
import { sesi, anggotaAktif, semuaList, terkunci } from './sesi.js';
import {
  h, ikon, avatar, chipDue, chipPrioritas, statusPil, fmtRelatif, lembar, toast, konfirmasi, PRIORITAS, hariDalamMinggu, NAMA_HARI,
} from './util.js';

/** Meta ringkas kartu: status, due, prioritas, komentar, assignee, label. */
export function metaTugas(t, { tampilList = false, tampilStatus = true } = {}) {
  const hi = sesi.hariIni;
  return h('div', { class: 'meta' },
    tampilStatus ? statusPil(t.status, t.status_color) : null,
    chipDue(t, hi, sesi.libur),
    chipPrioritas(t.priority),
    t.comment_count ? h('span', { class: 'chip garis', title: t.last_comment_at ? `Komentar terakhir ${fmtRelatif(t.last_comment_at, hi)}` : '' },
      ikon('komentar'), `${t.comment_count}${t.last_comment_at ? ` · ${fmtRelatif(t.last_comment_at, hi)}` : ''}`) : null,
    t.parent_id ? h('span', { class: 'chip garis', text: 'sub-tugas' }) : null,
    t.menunggu_keputusan ? h('span', { class: 'chip info', text: 'menunggu keputusan' }) : null,
    t.list && t.list.tidak_ditagih ? h('span', { class: 'chip garis', text: 'tidak ditagih' }) : null,
    terkunci(t) ? h('span', { class: 'chip cermin', title: 'Kartu ClickUp, hanya-baca selama mode cermin' }, ikon('kunci'), 'ClickUp') : null,
    tampilList && t.list ? h('span', { class: 'redup', text: t.list.name }) : null,
    t.assignees && t.assignees.length ? h('span', { class: 'avatar-tumpuk' }, t.assignees.slice(0, 4).map((a) => avatar(a))) : null);
}

/**
 * Baris daftar. opsi.toggle = async (t) => void — tampilkan tombol selesai (dinonaktifkan untuk kartu terkunci).
 */
export function barisTugas(t, opsi = {}) {
  const kunci = terkunci(t);
  const li = h('li', { class: `baris-tugas${t.selesai ? ' selesai' : ''}${kunci ? ' terkunci' : ''}`, 'data-id': t.id });
  if (opsi.toggle) {
    const tombol = h('button', {
      type: 'button', class: 'toggle-selesai', 'aria-pressed': t.selesai ? 'true' : 'false', disabled: kunci,
      'aria-label': t.selesai ? `Buka lagi: ${t.name}` : `Tandai selesai: ${t.name}`,
      title: kunci ? 'Kartu ClickUp hanya-baca selama mode cermin' : (t.selesai ? 'Buka lagi' : 'Tandai selesai'),
      onclick: async () => {
        tombol.disabled = true;
        try { await opsi.toggle(t); } finally { tombol.disabled = kunci; }
      },
    }, h('span', { class: 'lingkar' }, ikon('centang')));
    li.appendChild(tombol);
  }
  li.appendChild(h('a', { class: 'tautan-tugas', href: `/t/${encodeURIComponent(t.id)}` },
    h('div', { class: 'nama', text: t.name }),
    metaTugas(t, opsi),
    opsi.ekstra ? opsi.ekstra(t) : null));
  return li;
}

export function daftarTugas(baris, opsi) {
  if (!baris.length) return h('p', { class: 'kosong', text: opsi && opsi.kosong || 'Tidak ada tugas.' });
  return h('ul', { class: 'daftar-tugas' }, baris.map((t) => barisTugas(t, opsi)));
}

/** Status tujuan untuk toggle selesai/buka. */
export function statusToggle(statuses, selesai) {
  const urut = [...statuses].sort((a, b) => a.orderindex - b.orderindex);
  if (selesai) return (urut.find((s) => s.type === 'open') || urut[0]).status;
  return (urut.find((s) => s.type === 'closed') || urut.find((s) => s.type === 'done')).status;
}

/** Toggle selesai lewat web_ubah_tugas (cek versi). Mengembalikan baris baru; 409 → lempar ulang. */
export async function toggleSelesai(t, statuses) {
  const tujuan = statusToggle(statuses, t.selesai);
  return rpc('web_ubah_tugas', { p_task: t.id, p_body: { status: tujuan }, p_versi: t.versi });
}

/**
 * Pemilih anggota (multi). terpilih = array id ATAU objek anggota {id, username, aktif, color…}.
 * Mengembalikan array id atau null bila batal.
 * Anggota terpilih yang tidak bisa dipilih lagi (nonaktif / eks-anggota impor / bot) tetap ditampilkan — tercentang,
 * bertanda "nonaktif" — supaya bisa DILEPAS; mereka tidak muncul untuk ditambahkan.
 */
export async function pilihAnggota(terpilih = [], judul = 'Pilih assignee') {
  const semua = await anggotaAktif();
  const idAktif = new Set(semua.map((m) => Number(m.id)));
  const set = new Set(terpilih.map((x) => Number(typeof x === 'object' ? x.id : x)));
  const tertinggal = terpilih.filter((x) => typeof x === 'object' && !idAktif.has(Number(x.id)));
  const baris = (m, nonaktif) => h('li', {},
    h('label', { class: nonaktif ? 'nonaktif' : null },
      h('input', { type: 'checkbox', value: String(m.id), checked: set.has(Number(m.id)), onchange: (e) => {
        if (e.target.checked) set.add(Number(m.id)); else set.delete(Number(m.id));
      } }),
      avatar(m),
      h('span', {}, h('strong', { text: m.username }),
        m.nama && m.nama !== m.username ? h('span', { class: 'redup kecil', text: ` · ${m.nama}` }) : null,
        nonaktif ? h('span', { class: 'chip garis', text: m.aktif === false ? 'nonaktif · hanya bisa dilepas' : 'hanya bisa dilepas' }) : null)));
  return lembar({
    judul,
    isi: h('ul', { class: 'pilihan-anggota' }, tertinggal.map((m) => baris(m, true)), semua.map((m) => baris(m, false))),
    aksi: [{ label: 'Batal', nilai: null }, { label: 'Simpan', kelas: 'utama', klik: () => [...set] }],
  });
}

/**
 * Selisih himpunan assignee → body {add, rem} untuk web_ubah_tugas (DB hanya memvalidasi `add`, jadi assignee lama yang
 * sudah nonaktif tidak membuat simpan gagal). null bila tidak ada perubahan.
 */
export function selisihAssignee(lama, baru) {
  const a = new Set(lama.map(Number));
  const b = new Set(baru.map(Number));
  const add = [...b].filter((x) => !a.has(x));
  const rem = [...a].filter((x) => !b.has(x));
  return add.length || rem.length ? { add, rem } : null;
}

/**
 * Hapus permanen tugas dari Sampah (owner). Jalur utama: Edge /x/admin/purge (web_purge sebagai user + hapus objek
 * Storage dengan service role). Edge belum terpasang → konfirmasi eksplisit, lalu web_purge langsung dengan peringatan
 * bahwa berkas tertinggal. Konfirmasi pertama dilakukan pemanggil. Mengembalikan hasil atau null (batal/galat).
 */
export async function hapusPermanen(taskId) {
  let r;
  try {
    r = await edgeAdmin('purge', { task_id: taskId });
  } catch (e) {
    if (e.hint !== 'EDGE_TIDAK_ADA') { toast(pesanGalat(e), 'galat', 6000); return null; }
    const lanjut = await konfirmasi('Layanan Edge untuk membersihkan berkas belum terpasang. Bila tetap dihapus, data tugas hilang '
      + 'tetapi berkas lampirannya tertinggal di Storage sampai dibersihkan admin. Lanjutkan?',
    { judul: 'Layanan Edge belum terpasang', ya: 'Tetap hapus', bahaya: true });
    if (!lanjut) return null;
    try {
      const x = await rpc('web_purge', { p_task: taskId });
      r = { ...x, storage_dihapus: [], storage_sisa: x.storage_paths || [], tanpaEdge: true };
    } catch (e2) { toast(pesanGalat(e2), 'galat', 6000); return null; }
  }
  const dihapus = (r.storage_dihapus || []).length;
  const sisa = r.storage_sisa || [];
  toast(`Dihapus permanen (${r.purged.length} tugas${dihapus ? `, ${dihapus} berkas` : ''})`, 'sukses', 3000);
  if (sisa.length) {
    console.warn('berkas lampiran tertinggal di Storage:', sisa);
    toast(r.tanpaEdge
      ? `${sisa.length} berkas lampiran tertinggal di Storage (Edge belum terpasang). Minta admin membersihkannya.`
      : `${sisa.length} berkas lampiran gagal dihapus dan tertinggal di Storage. Minta admin membersihkannya.`, 'galat', 8000);
  }
  return r;
}

/** Pemilih list (untuk pindah). Mengembalikan list terpilih atau null. */
export async function pilihList(kecualiId, judul = 'Pindah ke list') {
  const lists = (await semuaList()).filter((l) => l.id !== kecualiId);
  const cari = h('input', { type: 'search', placeholder: 'Saring nama list…', 'aria-label': 'Saring list' });
  const wadah = h('ul', { class: 'menu-daftar' });
  let api;
  const isi = () => {
    const q = cari.value.trim().toLowerCase();
    wadah.replaceChildren(...lists.filter((l) => !q || l.label.toLowerCase().includes(q)).map((l) =>
      h('li', {}, h('button', { type: 'button', onclick: () => api.tutup(l) },
        h('span', {}, h('div', { text: l.name }), h('div', { class: 'redup kecil', text: l.label }),
          sesi.cermin && l.sumber === 'clickup' ? h('div', { class: 'kecil', text: 'List ClickUp' }) : null)))));
  };
  cari.addEventListener('input', isi);
  isi();
  return lembar({ judul, isi: (a) => { api = a; return h('div', {}, h('label', { class: 'bidang' }, cari), wadah); } });
}

/** Peringatan tanggal non-blokir (akhir pekan / hari libur). */
export function peringatanTanggal(tgl) {
  if (!tgl) return null;
  const w = hariDalamMinggu(tgl);
  if (w === 0 || w === 6) return `Due jatuh hari ${NAMA_HARI[w]} (akhir pekan). Cek hari kerja dulu.`;
  if (sesi.libur.has(tgl)) return 'Due jatuh di hari libur.';
  return null;
}

/** Dialog buat tugas di list. Mengembalikan baris baru atau null. */
export async function dialogBuatTugas(list, { parentId = null, judul } = {}) {
  const statuses = [...(list.statuses || [])].sort((a, b) => a.orderindex - b.orderindex);
  const anggota = await anggotaAktif();
  const nama = h('input', { type: 'text', name: 'nama', required: true, maxlength: 500, autocomplete: 'off', placeholder: 'mis. Y7 · Ringkasan kampanye' });
  const desk = h('textarea', { name: 'deskripsi', placeholder: 'Deskripsi (markdown). Tulis juga cara cek & kapan dianggap selesai.' });
  const status = h('select', { name: 'status' }, statuses.map((s) => h('option', { value: s.status, text: s.status })));
  const due = h('input', { type: 'date', name: 'due' });
  const pesanDue = h('div', { class: 'kotak-peringatan kecil', hidden: true });
  due.addEventListener('change', () => { const p = peringatanTanggal(due.value); pesanDue.hidden = !p; pesanDue.textContent = p || ''; });
  const prio = h('select', { name: 'prioritas' }, h('option', { value: '', text: '— tanpa prioritas —' }),
    Object.entries(PRIORITAS).map(([k, v]) => h('option', { value: k, text: v.nama })));
  const dipilih = new Set();
  if (sesi.member && sesi.member.role !== 'bot') dipilih.add(Number(sesi.member.id));
  const daftarAssignee = h('ul', { class: 'pilihan-anggota' }, anggota.map((m) => h('li', {}, h('label', {},
    h('input', { type: 'checkbox', checked: dipilih.has(Number(m.id)), onchange: (e) => {
      if (e.target.checked) dipilih.add(Number(m.id)); else dipilih.delete(Number(m.id));
    } }), avatar(m), h('span', { text: m.username })))));
  const galat = h('div', { class: 'kotak-galat', hidden: true, role: 'alert' });

  return lembar({
    judul: judul || (parentId ? 'Sub-tugas baru' : `Tugas baru · ${list.name}`),
    isi: h('form', { onsubmit: (e) => e.preventDefault() },
      h('label', { class: 'bidang' }, h('span', { text: 'Nama tugas' }), nama),
      h('label', { class: 'bidang' }, h('span', { text: 'Deskripsi' }), desk),
      h('div', { class: 'filter' },
        h('label', { class: 'bidang' }, h('span', { text: 'Status' }), status),
        h('label', { class: 'bidang' }, h('span', { text: 'Prioritas' }), prio)),
      h('label', { class: 'bidang' }, h('span', { text: 'Due (tanggal WIB)' }), due),
      pesanDue,
      h('div', { class: 'bidang' }, h('span', { text: 'Assignee' }), daftarAssignee),
      galat),
    aksi: [
      { label: 'Batal', nilai: null },
      { label: 'Buat tugas', kelas: 'utama', klik: async () => {
        galat.hidden = true;
        if (!nama.value.trim()) { galat.textContent = 'Nama tugas wajib diisi.'; galat.hidden = false; nama.focus(); return false; }
        const body = { name: nama.value.trim(), status: status.value, assignees: [...dipilih] };
        if (desk.value.trim()) body.markdown = desk.value;
        if (due.value) body.due = due.value;
        if (prio.value) body.priority = Number(prio.value);
        if (parentId) body.parent_id = parentId;
        try {
          const baris = await rpc('web_buat_tugas', { p_list: list.id, p_body: body });
          toast('Tugas dibuat', 'sukses');
          return baris;
        } catch (e) {
          galat.textContent = pesanGalat(e);
          galat.hidden = false;
          return false;
        }
      } },
    ],
  });
}
