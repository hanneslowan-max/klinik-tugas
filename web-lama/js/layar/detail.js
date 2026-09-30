// Detail tugas (web_detail): field, deskripsi markdown (lihat/edit/pratinjau), sub-tugas, lampiran (Storage signed URL),
// komentar + balasan + @mention, tab Riwayat, peringatan B5/akhir pekan/libur, mode cermin, Sampah.
import { rpc, pesanGalat, unggahLampiran, urlLampiran, ACCEPT, KONFIG } from '../api.js';
import { sesi } from '../sesi.js';
import { renderMarkdown } from '../md.js';
import {
  h, kosongkan, ikon, avatar, toast, lembar, konfirmasi, salinTeks, statusPil, fmtTanggal, fmtWaktu, fmtRelatif,
  fmtJamWib, fmtWaktuPanjang, ukuranBerkas, urlAman, teksBertautan, PRIORITAS, NAMA_HARI, hariDalamMinggu, chipDue,
} from '../util.js';
import {
  daftarTugas, pilihAnggota, pilihList, dialogBuatTugas, peringatanTanggal, selisihAssignee, hapusPermanen,
} from '../komponen.js';
import { penyusun } from '../penyusun.js';

const tautanTugas = (id) => `${(KONFIG.APP_BASE_URL || location.origin).replace(/\/$/, '')}/t/${encodeURIComponent(id)}`;
const NAMA_SUMBER = { ui: 'web', api: 'API/agent', impor: 'impor', sinkron: 'sinkron', sistem: 'sistem' };

export async function tampil(ctx) {
  const id = ctx.params[0];
  let d = null;
  let tab = ctx.hash.startsWith('#c-') ? 'komentar' : (ctx.query.get('tab') === 'riwayat' ? 'riwayat' : 'komentar');
  let modeDesk = 'lihat';
  let drafDesk = null;
  let balasKe = null;         // id komentar yang sedang dibalas
  let editKomentar = null;    // id komentar yang sedang diedit
  const urlCache = new Map(); // path|unduh → {url, t}
  let sudahSorot = false;
  let sedangRender = false;   // blur akibat elemen dibuang saat render ulang bukan tanda "selesai mengetik"

  const wadah = h('div', { class: 'detail', 'aria-busy': 'true' }, h('p', { class: 'kosong', text: 'Memuat…' }));
  ctx.el.append(wadah);

  async function muat() {
    d = await rpc('web_detail', { p_task: id });
    wadah.removeAttribute('aria-busy');
    gambar();
  }

  const bolehUbah = () => !!(d && d.boleh.ubah);
  const saya = () => Number(sesi.member.id);

  async function ubah(body, pesan) {
    try {
      await rpc('web_ubah_tugas', { p_task: id, p_body: body, p_versi: d.task.versi });
      if (pesan) toast(pesan, 'sukses', 1800);
    } catch (e) {
      toast(e.konflik ? 'Tugas sudah diubah orang lain. Data dimuat ulang.' : pesanGalat(e), 'galat', 5000);
      await muat();
      return false;
    }
    await muat();
    if (!d.task.selesai && d.peringatan.beban_lebih.length && ('assignees' in body || 'due' in body)) {
      toast(`Peringatan B5: ${d.peringatan.beban_lebih.join(', ')} punya lebih dari 7 kartu due pada ${fmtTanggal(d.task.due_wib, sesi.hariIni)}.`, '', 7000);
    }
    return true;
  }

  async function aksi(nama, args, pesan) {
    try {
      const r = await rpc(nama, args);
      if (pesan) toast(pesan, 'sukses', 2000);
      return r;
    } catch (e) {
      toast(pesanGalat(e), 'galat', 5000);
      return null;
    }
  }

  /**
   * Simpan field (select / input tanggal) hanya saat nilainya DIKOMIT:
   *  - pilihan lewat pointer / picker bawaan (change tanpa ketikan) → langsung disimpan;
   *  - perubahan lewat keyboard (panah, angka, huruf, Backspace) → ditunda sampai Enter atau fokus keluar (blur),
   *    dengan tanda "belum disimpan"; Esc mengembalikan nilai tersimpan.
   * Dengan begitu ketikan tanggal setengah jadi (mis. digit pertama bulan) atau satu kali ArrowDown di select tidak
   * langsung tersimpan lalu merender ulang layar di tengah ketikan.
   */
  function simpanSaatKomit(el, { asli, simpan, cek = null, uji }) {
    let ketik = false;
    let sibuk = false;
    const tanda = h('span', { class: 'belum-simpan', hidden: true, role: 'status', 'data-uji': `${uji}-belum-simpan` },
      'Belum disimpan · Enter simpan, Esc batal');
    const kotor = () => el.value !== asli;
    const perbarui = () => { tanda.hidden = !kotor(); };
    const kembalikan = () => { el.value = asli; ketik = false; perbarui(); };
    async function komit() {
      const dariKetik = ketik;
      ketik = false;
      if (sibuk) return;
      if (!kotor()) { if (el.validity && el.validity.badInput) el.value = asli; perbarui(); return; }
      const alasan = cek ? cek(el, dariKetik) : null;
      if (alasan) { toast(alasan, 'galat', 5000); kembalikan(); return; }
      sibuk = true;
      try { await simpan(el.value); } finally { sibuk = false; }
    }
    el.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); komit(); return; }
      if (e.key === 'Escape') { if (kotor() || ketik) { e.preventDefault(); kembalikan(); } return; }
      // tombol yang hanya berpindah fokus / membuka picker bukan "mengetik"
      if (['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', ' ', 'F4'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
      ketik = true;
    });
    el.addEventListener('input', () => { if (ketik) perbarui(); });
    el.addEventListener('change', () => { if (ketik) perbarui(); else komit(); });
    el.addEventListener('blur', () => { if (!sedangRender && el.isConnected && (kotor() || ketik)) komit(); });
    return tanda;
  }

  /** Tanggal hasil ketikan harus lengkap & wajar; hapus tanggal lewat tombol × (atau tombol hapus picker). */
  function cekTanggal(el, dariKetik) {
    if (el.validity && el.validity.badInput) return 'Tanggal belum lengkap, tidak disimpan.';
    if (!el.value) return dariKetik ? 'Tanggal belum lengkap, tidak disimpan. Pakai tombol × untuk menghapus tanggal.' : null;
    const th = Number(el.value.slice(0, 4));
    if (th < 2000 || th > 2099) return `Tahun ${th} tidak wajar, tanggal tidak disimpan.`;
    return null;
  }

  // ------------------------------------------------------------------ render
  function gambar() {
    if (!ctx.aktif()) return;                // pengguna sudah pindah layar
    const t = d.task;
    ctx.judul(t.name);
    const hi = sesi.hariIni;
    const gulir = window.scrollY;            // render ulang tidak boleh melempar layar ke atas
    // render ulang tidak boleh membuang fokus: kontrol yang sedang fokus dicari lagi lewat data-fokus
    const aktif = document.activeElement;
    const kunciFokus = aktif && aktif !== wadah && wadah.contains(aktif) && aktif.dataset ? aktif.dataset.fokus : null;
    wadah.style.minHeight = `${wadah.offsetHeight}px`;
    sedangRender = true;
    try {
      kosongkan(wadah,
        h('div', { class: 'remah' },
          t.space ? h('span', { text: t.space.name }) : null,
          t.folder && !t.folder.hidden ? [h('span', { text: '›' }), h('span', { text: t.folder.name })] : null,
          h('span', { text: '›' }), h('a', { href: `/l/${encodeURIComponent(t.list.id)}`, text: t.list.name })),
        spanduk(t),
        h('div', { class: 'detail-kepala' },
          judulTugas(t),
          h('div', { class: 'id-baris' },
            h('code', { title: 'ID tugas', 'data-uji': 'id-tugas' }, t.id),
            t.clickup_id && t.clickup_id !== t.id ? h('code', { title: 'ID ClickUp lama' }, t.clickup_id) : null,
            t.sumber === 'clickup' ? h('span', { class: `chip ${d.boleh.cermin ? 'cermin' : 'garis'}` }, d.boleh.cermin ? ikon('kunci') : null, 'dari ClickUp') : null,
            t.menunggu_keputusan ? h('span', { class: 'chip info', text: 'menunggu keputusan' }) : null,
            h('span', { class: 'spasi' }),
            h('button', { type: 'button', class: 'tombol kecil', 'aria-label': 'Salin tautan', 'data-fokus': 'tautan', onclick: () => salinTeks(tautanTugas(t.id)) }, ikon('salin'), 'Tautan'),
            h('button', { type: 'button', class: 'tombol kecil', 'aria-label': 'Aksi lain', 'data-uji': 'menu-tugas', 'data-fokus': 'menu', onclick: menuTugas }, ikon('titik3')))),
        kotakPeringatan(t),
        h('section', { class: 'kartu kolom-field', 'aria-label': 'Field tugas' },
          fieldStatus(t), fieldAssignee(), fieldDue(t, hi), fieldMulai(t, hi), fieldPrioritas(t),
          d.parent ? baris('Induk', h('a', { class: 'tautan-sentuh', href: `/t/${encodeURIComponent(d.parent.id)}` }, d.parent.name, d.parent.deleted ? ' (di Sampah)' : '')) : null,
          fieldTag(t),
          baris('Dibuat', h('span', { class: 'kecil' }, `${fmtWaktu(t.created_at)}${t.creator ? ` · ${t.creator.username}` : ''}`)),
          baris('Diubah', h('span', { class: 'kecil', text: fmtWaktu(t.updated_at) })),
          t.closed_at ? baris('Ditutup', h('span', { class: 'kecil', text: `${fmtWaktu(t.closed_at)}${t.reopen_count ? ` · dibuka ulang ${t.reopen_count}×` : ''}` })) : null),
        bagianDeskripsi(t),
        bagianChecklist(t),
        bagianSubtugas(t),
        bagianLampiran(),
        bagianTab());
    } finally { sedangRender = false; }
    wadah.style.minHeight = '';
    window.scrollTo(0, gulir);
    if (kunciFokus) {
      const el = wadah.querySelector(`[data-fokus="${CSS.escape(kunciFokus)}"]`);
      if (el) el.focus({ preventScroll: true });
    }
    if (!sudahSorot && ctx.hash.startsWith('#c-')) {
      sudahSorot = true;
      const el = document.getElementById(ctx.hash.slice(1));
      if (el) { el.classList.add('sorot'); el.scrollIntoView({ block: 'center' }); }
    }
  }

  function baris(label, nilai) {
    return h('div', { class: 'field' }, h('div', { class: 'label', text: label }), h('div', { class: 'nilai' }, nilai));
  }

  function spanduk(t) {
    return [
      d.boleh.cermin ? h('div', { class: 'kotak-cermin', 'data-uji': 'spanduk-cermin', role: 'note' }, ikon('kunci'),
        ' Mode cermin: kartu ini dari ClickUp dan hanya-baca sampai cutover. Ubah status, komentar, dan lampiran di ClickUp.') : null,
      t.deleted_at ? h('div', { class: 'kotak-peringatan', 'data-uji': 'spanduk-sampah' },
        `Tugas ini ada di Sampah sejak ${fmtWaktu(t.deleted_at)}${t.deleted_by ? ` (oleh ${t.deleted_by.username})` : ''}.`,
        sesi.owner ? h('div', { class: 'baris-aksi' },
          h('button', { type: 'button', class: 'tombol kecil', onclick: pulihkan }, 'Pulihkan'),
          h('button', { type: 'button', class: 'tombol kecil bahaya', onclick: purge }, 'Hapus permanen')) : null) : null,
      t.archived ? h('div', { class: 'kotak-info' }, `Tugas diarsipkan${t.archived_at ? ` ${fmtWaktu(t.archived_at)}` : ''}.`) : null,
    ];
  }

  function judulTugas(t) {
    if (!bolehUbah()) return h('div', { class: 'detail-judul', 'data-uji': 'judul-tugas' }, t.name);
    const tombol = h('button', { type: 'button', class: 'detail-judul detail-judul-tombol', 'data-uji': 'judul-tugas', 'data-fokus': 'judul', title: 'Ketuk untuk mengubah nama',
      onclick: () => {
        const input = h('input', { type: 'text', value: t.name, 'aria-label': 'Nama tugas', maxlength: 500 });
        const simpan = async () => {
          const v = input.value.trim();
          if (!v || v === t.name) { gambar(); return; }
          await ubah({ name: v }, 'Nama disimpan');
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { input.value = t.name; input.blur(); } });
        input.addEventListener('blur', simpan, { once: true });
        tombol.replaceWith(input);
        input.focus();
        input.select();
      } }, t.name);
    return tombol;
  }

  function kotakPeringatan(t) {
    if (t.selesai || t.deleted_at) return null;
    const p = d.peringatan;
    const isi = [];
    if (p.beban_lebih && p.beban_lebih.length) {
      isi.push(`B5: ${p.beban_lebih.join(', ')} sudah punya lebih dari 7 kartu due pada ${fmtTanggal(t.due_wib, sesi.hariIni)}. Pertimbangkan geser kartu prioritas terendah.`);
    }
    if (p.due_akhir_pekan) isi.push(`Due jatuh hari ${NAMA_HARI[hariDalamMinggu(t.due_wib)]} (akhir pekan). Cek hari kerja dulu.`);
    if (p.due_libur) isi.push(`Due jatuh di hari libur: ${p.due_libur}.`);
    if (!isi.length) return null;
    return h('div', { class: 'kotak-peringatan', role: 'note', 'data-uji': 'peringatan' }, h('strong', { text: 'Peringatan' }),
      h('ul', {}, isi.map((x) => h('li', { text: x }))));
  }

  function fieldStatus(t) {
    const warna = (t.statuses.find((s) => s.status === t.status) || {}).color;
    if (!bolehUbah()) return baris('Status', statusPil(t.status, warna));
    const sel = h('select', { 'aria-label': 'Status', 'data-uji': 'pilih-status', 'data-fokus': 'status' },
      t.statuses.map((s) => h('option', { value: s.status, selected: s.status === t.status, text: s.status })));
    const tanda = simpanSaatKomit(sel, { asli: t.status, uji: 'status', simpan: (v) => ubah({ status: v }, `Status: ${v}`) });
    return baris('Status', [h('span', { class: 'titik', vars: { '--warna': warna } }), sel, tanda]);
  }

  function fieldAssignee() {
    const isi = d.assignees.length ? d.assignees.map((a) => h('span', { class: `assignee-chip${a.beban_lebih ? ' lebih' : ''}`,
      title: a.beban !== null && a.beban !== undefined ? `${a.beban} kartu due di tanggal ini` : '' },
    avatar(a), a.username, a.beban_lebih ? ` · ${a.beban} due` : '', a.aktif === false ? ' (nonaktif)' : ''))
      : [h('span', { class: 'redup', text: 'Belum ada' })];
    return baris('Assignee', [...isi, bolehUbah() ? h('button', { type: 'button', class: 'tombol kecil', 'data-uji': 'ubah-assignee', 'data-fokus': 'assignee', onclick: async () => {
      // dialog menampilkan juga assignee nonaktif (bisa dilepas); yang dikirim hanya selisihnya ({add, rem}) supaya
      // eks-anggota yang tetap terpasang tidak membuat simpan gagal "Assignee tidak dikenal"
      const ids = await pilihAnggota(d.assignees);
      const beda = ids && selisihAssignee(d.assignees.map((a) => a.id), ids);
      if (beda) await ubah({ assignees: beda }, 'Assignee disimpan');
    } }, 'Ubah') : null]);
  }

  function fieldTanggal(label, nilaiWib, adaJam, iso, kunci, hi, uji, chip) {
    const teks = nilaiWib ? `${fmtTanggal(nilaiWib, hi)}${adaJam && iso ? ` ${fmtJamWib(iso)}` : ''}` : 'Tanpa tanggal';
    if (!bolehUbah()) return baris(label, chip || h('span', { text: teks }));
    const kunciUji = kunci === 'due' ? 'due' : 'mulai';
    const input = h('input', { type: 'date', value: nilaiWib || '', 'aria-label': label, 'data-uji': uji, 'data-fokus': kunciUji });
    const tanda = simpanSaatKomit(input, {
      asli: nilaiWib || '',
      uji: kunciUji,
      cek: cekTanggal,
      simpan: (v) => {
        if (kunci === 'due') {
          const p = peringatanTanggal(v);
          if (p) toast(p, '', 5000);
        }
        return ubah({ [kunci]: v || null }, v ? `${label} disimpan` : `${label} dihapus`);
      },
    });
    return baris(label, [
      chip || (nilaiWib ? h('span', { class: 'chip', text: teks }) : null),
      h('span', { class: 'baris-input' }, input,
        nilaiWib ? h('button', { type: 'button', class: 'tombol kecil polos', 'aria-label': `Hapus ${label.toLowerCase()}`, 'data-fokus': `hapus-${kunciUji}`,
          onclick: () => ubah({ [kunci]: null }, `${label} dihapus`) }, ikon('tutup')) : null),
      tanda]);
  }
  const fieldDue = (t, hi) => fieldTanggal('Due', t.due_wib, t.due_has_time, t.due_at, 'due', hi, 'input-due',
    t.due_wib ? chipDue(t, hi, sesi.libur) : h('span', { class: 'redup', text: 'Tanpa due (parkir)' }));
  const fieldMulai = (t, hi) => (t.start_at || bolehUbah()
    ? fieldTanggal('Mulai', t.start_at ? tanggalMulai(t) : null, t.start_has_time, t.start_at, 'start_date', hi, 'input-mulai') : null);
  function tanggalMulai(t) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t.start_at));
  }

  function fieldPrioritas(t) {
    if (!bolehUbah()) return baris('Prioritas', t.priority ? h('span', { text: PRIORITAS[t.priority].nama }) : h('span', { class: 'redup', text: '—' }));
    const sel = h('select', { 'aria-label': 'Prioritas', 'data-fokus': 'prioritas' }, h('option', { value: '', text: '— tanpa —' }),
      Object.entries(PRIORITAS).map(([k, v]) => h('option', { value: k, selected: Number(k) === t.priority, text: v.nama })));
    const tanda = simpanSaatKomit(sel, { asli: t.priority ? String(t.priority) : '', uji: 'prioritas',
      simpan: (v) => ubah({ priority: v ? Number(v) : null }, 'Prioritas disimpan') });
    return baris('Prioritas', [sel, tanda]);
  }

  // ------------------------------------------------------------------ tag & checklist (kartu ClickUp, hanya-baca)
  // Diimpor verbatim ke tasks.extra (perbaikan P1/PR-1: bentuk ClickUp). Aplikasi belum bisa mengubahnya → chip saja.
  const warnaAman = (w) => (typeof w === 'string' && /^#[0-9a-f]{3,8}$/i.test(w) ? w : null);
  const daftarExtra = (t, k) => (t.extra && Array.isArray(t.extra[k]) ? t.extra[k] : []);

  function fieldTag(t) {
    const tags = daftarExtra(t, 'tags').filter((x) => x && x.name);
    if (!tags.length) return null;
    return baris('Label', h('span', { class: 'nilai-tag', 'data-uji': 'tag-tugas' }, tags.map((x) => h('span', {
      class: 'chip tag', vars: { '--warna': warnaAman(x.tag_bg) }, title: 'Label dari ClickUp (hanya-baca)' }, x.name))));
  }

  function butirChecklist(items) {
    const urut = [...items].filter(Boolean).sort((a, b) => (Number(a.orderindex) || 0) - (Number(b.orderindex) || 0));
    return h('ul', { class: 'checklist-butir' }, urut.map((it) => h('li', {},
      h('span', { class: `chip butir${it.resolved ? ' beres' : ''}`, 'data-beres': it.resolved ? '1' : '0' },
        h('span', { class: 'sr', text: it.resolved ? 'Selesai: ' : 'Belum: ' }),
        it.resolved ? ikon('centang') : h('span', { 'aria-hidden': 'true', text: '○' }),
        h('span', { class: 'teks-butir', text: it.name || '(tanpa nama)' })),
      Array.isArray(it.children) && it.children.length ? butirChecklist(it.children) : null)));
  }

  function bagianChecklist(t) {
    const cls = daftarExtra(t, 'checklists').filter((c) => c && Array.isArray(c.items));
    if (!cls.length) return null;
    const hitung = (items) => items.reduce((n, it) => {
      const anak = Array.isArray(it.children) ? hitung(it.children) : [0, 0];
      return [n[0] + (it.resolved ? 1 : 0) + anak[0], n[1] + 1 + anak[1]];
    }, [0, 0]);
    return h('section', { 'aria-label': 'Checklist', 'data-uji': 'checklist' },
      h('h3', { text: 'Checklist' }),
      h('p', { class: 'redup kecil', text: 'Dari ClickUp, hanya-baca. Centang di ClickUp; perubahan masuk lewat sinkron.' }),
      cls.map((c) => {
        const [beres, total] = hitung(c.items);
        return h('div', { class: 'checklist' },
          h('div', { class: 'checklist-kepala' }, h('span', { text: c.name || 'Checklist' }), h('span', { class: 'chip garis', text: `${beres}/${total}` })),
          c.items.length ? butirChecklist(c.items) : h('p', { class: 'redup kecil', text: 'Belum ada butir.' }));
      }));
  }

  // ------------------------------------------------------------------ deskripsi
  function bagianDeskripsi(t) {
    const isiMd = t.markdown || '';
    const kepala = h('div', { class: 'baris-aksi' }, h('h3', { class: 'spasi', text: 'Deskripsi' }));
    const badan = h('div');
    if (bolehUbah()) {
      const seg = h('div', { class: 'segmen', role: 'tablist', 'aria-label': 'Mode deskripsi' });
      for (const [k, label] of [['lihat', 'Lihat'], ['edit', 'Ubah'], ['pratinjau', 'Pratinjau']]) {
        seg.append(h('button', { type: 'button', role: 'tab', 'aria-selected': modeDesk === k ? 'true' : 'false', 'data-uji': `desk-${k}`, 'data-fokus': `desk-${k}`,
          onclick: () => {
            if (k !== 'lihat' && drafDesk === null) drafDesk = t.desc_unreadable ? (t.description_plain || isiMd) : isiMd;
            modeDesk = k;
            gambar();
          } }, label));
      }
      kepala.append(seg);
    }
    if (modeDesk === 'edit' && bolehUbah()) {
      const ta = h('textarea', { class: 'mono', 'aria-label': 'Deskripsi (markdown)', 'data-uji': 'desk-teks', value: drafDesk ?? '' });
      ta.addEventListener('input', () => { drafDesk = ta.value; });
      badan.append(h('div', { class: 'editor-md' }, ta,
        h('p', { class: 'redup kecil', text: 'Markdown: **tebal**, _miring_, - daftar, [teks](https://…). HTML tidak dirender.' })),
      tombolSimpanDesk(isiMd));
      setTimeout(() => ta.focus(), 0);
    } else if (modeDesk === 'pratinjau' && bolehUbah()) {
      const pr = h('div', { class: 'kartu md', 'data-uji': 'desk-pratinjau' });
      renderMarkdown(pr, drafDesk || '');
      badan.append(pr, tombolSimpanDesk(isiMd));
    } else {
      if (t.desc_unreadable) {
        badan.append(h('div', { class: 'kotak-info', 'data-uji': 'desk-tak-terbaca' }, 'Isi deskripsi tak terbaca dari ClickUp (blok sinkron). Teks polos:'),
          h('div', { class: 'kartu komentar-teks', text: t.description_plain || '(kosong)' }));
      } else if (isiMd.trim()) {
        const el = h('div', { class: 'kartu md', 'data-uji': 'desk-render' });
        renderMarkdown(el, isiMd);
        badan.append(el);
      } else {
        badan.append(h('p', { class: 'md-kosong', text: 'Belum ada deskripsi.' }));
      }
    }
    return h('section', { 'aria-label': 'Deskripsi' }, kepala, badan);
  }

  function tombolSimpanDesk(asli) {
    return h('div', { class: 'baris-aksi kanan' },
      h('button', { type: 'button', class: 'tombol kecil', onclick: () => { drafDesk = null; modeDesk = 'lihat'; gambar(); } }, 'Batal'),
      h('button', { type: 'button', class: 'tombol utama kecil', 'data-uji': 'desk-simpan', onclick: async () => {
        const v = drafDesk ?? '';
        if (v === asli) { drafDesk = null; modeDesk = 'lihat'; gambar(); return; }
        const ok = await ubah({ markdown_description: v }, 'Deskripsi disimpan');
        if (ok) { drafDesk = null; modeDesk = 'lihat'; gambar(); }
      } }, 'Simpan'));
  }

  // ------------------------------------------------------------------ sub-tugas
  function bagianSubtugas(t) {
    if (!d.subtasks.length && !bolehUbah()) return null;
    return h('section', { 'aria-label': 'Sub-tugas' },
      h('div', { class: 'baris-aksi' }, h('h3', { class: 'spasi', text: `Sub-tugas (${d.subtasks.length})` }),
        bolehUbah() && !t.parent_id ? h('button', { type: 'button', class: 'tombol kecil', onclick: async () => {
          const baru = await dialogBuatTugas({ id: t.list.id, name: t.list.name, statuses: t.statuses }, { parentId: t.id });
          if (baru) await muat();
        } }, ikon('tambah'), 'Sub-tugas') : null),
      d.subtasks.length ? daftarTugas(d.subtasks, {}) : null);
  }

  // ------------------------------------------------------------------ lampiran
  async function urlSegar(a, unduh) {
    const k = `${a.storage_path}|${unduh ? 1 : 0}`;
    const c = urlCache.get(k);
    if (c && Date.now() - c.t < 50 * 60 * 1000) return c.url;
    const url = await urlLampiran(a.storage_path, a.title, unduh);
    urlCache.set(k, { url, t: Date.now() });
    return url;
  }

  function nodeLampiran(a) {
    const gambarKah = /^image\//.test(a.mimetype || '');
    const jenis = h('span', { class: 'jenis', text: (a.extension || '?').slice(0, 4) });
    const unduh = a.storage_path
      ? h('a', { class: 'tombol kecil', href: '#', target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Unduh ${a.title}`, 'data-uji': 'unduh-lampiran' }, ikon('unduh'), 'Unduh')
      : null;
    if (unduh) {
      urlSegar(a, true).then((u) => { unduh.href = u; }).catch(() => {});
      unduh.addEventListener('click', async (e) => {
        const c = urlCache.get(`${a.storage_path}|1`);
        if (c && Date.now() - c.t < 50 * 60 * 1000) return;   // href masih segar
        e.preventDefault();
        try { location.assign(await urlSegar(a, true)); } catch (err) { toast(pesanGalat(err), 'galat'); }
      });
      if (gambarKah) {
        urlSegar(a, false).then((u) => { jenis.replaceChildren(h('img', { src: u, alt: '', loading: 'lazy' })); }).catch(() => {});
      }
    }
    const tautanCu = !a.storage_path && urlAman(a.clickup_url)
      ? h('a', { class: 'tombol kecil', href: urlAman(a.clickup_url), target: '_blank', rel: 'noopener noreferrer', 'data-luar': '' }, 'Tautan ClickUp')
      : null;
    const bolehHapus = bolehUbah() && (sesi.owner || (a.uploaded_by && Number(a.uploaded_by.id) === saya()));
    return h('li', { class: 'lampiran', 'data-lampiran': a.id },
      jenis,
      h('div', { class: 'info' },
        h('div', { class: 'judul', text: a.title || '(tanpa nama)' }),
        h('div', { class: 'sub' }, [ukuranBerkas(a.size), a.uploaded_by ? a.uploaded_by.username : null, fmtRelatif(a.created_at, sesi.hariIni),
          a.comment_id ? 'di komentar' : null,
          a.status_salin === 'gagal' ? 'gagal disalin dari ClickUp' : a.status_salin === 'tautan_saja' ? 'belum disalin (tautan ClickUp)' : null]
          .filter(Boolean).join(' · '))),
      unduh, tautanCu,
      bolehHapus ? h('button', { type: 'button', class: 'tombol kecil polos', 'aria-label': `Hapus lampiran ${a.title}`, onclick: async () => {
        if (!await konfirmasi(`Hapus lampiran "${a.title}"?`, { ya: 'Hapus', bahaya: true })) return;
        if (await aksi('web_lampiran_hapus', { p_id: a.id }, 'Lampiran dihapus')) await muat();
      } }, ikon('hapus')) : null);
  }

  function bagianLampiran() {
    const inputBerkas = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true, 'data-uji': 'input-lampiran' });
    inputBerkas.addEventListener('change', async () => {
      const files = [...inputBerkas.files];
      inputBerkas.value = '';
      let ok = 0;
      for (const f of files) {
        const tt = toast(`Mengunggah ${f.name}…`, '', 60000);
        try { await unggahLampiran(id, f); ok++; } catch (e) { toast(pesanGalat(e), 'galat', 6000); } finally { tt.remove(); }
      }
      if (ok) { toast(`${ok} lampiran terunggah`, 'sukses'); await muat(); }
    });
    const lampiranTugas = d.lampiran.filter((a) => !a.comment_id);
    return h('section', { 'aria-label': 'Lampiran' },
      h('div', { class: 'baris-aksi' }, h('h3', { class: 'spasi', text: `Lampiran (${d.lampiran.length})` }),
        bolehUbah() ? h('button', { type: 'button', class: 'tombol kecil', 'data-uji': 'tambah-lampiran', 'data-fokus': 'tambah-lampiran', onclick: () => inputBerkas.click() }, ikon('lampiran'), 'Tambah') : null,
        inputBerkas),
      lampiranTugas.length ? h('ul', { class: 'lampiran-daftar' }, lampiranTugas.map(nodeLampiran))
        : h('p', { class: 'redup kecil', text: d.lampiran.length ? 'Lampiran lain ada di komentar.' : 'Belum ada lampiran.' }));
  }

  // ------------------------------------------------------------------ komentar & riwayat
  function bagianTab() {
    const jmlKomentar = d.komentar.reduce((n, c) => n + (c.dihapus ? 0 : 1) + c.balasan.filter((b) => !b.dihapus).length, 0);
    const tombol = (k, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', 'data-uji': `tab-${k}`, 'data-fokus': `tab-${k}`,
      onclick: () => { tab = k; ctx.setQuery({ tab: k === 'riwayat' ? 'riwayat' : '' }); gambar(); } }, label);
    return h('section', {},
      h('div', { class: 'tab-baris', role: 'tablist' }, tombol('komentar', `Komentar (${jmlKomentar})`), tombol('riwayat', `Riwayat (${d.activity.length})`)),
      tab === 'riwayat' ? bagianRiwayat() : bagianKomentar());
  }

  function partsKeNode(c) {
    const frag = document.createDocumentFragment();
    const parts = Array.isArray(c.body_json) && c.body_json.length ? c.body_json : [{ text: c.text || '' }];
    for (const p of parts) {
      if (p && p.type === 'tag' && p.user) frag.append(h('span', { class: 'mention', 'data-member': p.user.id }, `@${p.user.username}`));
      else if (p && typeof p.text === 'string') frag.append(teksBertautan(p.text));
    }
    return frag;
  }

  const bolehKomentar = () => bolehUbah();

  function nodeKomentar(c, balasan) {
    const penulis = c.author && Number(c.author.id) === saya();
    const aksiKomentar = [];
    if (!c.dihapus && bolehKomentar()) {
      if (!balasan) aksiKomentar.push(h('button', { type: 'button', class: 'tombol polos', 'data-uji': 'balas', onclick: () => { balasKe = c.id; editKomentar = null; gambar(); fokusPenyusun(`balas-${c.id}`); } }, 'Balas'));
      if (penulis) aksiKomentar.push(h('button', { type: 'button', class: 'tombol polos', onclick: () => { editKomentar = c.id; balasKe = null; gambar(); fokusPenyusun(`edit-${c.id}`); } }, 'Ubah'));
      if (penulis || sesi.owner) {
        aksiKomentar.push(h('button', { type: 'button', class: 'tombol polos', onclick: async () => {
          if (!await konfirmasi('Hapus komentar ini?', { ya: 'Hapus', bahaya: true })) return;
          if (await aksi('web_komentar_hapus', { p_comment: c.id }, 'Komentar dihapus')) await muat();
        } }, 'Hapus'));
      }
    }
    const teks = c.dihapus ? h('div', { class: 'komentar-teks dihapus', text: 'Komentar dihapus.' })
      : editKomentar === c.id ? penyusun({ teksAwal: c.text, labelKirim: 'Simpan', placeholder: 'Ubah komentar', batal: () => { editKomentar = null; gambar(); },
        kirim: async (teksBaru) => {
          const r = await aksi('web_komentar_edit', { p_comment: c.id, p_teks: teksBaru }, 'Komentar disimpan');
          if (!r) return false;
          editKomentar = null;
          await muat();
          return true;
        } })
        : h('div', { class: 'komentar-teks' }, partsKeNode(c));
    if (teks.classList && teks.classList.contains('penyusun')) teks.dataset.penyusun = `edit-${c.id}`;
    return h('li', { class: 'komentar', id: `c-${c.id}`, 'data-komentar': c.id },
      avatar(c.author || { username: '?' }),
      h('div', { class: 'komentar-badan' },
        h('div', { class: 'komentar-kepala' },
          h('strong', { text: c.author ? c.author.username : 'tidak dikenal' }),
          h('span', { class: 'redup', title: fmtWaktuPanjang(c.created_at), text: fmtRelatif(c.created_at, sesi.hariIni) }),
          c.edited_at && !c.dihapus ? h('span', { class: 'redup', title: `Diubah ${fmtWaktuPanjang(c.edited_at)}`, text: '(diubah)' }) : null,
          c.sumber === 'clickup' ? h('span', { class: 'chip garis', text: 'ClickUp' }) : null),
        teks,
        c.lampiran && c.lampiran.length ? h('ul', { class: 'lampiran-daftar' }, c.lampiran.map(nodeLampiran)) : null,
        aksiKomentar.length ? h('div', { class: 'komentar-aksi' }, aksiKomentar) : null,
        !balasan && (c.balasan.length || balasKe === c.id) ? h('ul', { class: 'balasan-wadah daftar-tugas' },
          c.balasan.map((b) => nodeKomentar(b, true)),
          balasKe === c.id ? h('li', {}, tandai(penyusun({ placeholder: `Balas ${c.author ? c.author.username : ''}… (@ untuk mention)`, labelKirim: 'Balas', bolehLampiran: true,
            batal: () => { balasKe = null; gambar(); },
            kirim: (teksB, berkas) => kirimKomentar(teksB, berkas, c.id) }), `balas-${c.id}`)) : null) : null));
  }

  function tandai(el, kunci) { el.dataset.penyusun = kunci; return el; }
  function fokusPenyusun(kunci) {
    setTimeout(() => {
      const el = wadah.querySelector(`[data-penyusun="${CSS.escape(kunci)}"] textarea`);
      if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
    }, 0);
  }

  async function kirimKomentar(teks, berkas, parent) {
    const r = await aksi('web_komentar', { p_task: id, p_teks: teks, p_parent: parent || null, p_mentions: null }, parent ? 'Balasan terkirim' : 'Komentar terkirim');
    if (!r) return false;
    for (const f of berkas) {
      try { await unggahLampiran(id, f, r.id); } catch (e) { toast(pesanGalat(e), 'galat', 6000); }
    }
    balasKe = null;
    await muat();
    return true;
  }

  function bagianKomentar() {
    const isi = d.komentar.length ? h('ul', { class: 'daftar-tugas', 'data-uji': 'daftar-komentar' }, d.komentar.map((c) => nodeKomentar(c, false)))
      : h('p', { class: 'redup kecil', text: '0 komentar.' });
    let bawah;
    if (bolehKomentar()) {
      bawah = tandai(penyusun({ placeholder: 'Tulis komentar… (@ untuk mention)', labelKirim: 'Kirim', bolehLampiran: true,
        kirim: (teks, berkas) => kirimKomentar(teks, berkas, null) }), 'baru');
    } else if (d.boleh.cermin) {
      bawah = h('div', { class: 'kotak-cermin kecil', 'data-uji': 'komentar-terkunci' }, 'Komentar kartu ClickUp ditulis di ClickUp selama mode cermin.');
    } else if (d.task.deleted_at) {
      bawah = h('div', { class: 'kotak-info kecil', text: 'Tugas di Sampah tidak bisa dikomentari.' });
    }
    return h('div', {}, isi, bawah);
  }

  function fmtJejak(j) {
    if (!j) return 'kosong';
    return `${fmtTanggal(j.wib, sesi.hariIni)}${j.has_time && j.at ? ` ${fmtJamWib(j.at)}` : ''}`;
  }
  const namaPrio = (p) => (PRIORITAS[p] ? PRIORITAS[p].nama : 'tanpa');
  const potong = (s, n = 160) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');

  function kalimat(a) {
    const dr = a.dari;
    const ke = a.ke;
    switch (a.jenis) {
      case 'dibuat': return ['membuat tugas', ke && ke.status ? [' dengan status ', statusPil(ke.status)] : null];
      case 'status': return ['mengubah status ', statusPil(dr && dr.status), ' → ', statusPil(ke && ke.status)];
      case 'buka_ulang': return ['membuka ulang tugas ', statusPil(dr && dr.status), ' → ', statusPil(ke && ke.status)];
      case 'due': return `mengubah due: ${fmtJejak(dr)} → ${fmtJejak(ke)}`;
      case 'mulai': return `mengubah tanggal mulai: ${fmtJejak(dr)} → ${fmtJejak(ke)}`;
      case 'assignee_tambah': return `menambah assignee ${ke ? ke.username : ''}`;
      case 'assignee_hapus': return `melepas assignee ${dr ? dr.username : ''}`;
      case 'nama': return 'mengganti nama tugas';
      case 'deskripsi': return 'mengubah deskripsi';
      case 'pindah_list': return `memindah dari list "${dr ? dr.name : '?'}" ke "${ke ? ke.name : '?'}"`;
      case 'induk': return `mengubah induk: ${dr || 'tanpa'} → ${ke || 'tanpa'}`;
      case 'prioritas': return `mengubah prioritas: ${namaPrio(dr)} → ${namaPrio(ke)}`;
      case 'arsip': return 'mengarsipkan tugas';
      case 'pulih_arsip': return 'mengeluarkan tugas dari arsip';
      case 'hapus': return a.catatan === 'purge permanen' ? 'menghapus permanen' : 'memindah tugas ke Sampah';
      case 'pulih': return 'memulihkan tugas dari Sampah';
      case 'komentar': return ke && ke.parent_id ? 'membalas komentar' : 'berkomentar';
      case 'komentar_edit': return 'mengubah komentar';
      case 'komentar_hapus': return 'menghapus komentar';
      case 'lampiran_tambah': return `menambah lampiran "${ke ? ke.title : ''}"`;
      case 'lampiran_hapus': return `menghapus lampiran "${dr ? dr.title : ''}"`;
      case 'hilang_di_clickup': return 'tugas tidak ada lagi di ClickUp (ditandai sinkron)';
      case 'ditutup_impor': return 'tercatat selesai di ClickUp (impor)';
      default: return a.jenis;
    }
  }

  function detailBeda(a) {
    if (a.jenis === 'nama') return `"${potong(a.dari)}" → "${potong(a.ke)}"`;
    if (a.jenis === 'deskripsi') return `Sebelum: ${potong(a.dari, 200) || '(kosong)'}\nSesudah: ${potong(a.ke, 200) || '(kosong)'}`;
    if (a.jenis === 'komentar' && a.ke && a.ke.teks200) return `"${potong(a.ke.teks200)}"`;
    if (a.jenis === 'komentar_edit') return `"${potong(a.dari && a.dari.teks)}" → "${potong(a.ke && a.ke.teks)}"`;
    if (a.jenis === 'komentar_hapus' && a.dari) return `"${potong(a.dari.teks)}"`;
    return null;
  }

  function nodeSnapshot(s) {
    if (!s) return null;
    const kt = s.komentar_terakhir;
    return h('div', { class: 'snapshot', 'data-uji': 'snapshot' },
      `Saat ditutup: ${s.komentar} komentar · ${s.balasan} balasan · ${s.lampiran} lampiran · ${s.ada_url ? 'ada URL' : 'tanpa URL'}.`,
      kt ? h('div', {}, `Komentar terakhir: ${kt.user}, ${fmtWaktu(kt.date)} — "${potong(kt.teks200, 200)}"`) : h('div', { text: 'Belum ada komentar saat ditutup.' }));
  }

  function bagianRiwayat() {
    if (!d.activity.length) return h('p', { class: 'redup kecil', text: 'Belum ada riwayat.' });
    const urut = [...d.activity].reverse();   // terbaru di atas
    return h('ul', { class: 'riwayat', 'data-uji': 'daftar-riwayat' }, urut.map((a) => {
      const impor = a.sumber === 'impor' || a.sumber === 'sinkron';
      const aktor = a.aktor ? a.aktor.username : impor ? 'impor: aktor tak diketahui' : 'sistem';
      const beda = detailBeda(a);
      return h('li', { 'data-jenis': a.jenis },
        a.aktor ? avatar({ username: a.aktor.username, color: '#8e8c99' }) : h('span', { class: 'avatar', vars: { '--warna': '#8e8c99' } }, '·'),
        h('div', { class: 'spasi' },
          h('div', {}, h('strong', { text: aktor }), ' ', kalimat(a)),
          beda ? h('div', { class: 'beda', text: beda }) : null,
          nodeSnapshot(a.snapshot),
          h('div', { class: 'waktu' },
            h('span', { title: fmtWaktuPanjang(a.at), text: fmtWaktu(a.at) }),
            h('span', { class: 'chip garis', text: NAMA_SUMBER[a.sumber] || a.sumber }),
            a.at_awal ? h('span', { text: `berubah antara ${fmtWaktu(a.at_awal)} dan ${fmtWaktu(a.at)}` }) : null,
            a.lengkap === false ? h('span', { class: 'chip', title: 'Waktu/aktor tidak lengkap (data impor/sinkron)', text: 'tidak lengkap' }) : null,
            a.aktor_assignee ? h('span', { class: 'chip garis', text: 'oleh assignee' }) : null,
            a.catatan && a.catatan !== 'purge permanen' ? h('span', { text: a.catatan }) : null)));
    }));
  }

  // ------------------------------------------------------------------ menu & aksi tugas
  function menuTugas() {
    const t = d.task;
    lembar({
      judul: 'Aksi tugas',
      isi: (api) => {
        const item = (label, fn, opsi = {}) => h('li', {}, h('button', { type: 'button', class: opsi.bahaya ? 'bahaya' : '', 'data-uji': opsi.uji,
          onclick: async () => { api.tutup(null); await fn(); } }, label));
        return h('ul', { class: 'menu-daftar' },
          item('Salin tautan', () => salinTeks(tautanTugas(t.id))),
          t.clickup_url && urlAman(t.clickup_url) ? h('li', {}, h('a', { href: urlAman(t.clickup_url), target: '_blank', rel: 'noopener noreferrer', 'data-luar': '' }, 'Buka di ClickUp')) : null,
          bolehUbah() ? item('Pindah ke list lain…', pindah, { uji: 'aksi-pindah' }) : null,
          bolehUbah() ? item(t.archived ? 'Keluarkan dari arsip' : 'Arsipkan', async () => {
            if (await aksi('web_arsip', { p_task: id, p_arsip: !t.archived }, t.archived ? 'Dikeluarkan dari arsip' : 'Diarsipkan')) await muat();
          }, { uji: 'aksi-arsip' }) : null,
          sesi.owner && bolehUbah() ? item('Hapus (ke Sampah)', hapus, { bahaya: true, uji: 'aksi-hapus' }) : null,
          sesi.owner && t.deleted_at ? item('Pulihkan dari Sampah', pulihkan) : null,
          sesi.owner && t.deleted_at ? item('Hapus permanen', purge, { bahaya: true }) : null,
          !bolehUbah() && !t.deleted_at && d.boleh.cermin ? h('li', { class: 'kotak-cermin kecil', text: 'Kartu ClickUp: aksi ubah dinonaktifkan selama mode cermin.' }) : null);
      },
    });
  }

  async function pindah() {
    const l = await pilihList(d.task.list.id);
    if (!l) return;
    if (!await konfirmasi(`Pindahkan tugas ke list "${l.name}"? Status disesuaikan dengan status list tujuan; sub-tugas ikut pindah.`, { ya: 'Pindahkan' })) return;
    if (await aksi('web_pindah', { p_task: id, p_list: l.id }, `Dipindah ke ${l.name}`)) await muat();
  }
  async function hapus() {
    if (!await konfirmasi('Pindahkan tugas ini ke Sampah? Owner bisa memulihkannya dari menu Sampah.', { ya: 'Hapus', bahaya: true })) return;
    if (await aksi('web_hapus', { p_task: id }, 'Tugas dipindah ke Sampah')) await muat();
  }
  async function pulihkan() {
    if (await aksi('web_pulihkan', { p_task: id }, 'Tugas dipulihkan')) await muat();
  }
  async function purge() {
    if (!await konfirmasi('Hapus permanen tugas ini beserta sub-tugas, komentar, dan berkas lampirannya? Tindakan ini tidak bisa dibatalkan. Riwayat tetap tersimpan.', { ya: 'Hapus permanen', bahaya: true })) return;
    if (await hapusPermanen(id)) ctx.navigasi('/sampah', { ganti: true });
  }

  try {
    await muat();
  } catch (e) {
    if (e.code === 'PT404') {
      kosongkan(wadah, h('div', { class: 'kotak-galat', role: 'alert' }, `Tugas "${id}" tidak ditemukan.`),
        h('a', { class: 'tombol', href: `/cari?q=${encodeURIComponent(id)}` }, 'Cari tugas'));
      ctx.judul('Tidak ditemukan');
      return undefined;
    }
    throw e;
  }
  // segarkan saat kembali ke tab (data bisa berubah oleh orang lain)
  const segar = () => { if (document.visibilityState === 'visible' && modeDesk === 'lihat' && !balasKe && !editKomentar) muat().catch(() => {}); };
  document.addEventListener('visibilitychange', segar);
  return () => document.removeEventListener('visibilitychange', segar);
}
