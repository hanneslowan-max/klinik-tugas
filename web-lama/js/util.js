// Pembantu DOM, format tanggal WIB, hari kerja, toast & dialog. Tanpa innerHTML untuk data (XSS); satu-satunya
// innerHTML ada di md.js dan berisi keluaran DOMPurify.

const ZONA = 'Asia/Jakarta';

/** Buat elemen: h('a', {href, class, onclick, vars:{'--warna': c}}, 'teks', anak...). */
export function h(tag, attrs, ...anak) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'vars') { for (const [n, nv] of Object.entries(v)) if (nv) el.style.setProperty(n, nv); }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden' || k === 'required'
               || k === 'multiple' || k === 'autofocus' || k === 'readOnly') el[k] = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  tambah(el, anak);
  return el;
}

function tambah(el, anak) {
  for (const a of anak) {
    if (a === null || a === undefined || a === false) continue;
    if (Array.isArray(a)) tambah(el, a);
    else if (a instanceof Node) el.appendChild(a);
    else el.appendChild(document.createTextNode(String(a)));
  }
}

export function kosongkan(el, ...anak) {
  while (el.firstChild) el.removeChild(el.firstChild);
  tambah(el, anak);
  return el;
}

const svgNS = 'http://www.w3.org/2000/svg';
const IKON = {
  centang: 'M5 12l5 5 9-10',
  tambah: 'M12 5v14M5 12h14',
  tutup: 'M6 6l12 12M18 6L6 18',
  bendera: 'M5 21V4h11l-2 4 2 4H5',
  komentar: 'M4 5h16v11H9l-5 4z',
  salin: 'M8 8h11v11H8zM5 16V5h11',
  lampiran: 'M8 12l6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l7-7',
  kunci: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  titik3: 'M5 12h.01M12 12h.01M19 12h.01',
  unduh: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  hapus: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  kalender: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  kanan: 'M9 5l7 7-7 7',
};
export function ikon(nama) {
  const s = document.createElementNS(svgNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(svgNS, 'path');
  p.setAttribute('d', IKON[nama] || '');
  s.appendChild(p);
  return s;
}

// ------------------------------------------------------------------ tanggal (WIB)
const fmtTgl = new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short' });
const fmtTglTahun = new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtJam = new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtLengkap = new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtIsoWib = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
// tooltip: tanggal/waktu lengkap berbahasa Indonesia (bukan ISO) — 'Selasa, 29 September 2026' / '… pukul 11.25.31 WIB'
const fmtTglPanjang = new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtJamDetik = new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/** 'YYYY-MM-DD' (tanggal WIB) dari Date/ISO. */
export function tanggalWib(t) {
  if (!t) return null;
  const d = t instanceof Date ? t : new Date(t);
  return Number.isNaN(d.getTime()) ? null : fmtIsoWib.format(d);
}
/** Tanggal lokal WIB 'YYYY-MM-DD' → Date di 12:00 WIB (aman untuk format). */
export function dariTanggal(s) {
  return s ? new Date(`${s}T12:00:00+07:00`) : null;
}
/** 'Sen, 29 Sep' (+ tahun bila beda tahun dengan hariIni). */
export function fmtTanggal(s, hariIni) {
  if (!s) return '';
  const d = dariTanggal(s);
  const tahunSama = hariIni && s.slice(0, 4) === hariIni.slice(0, 4);
  return (tahunSama ? fmtTgl : fmtTglTahun).format(d);
}
export function fmtWaktu(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${fmtLengkap.format(d)} WIB`;
}
/** 'Selasa, 29 September 2026' dari tanggal WIB 'YYYY-MM-DD'. */
export function fmtTanggalPanjang(s) {
  return s ? fmtTglPanjang.format(dariTanggal(s)) : '';
}
/** 'Selasa, 29 September 2026 pukul 11.25.31 WIB' dari ISO (untuk tooltip). */
export function fmtWaktuPanjang(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${fmtTglPanjang.format(d)} pukul ${fmtJamDetik.format(d)} WIB`;
}
export function fmtJamWib(iso) {
  if (!iso) return '';
  return `${fmtJam.format(new Date(iso))} WIB`;
}
/** Waktu relatif singkat: 'baru saja', '5 mnt lalu', '3 jam lalu', 'kemarin 14.05', '12 Sep'. */
export function fmtRelatif(iso, hariIni) {
  if (!iso) return '';
  const d = new Date(iso);
  const selisih = (Date.now() - d.getTime()) / 1000;
  if (selisih < 60 && selisih > -60) return 'baru saja';
  if (selisih > 0 && selisih < 3600) return `${Math.floor(selisih / 60)} mnt lalu`;
  if (selisih > 0 && selisih < 6 * 3600) return `${Math.floor(selisih / 3600)} jam lalu`;
  const tgl = tanggalWib(d);
  const hi = hariIni || tanggalWib(new Date());
  if (tgl === hi) return `hari ini ${fmtJam.format(d)}`;
  if (tgl === tambahHari(hi, -1)) return `kemarin ${fmtJam.format(d)}`;
  return fmtTanggal(tgl, hi);
}
export function tambahHari(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function selisihHari(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
}
export function hariDalamMinggu(s) { return new Date(`${s}T00:00:00Z`).getUTCDay(); } // 0 Minggu … 6 Sabtu
export const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Sama dengan SQL hari_kerja(a,b): jumlah d Senin–Jumat, a < d ≤ b, bukan hari libur; negatif bila b < a. */
export function hariKerja(a, b, libur) {
  if (!a || !b) return null;
  if (b < a) return -hariKerja(b, a, libur);
  let n = 0;
  for (let d = tambahHari(a, 1); d <= b; d = tambahHari(d, 1)) {
    const w = hariDalamMinggu(d);
    if (w !== 0 && w !== 6 && !(libur && libur.has(d))) n++;
  }
  return n;
}

/** Kategori due kartu terbuka (sama dengan web_tugas_saya): telat/hari_ini/tiga_hk/nanti/tanpa_due; null bila selesai. */
export function kategoriDue(t, hariIni, libur) {
  if (t.selesai) return null;
  if (!t.due_wib) return 'tanpa_due';
  if (t.due_wib < hariIni) return 'telat';
  if (t.due_wib === hariIni) return 'hari_ini';
  if (hariKerja(hariIni, t.due_wib, libur) <= 3) return 'tiga_hk';
  return 'nanti';
}

/** Chip due: 'Telat 3 hr' / 'Hari ini' / 'Rab, 1 Okt · sisa 2 hk'. */
export function chipDue(t, hariIni, libur) {
  if (!t.due_wib) return null;
  const kat = kategoriDue(t, hariIni, libur);
  const jam = t.due_has_time && t.due_at ? ` ${fmtJam.format(new Date(t.due_at))}` : '';
  let teks = fmtTanggal(t.due_wib, hariIni) + jam;
  let kelas = 'chip';
  if (kat === 'telat') { teks = `${teks} · telat ${selisihHari(t.due_wib, hariIni)} hr`; kelas += ' telat'; }
  else if (kat === 'hari_ini') { teks = `Hari ini${jam}`; kelas += ' hari-ini'; }
  else if (kat === 'tiga_hk') { teks = `${teks} · sisa ${hariKerja(hariIni, t.due_wib, libur)} hk`; kelas += ' dekat'; }
  return h('span', { class: kelas, title: `Due ${fmtTanggalPanjang(t.due_wib)}${jam} (WIB)` }, ikon('kalender'), teks);
}

// ------------------------------------------------------------------ prioritas
// nilai 1–4 = prioritas ClickUp (urgent/high/normal/low); label tampil berbahasa Indonesia
export const PRIORITAS = {
  1: { nama: 'Mendesak', warna: '#f50000' },
  2: { nama: 'Tinggi', warna: '#ffcc00' },
  3: { nama: 'Normal', warna: '#6fddff' },
  4: { nama: 'Rendah', warna: '#d8d8d8' },
};

/** Label peran anggota (nilai DB tetap owner/member/bot). */
export const PERAN = { owner: 'owner', member: 'anggota', bot: 'bot' };
export const labelPeran = (r) => PERAN[r] || r;
export function chipPrioritas(p) {
  const x = PRIORITAS[p];
  if (!x) return null;
  return h('span', { class: 'prioritas', vars: { '--warna': x.warna }, title: `Prioritas ${x.nama}` }, ikon('bendera'), x.nama);
}

export function avatar(m, besar) {
  if (!m) return null;
  const inisial = m.initials || (m.username || '?').split(/\s+/).map((s) => s[0]).join('').slice(0, 2);
  return h('span', { class: `avatar${besar ? ' besar' : ''}`, vars: { '--warna': m.color || '#7b68ee' },
    title: m.nama || m.username }, inisial);
}

export function statusPil(nama, warna) {
  return h('span', { class: 'status-pil', vars: { '--warna': warna || '#999' } }, nama || '—');
}

export function ukuranBerkas(n) {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function urlAman(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch { return null; }
}

/** Teks → node dengan URL http(s) jadi tautan (tanpa innerHTML). */
export function teksBertautan(teks) {
  const frag = document.createDocumentFragment();
  const pola = /https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/g;
  let pos = 0;
  for (const m of teks.matchAll(pola)) {
    if (m.index > pos) frag.appendChild(document.createTextNode(teks.slice(pos, m.index)));
    const u = urlAman(m[0]);
    frag.appendChild(u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, m[0])
      : document.createTextNode(m[0]));
    pos = m.index + m[0].length;
  }
  if (pos < teks.length) frag.appendChild(document.createTextNode(teks.slice(pos)));
  return frag;
}

// ------------------------------------------------------------------ toast
export function toast(pesan, jenis = '', ms = 4000) {
  const wadah = document.getElementById('toast');
  const el = h('div', { class: `toast ${jenis}`, role: jenis === 'galat' ? 'alert' : 'status' }, pesan);
  wadah.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

// ------------------------------------------------------------------ dialog lembar
/**
 * Buka lembar (dialog modal). isi = Node | (lembarApi) => Node. aksi = [{label, kelas, nilai, klik}].
 * klik boleh async; bila mengembalikan false, lembar tetap terbuka. Promise → nilai aksi / null (batal).
 */
export function lembar({ judul, isi, aksi = [], lebarPenuh = false }) {
  return new Promise((selesai) => {
    let nilaiAkhir = null;
    const dlg = h('dialog', { class: 'lembar', 'aria-label': judul });
    const tutup = (nilai) => { nilaiAkhir = nilai; dlg.close(); };
    const api = { tutup, dialog: dlg };
    const tombolTutup = h('button', { class: 'ikon-tombol', type: 'button', 'aria-label': 'Tutup', onclick: () => tutup(null) }, ikon('tutup'));
    const badan = h('div', { class: 'lembar-isi' }, typeof isi === 'function' ? isi(api) : isi);
    const kaki = aksi.length ? h('div', { class: 'lembar-kaki' }, aksi.map((a) => {
      const b = h('button', { type: 'button', class: `tombol ${a.kelas || ''}`, disabled: a.disabled }, a.label);
      b.addEventListener('click', async () => {
        const nilaiAksi = 'nilai' in a ? a.nilai : a.label;
        if (!a.klik) return tutup(nilaiAksi);
        b.disabled = true;
        try {
          const r = await a.klik(api);
          if (r !== false) tutup(r === undefined ? ('nilai' in a ? a.nilai : true) : r);
        } finally { b.disabled = false; }
      });
      return b;
    })) : null;
    dlg.append(h('div', { class: 'lembar-kepala' }, h('h2', { text: judul }), tombolTutup), badan, kaki);
    if (lebarPenuh) dlg.classList.add('penuh');
    dlg.addEventListener('close', () => { dlg.remove(); selesai(nilaiAkhir); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) tutup(null); });
    document.body.appendChild(dlg);
    dlg.showModal();
    const fokus = badan.querySelector('[autofocus], input, select, textarea');
    if (fokus) fokus.focus();
  });
}

export async function konfirmasi(pesan, { judul = 'Konfirmasi', ya = 'Ya', bahaya = false } = {}) {
  const r = await lembar({
    judul,
    isi: h('p', { text: pesan }),
    aksi: [{ label: 'Batal', nilai: false }, { label: ya, kelas: bahaya ? 'bahaya' : 'utama', nilai: true }],
  });
  return r === true;
}

export async function salinTeks(teks) {
  try {
    await navigator.clipboard.writeText(teks);
    toast('Disalin', 'sukses', 1800);
  } catch {
    toast('Gagal menyalin. Salin manual.', 'galat');
  }
}

/** Path tujuan setelah login yang aman (hanya path internal, bukan //host atau URL lain). */
export function lanjutAman(s, cadangan = '/saya', larang = []) {
  if (!s || typeof s !== 'string' || !s.startsWith('/') || s.startsWith('//') || s.includes('\\')) return cadangan;
  if (larang.some((p) => s.startsWith(p))) return cadangan;
  return s;
}

/**
 * Keyboard virtual: iOS Safari & Chrome Android (resizes-visual) tidak mengecilkan layout viewport, jadi lembar bawah
 * (dialog) tertutup keyboard. Isi --vv-tinggi (tinggi viewport visual) & --vv-bawah (bagian bawah layout viewport yang
 * tertutup) di <html>; CSS memakainya untuk tinggi maks & margin bawah dialog. Kontrol yang sedang fokus di dialog
 * digulir supaya tetap terlihat.
 */
export function pantauViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const akar = document.documentElement;
  let bawahLama = -1;
  const perbarui = () => {
    // cubit-zoom juga mengecilkan viewport visual → bukan keyboard; abaikan saat skala ≠ 1
    const zoom = vv.scale && Math.abs(vv.scale - 1) > 0.01;
    const tinggi = Math.round(zoom ? window.innerHeight : vv.height);
    const bawah = zoom ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    akar.style.setProperty('--vv-tinggi', `${tinggi}px`);
    akar.style.setProperty('--vv-bawah', `${bawah}px`);
    akar.classList.toggle('papan-ketik', bawah > 80);
    if (bawah !== bawahLama) {
      bawahLama = bawah;
      const aktif = document.activeElement;
      if (aktif && aktif.closest && aktif.closest('dialog[open]')) requestAnimationFrame(() => aktif.scrollIntoView({ block: 'nearest' }));
    }
  };
  vv.addEventListener('resize', perbarui);
  vv.addEventListener('scroll', perbarui);
  window.addEventListener('resize', perbarui);
  perbarui();
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
