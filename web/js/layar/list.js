// List: daftar per status + Papan/Board kanban (SortableJS, tekan-tahan di HP; desktop ≥900px: lebar penuh). Filter di URL:
//   ?v=board · a=<member id>|saya|kosong · s=<status> · d=telat|hari_ini|tiga_hk|tanpa_due · selesai=1
import { rpc, pesanGalat } from '../api.js';
import { Sortable } from '../../vendor/muat.js';
import { sesi, anggotaAktif, semuaList, terkunci } from '../sesi.js';
import { h, kosongkan, toast, ikon, kategoriDue, statusPil } from '../util.js';
import { barisTugas, metaTugas, toggleSelesai, dialogBuatTugas } from '../komponen.js';

const DUE = [
  { v: '', label: 'Semua due' },
  { v: 'telat', label: 'Telat' },
  { v: 'hari_ini', label: 'Hari ini' },
  { v: 'tiga_hk', label: '≤3 hari kerja' },
  { v: 'tanpa_due', label: 'Tanpa due' },
];

export async function tampil(ctx) {
  const listId = ctx.params[0];
  const q = ctx.query;
  const mode = q.get('v') === 'board' ? 'board' : 'daftar';
  const f = { a: q.get('a') || '', s: q.get('s') || '', d: q.get('d') || '', selesai: q.get('selesai') === '1' };
  let data = null;
  let sortables = [];
  const peta = new Map();

  const remah = h('div', { class: 'remah' });
  const judul = h('span', { class: 'spasi' });
  const label = h('div', { class: 'baris-aksi' });
  const pemberitahuan = h('div');
  const pilihAssignee = h('select', { 'aria-label': 'Filter assignee', name: 'assignee' });
  const pilihStatus = h('select', { 'aria-label': 'Filter status', name: 'status' });
  const chipDue = h('div', { class: 'chip-baris', role: 'group', 'aria-label': 'Filter due' });
  const togSelesai = h('label', { class: 'centang kecil' },
    h('input', { type: 'checkbox', checked: f.selesai, name: 'selesai', onchange: (e) => { f.selesai = e.target.checked; simpanFilter(); muat(); } }),
    'Tampilkan selesai');
  const isi = h('div', { class: 'isi-list', 'aria-live': 'polite' }, h('p', { class: 'kosong', text: 'Memuat…' }));
  const segmen = h('div', { class: 'segmen', role: 'tablist', 'aria-label': 'Tampilan' });

  const isiFilter = [
    h('div', { class: 'filter' },
      h('label', {}, h('span', { class: 'sr', text: 'Assignee' }), pilihAssignee),
      h('label', {}, h('span', { class: 'sr', text: 'Status' }), pilihStatus)),
    chipDue, togSelesai];
  // Board di HP: filter dilipat supaya papan mulai tinggi di layar (dulu ±400 px filter di atas papan)
  const ringkasFilter = h('span', { class: 'redup kecil' });
  const wadahFilter = mode === 'board'
    ? h('details', { class: 'filter-lipat' }, h('summary', {}, h('span', { text: 'Filter' }), ringkasFilter), ...isiFilter)
    : h('div', {}, ...isiFilter);

  ctx.el.append(remah, h('div', { class: 'baris-aksi' }, judul, segmen), label, pemberitahuan, wadahFilter, isi);

  function urlDengan(ubah) {
    const u = new URLSearchParams();
    const g = { v: mode === 'board' ? 'board' : '', a: f.a, s: f.s, d: f.d, selesai: f.selesai ? '1' : '', ...ubah };
    for (const [k, v] of Object.entries(g)) if (v) u.set(k, v);
    const s = u.toString();
    return `/l/${encodeURIComponent(listId)}${s ? `?${s}` : ''}`;
  }
  const tabDaftar = h('a', { role: 'tab', 'aria-selected': mode === 'daftar' ? 'true' : 'false', 'data-uji': 'tab-daftar' }, 'Daftar');
  const tabBoard = h('a', { role: 'tab', 'aria-selected': mode === 'board' ? 'true' : 'false', 'data-uji': 'tab-board' }, 'Papan (Board)');
  segmen.append(tabDaftar, tabBoard);
  function perbaruiTab() {
    tabDaftar.href = urlDengan({ v: '' });
    tabBoard.href = urlDengan({ v: 'board' });
  }
  function perbaruiRingkas() {
    const n = [f.a, f.s, f.d, f.selesai].filter(Boolean).length;
    ringkasFilter.textContent = n ? `${n} aktif` : 'semua kartu';
  }
  function simpanFilter() {
    ctx.setQuery({ a: f.a, s: f.s, d: f.d, selesai: f.selesai ? '1' : '' });
    perbaruiTab();                      // pindah Daftar ↔ Board membawa filter terbaru
    perbaruiRingkas();
  }
  perbaruiTab();
  perbaruiRingkas();

  for (const d of DUE) {
    chipDue.append(h('button', { type: 'button', class: 'chip-pilih', 'data-due': d.v || 'semua', 'aria-pressed': f.d === d.v ? 'true' : 'false',
      onclick: (e) => {
        f.d = d.v;
        for (const b of chipDue.children) b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false');
        simpanFilter();
        gambar();
      } }, d.label));
  }
  pilihAssignee.addEventListener('change', () => { f.a = pilihAssignee.value; simpanFilter(); gambar(); });
  pilihStatus.addEventListener('change', () => { f.s = pilihStatus.value; simpanFilter(); gambar(); });

  // opsi assignee
  anggotaAktif().then((ang) => {
    pilihAssignee.replaceChildren(
      h('option', { value: '', text: 'Semua assignee' }),
      h('option', { value: 'saya', text: 'Saya' }),
      h('option', { value: 'kosong', text: 'Tanpa assignee' }),
      ...ang.map((m) => h('option', { value: String(m.id), text: m.username })));
    pilihAssignee.value = f.a;
  }).catch(() => {});

  semuaList(true).then((ls) => {
    const l = ls.find((x) => x.id === listId);
    if (!l) return;
    kosongkan(remah, h('a', { href: '/jelajah', text: l.space.name }),
      l.folder && !l.folder.hidden ? [h('span', { text: '›' }), h('span', { text: l.folder.name })] : null);
    ukurPapan();                        // remah terisi belakangan (bisa 2 baris) → posisi papan bergeser
  }).catch(() => {});

  const lolos = (t) => {
    const saya = Number(sesi.member.id);
    if (f.a === 'saya' && !t.assignees.some((x) => Number(x.id) === saya)) return false;
    if (f.a === 'kosong' && t.assignees.length) return false;
    if (f.a && f.a !== 'saya' && f.a !== 'kosong' && !t.assignees.some((x) => String(x.id) === f.a)) return false;
    if (f.s && t.status !== f.s) return false;
    if (f.d && kategoriDue(t, sesi.hariIni, sesi.libur) !== f.d) return false;
    return true;
  };

  async function muat() {
    try {
      data = await rpc('web_daftar', { p_list: listId, p_include_closed: mode === 'board' || f.selesai });
    } catch (e) {
      kosongkan(isi, h('div', { class: 'kotak-galat', role: 'alert' }, pesanGalat(e)));
      return;
    }
    if (!ctx.aktif()) return;
    peta.clear();
    for (const t of data.tasks) peta.set(t.id, t);
    ctx.judul(data.list.name);
    kosongkan(label,
      data.list.tidak_ditagih ? h('span', { class: 'chip garis', text: 'tidak ditagih' }) : null,
      data.list.archived ? h('span', { class: 'chip garis', text: 'list diarsip' }) : null);
    kosongkan(pemberitahuan, !data.list.boleh_ubah
      ? h('div', { class: 'kotak-cermin', 'data-uji': 'list-cermin' }, ikon('kunci'),
        ' List ClickUp: hanya-baca selama mode cermin. Ubah kartunya di ClickUp; perubahan masuk lewat sinkron.')
      : null);
    const statusSekarang = pilihStatus.value || f.s;
    pilihStatus.replaceChildren(h('option', { value: '', text: 'Semua status' }),
      ...data.list.statuses.map((s) => h('option', { value: s.status, text: s.status })));
    pilihStatus.value = statusSekarang;
    gambar();
  }

  /** Tinggi papan = sisa layar di bawah posisi papan sebenarnya (bukan konstanta), supaya kolom tidak tertutup nav bawah. */
  function ukurPapan() {
    if (mode !== 'board' || !ctx.aktif()) return;
    const p = isi.querySelector('.papan');
    if (!p) return;
    ctx.el.style.setProperty('--papan-atas', `${Math.round(p.getBoundingClientRect().top + window.scrollY)}px`);
  }

  function gambar() {
    if (!data) return;
    const papanLama = isi.querySelector('.papan');
    const gulirPapan = papanLama ? papanLama.scrollLeft : 0;   // muat ulang tidak melempar papan ke kolom pertama
    for (const s of sortables) s.destroy();
    sortables = [];
    const statuses = [...data.list.statuses].sort((a, b) => a.orderindex - b.orderindex);
    const tampak = data.tasks.filter(lolos);
    if (mode === 'daftar') {
      const grup = statuses.map((s) => ({ s, isi: tampak.filter((t) => t.status === s.status) })).filter((g) => g.isi.length);
      kosongkan(isi, grup.length ? grup.map((g) => h('details', { class: 'grup', open: true, 'data-status': g.s.status },
        h('summary', {}, statusPil(g.s.status, g.s.color), h('span', { class: 'jumlah', text: String(g.isi.length) })),
        h('ul', { class: 'daftar-tugas' }, g.isi.map((t) => barisTugas(t, { toggle: (x) => ubahSelesai(x), tampilStatus: false })))))
        : h('p', { class: 'kosong', text: data.tasks.length ? 'Tidak ada tugas yang cocok dengan filter.' : 'List ini belum punya tugas.' }));
    } else {
      const papan = h('div', { class: 'papan', 'data-uji': 'papan' });
      for (const s of statuses) {
        const selesaiType = s.type === 'closed' || s.type === 'done';
        const kartu = tampak.filter((t) => t.status === s.status);
        const disembunyikan = selesaiType && !f.selesai ? kartu.length : 0;
        const ul = h('ul', { class: 'kolom-isi', 'data-status': s.status, 'aria-label': `Kolom ${s.status}` },
          disembunyikan ? [] : kartu.map(kartuPapan));
        papan.append(h('section', { class: 'kolom', 'data-kolom': s.status },
          h('div', { class: 'kolom-kepala' }, h('span', { class: 'titik', vars: { '--warna': s.color } }),
            h('span', { class: 'spasi', text: s.status }), h('span', { class: 'jumlah redup', text: String(kartu.length) })),
          disembunyikan ? h('p', { class: 'redup kecil', text: `${disembunyikan} kartu selesai disembunyikan. Seret kartu ke sini untuk menandai selesai.` }) : null,
          ul));
        sortables.push(Sortable.create(ul, {
          group: 'papan', animation: 150, draggable: '.kartu-papan', filter: '.terkunci', preventOnFilter: false,
          delay: 300, delayOnTouchOnly: true, touchStartThreshold: 6, forceFallback: true, fallbackTolerance: 4,
          ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', scroll: true, bubbleScroll: true,
          // scroll-snap "mandatory" membatalkan auto-scroll kecil (scrollLeft += 10 → kembali ke snap) sehingga kolom di
          // luar layar tak terjangkau saat menyeret di HP → snap dimatikan selama seret, dinyalakan lagi sesudahnya.
          onStart: () => papan.classList.add('menyeret'),
          onEnd: (ev) => { papan.classList.remove('menyeret'); pindahKartu(ev); },
        }));
      }
      const petunjuk = window.matchMedia('(hover: hover) and (pointer: fine)').matches
        ? 'Seret kartu ke kolom lain untuk mengubah status.' : 'Tekan-tahan kartu, lalu geser ke kolom lain untuk mengubah status.';
      kosongkan(isi, h('p', { class: 'redup kecil petunjuk', text: petunjuk }), papan);
      if (gulirPapan) papan.scrollLeft = gulirPapan;
      ukurPapan();
    }
  }

  function kartuPapan(t) {
    const kunci = terkunci(t);
    return h('li', { class: `kartu-papan${kunci ? ' terkunci' : ''}`, 'data-id': t.id, 'aria-label': t.name },
      h('a', { href: `/t/${encodeURIComponent(t.id)}`, draggable: 'false' }, t.name),
      metaTugas(t, { tampilStatus: false }));
  }

  async function ubahSelesai(t) {
    try {
      await toggleSelesai(t, data.list.statuses);
      toast(t.selesai ? 'Tugas dibuka lagi' : 'Tugas ditandai selesai', 'sukses', 2000);
    } catch (e) {
      toast(e.konflik ? 'Tugas sudah diubah orang lain. Daftar dimuat ulang.' : pesanGalat(e), 'galat');
    }
    await muat();
  }

  function nilaiUrut(el) {
    const t = el && el.dataset && peta.get(el.dataset.id);
    return t && t.orderindex !== null && t.orderindex !== undefined ? Number(t.orderindex) : null;
  }

  async function pindahKartu(ev) {
    const id = ev.item.dataset.id;
    const dari = ev.from.dataset.status;
    const ke = ev.to.dataset.status;
    if (dari === ke && ev.oldIndex === ev.newIndex) return;
    const t = peta.get(id);
    if (!t) return;
    try {
      if (dari !== ke) {
        const baru = await rpc('web_ubah_tugas', { p_task: id, p_body: { status: ke }, p_versi: t.versi });
        Object.assign(t, baru);
      }
      const p = nilaiUrut(ev.item.previousElementSibling);
      const n = nilaiUrut(ev.item.nextElementSibling);
      let oi = null;
      if (p !== null && n !== null) oi = (p + n) / 2;
      else if (p !== null) oi = p + 1;
      else if (n !== null) oi = n - 1;
      if (oi !== null) {
        await rpc('web_urut', { p_task: id, p_orderindex: oi });
      } else if (dari === ke) {
        // belum ada orderindex di kolom ini → beri nomor urut ke kartu yang boleh diubah
        const kartu = [...ev.to.querySelectorAll('.kartu-papan:not(.terkunci)')];
        for (let i = 0; i < kartu.length; i++) await rpc('web_urut', { p_task: kartu[i].dataset.id, p_orderindex: (i + 1) * 1000 });
      }
      toast(dari !== ke ? `Status: ${ke}` : 'Urutan disimpan', 'sukses', 1800);
    } catch (e) {
      toast(e.konflik ? 'Kartu sudah diubah orang lain. Papan dimuat ulang.' : pesanGalat(e), 'galat', 5000);
    }
    await muat();
  }

  const saatUkuran = () => ukurPapan();
  if (mode === 'board') {
    ctx.el.classList.add('mode-board');
    ctx.lebar(true);                     // desktop: papan memakai lebar layar (CSS ≥900px); HP tidak berubah
    window.addEventListener('resize', saatUkuran);
    wadahFilter.addEventListener('toggle', saatUkuran);
  }
  await muat();

  // FAB buat tugas (hanya bila list boleh diubah)
  let fab = null;
  if (data && data.list.boleh_ubah && !data.list.archived) {
    fab = h('button', { type: 'button', class: 'fab', 'data-uji': 'buat-tugas', onclick: async () => {
      const baru = await dialogBuatTugas(data.list);
      if (baru && baru.id) ctx.navigasi(`/t/${encodeURIComponent(baru.id)}`);
    } }, ikon('tambah'), 'Tugas');
    document.body.appendChild(fab);
    document.body.classList.add('ada-fab');
  }
  return () => {
    for (const s of sortables) s.destroy();
    window.removeEventListener('resize', saatUkuran);
    if (fab) { fab.remove(); document.body.classList.remove('ada-fab'); }
  };
}
