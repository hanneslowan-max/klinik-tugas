// Kerangka aplikasi: router path (history API), penjaga sesi, header, navigasi bawah, lonceng (polling 60 dtk).
import { klien, pesanGalat, GalatApi, KONFIG_OK } from './api.js';
import { sesi, muatProfil, muatLibur, keluar, dengarSesi } from './sesi.js';
import { h, kosongkan, lembar, toast, lanjutAman } from './util.js';

import * as layarMasuk from './layar/masuk.js';
import * as layarGanti from './layar/ganti-password.js';
import * as layarSaya from './layar/saya.js';
import * as layarJelajah from './layar/jelajah.js';
import * as layarList from './layar/list.js';
import * as layarDetail from './layar/detail.js';
import * as layarCari from './layar/cari.js';
import * as layarNotif from './layar/notif.js';
import * as layarAdmin from './layar/admin.js';
import * as layarSampah from './layar/sampah.js';

const RUTE = [
  { pola: /^\/masuk\/?$/, layar: layarMasuk, publik: true },
  { pola: /^\/ganti-password\/?$/, layar: layarGanti, bolehSaatGanti: true },
  { pola: /^\/(?:saya\/?)?$/, layar: layarSaya, nav: 'saya' },
  { pola: /^\/jelajah\/?$/, layar: layarJelajah, nav: 'jelajah' },
  { pola: /^\/l\/([^/]+)\/?$/, layar: layarList, nav: 'jelajah', kembali: '/jelajah' },
  { pola: /^\/t\/([^/]+)\/?$/, layar: layarDetail, kembali: '/saya' },
  { pola: /^\/cari\/?$/, layar: layarCari, nav: 'cari' },
  { pola: /^\/notif\/?$/, layar: layarNotif, kembali: '/saya' },
  { pola: /^\/admin\/?$/, layar: layarAdmin, owner: true, kembali: '/saya', lebar: true },
  { pola: /^\/sampah\/?$/, layar: layarSampah, owner: true, kembali: '/saya' },
];

const el = {
  isi: document.getElementById('isi'),
  atas: document.getElementById('atas'),
  judul: document.getElementById('judul'),
  kembali: document.getElementById('tombol-kembali'),
  mode: document.getElementById('lencana-mode'),
  lonceng: document.getElementById('lonceng'),
  angka: document.getElementById('lonceng-angka'),
  nav: document.getElementById('nav-bawah'),
  menu: document.getElementById('tombol-menu'),
};

let bersihkanLayar = null;
let nomorRender = 0;
let kembaliKe = null;
let riwayatDalam = 0;   // jumlah navigasi di dalam aplikasi (untuk tombol kembali)

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

export function navigasi(path, { ganti = false } = {}) {
  if (ganti) history.replaceState({ dalam: riwayatDalam }, '', path);
  else {
    // simpan posisi gulir halaman sekarang supaya tombol kembali memulihkannya
    history.replaceState({ ...(history.state || {}), gulir: window.scrollY }, '', location.pathname + location.search + location.hash);
    riwayatDalam++;
    history.pushState({ dalam: riwayatDalam }, '', path);
  }
  render(0);
}

function setJudul(t) {
  el.judul.textContent = t || 'Tugas RHJ';
  document.title = t ? `${t} · Tugas RHJ` : 'Tugas RHJ';
}

function perbaruiKepala() {
  const p = sesi.profil;
  el.mode.hidden = !(p && p.mode === 'cermin');
  const n = p ? p.notif_belum || 0 : 0;
  el.angka.hidden = n === 0;
  el.angka.textContent = n > 99 ? '99+' : String(n);
  el.lonceng.setAttribute('aria-label', n ? `Notifikasi, ${n} belum dibaca` : 'Notifikasi');
}
dengarSesi(perbaruiKepala);

async function render(gulir = 0) {
  const nomor = ++nomorRender;
  if (bersihkanLayar) { try { bersihkanLayar(); } catch { /* abaikan */ } bersihkanLayar = null; }
  const url = new URL(location.href);
  const path = url.pathname;
  const rute = RUTE.find((r) => r.pola.test(path));
  const lanjut = encodeURIComponent(path + url.search + url.hash);

  const { data } = await klien.auth.getSession();
  if (nomor !== nomorRender) return;
  const adaSesi = !!data.session;

  if (!rute) return tampilkan({ judul: 'Tidak ditemukan', isi: h('div', { class: 'kosong' }, h('p', { text: 'Halaman tidak ditemukan.' }), h('a', { href: '/saya', class: 'tombol' }, 'Ke Tugas Saya')) });

  if (rute.publik) {
    if (adaSesi && rute.layar === layarMasuk) {
      // sudah masuk → lanjutkan
      return navigasi(lanjutAman(url.searchParams.get('lanjut'), '/saya', ['/masuk']), { ganti: true });
    }
    return jalankan(rute, url, nomor, gulir);
  }
  if (!adaSesi) return navigasi(`/masuk?lanjut=${lanjut}`, { ganti: true });

  if (!sesi.profil) {
    try {
      await Promise.all([muatProfil(), muatLibur()]);
    } catch (e) {
      if (nomor !== nomorRender) return;
      if (e instanceof GalatApi && e.sesiHabis) {
        await keluar();
        return navigasi(`/masuk?lanjut=${lanjut}`, { ganti: true });
      }
      return tampilkan({ judul: 'Gagal memuat', isi: h('div', { class: 'kotak-galat' }, pesanGalat(e)) });
    }
    if (nomor !== nomorRender) return;
  }
  const p = sesi.profil;
  if (!p.member || !p.anggota_aktif) {
    return tampilkan({ judul: 'Akun belum aktif', tanpaNav: true, isi: h('div', { class: 'layar-masuk' },
      h('div', { class: 'kotak-peringatan' }, p.member
        ? 'Akun Anda sedang nonaktif. Hubungi owner.'
        : 'Akun ini belum terhubung ke anggota tim. Hubungi owner.'),
      h('button', { class: 'tombol penuh', type: 'button', onclick: async () => { await keluar(); navigasi('/masuk', { ganti: true }); } }, 'Keluar')) });
  }
  if (p.member.harus_ganti_password && !rute.bolehSaatGanti) {
    return navigasi(`/ganti-password?lanjut=${lanjut}`, { ganti: true });
  }
  if (rute.owner && !p.owner) {
    return tampilkan({ judul: 'Khusus owner', isi: h('div', { class: 'kotak-peringatan', 'data-uji': 'khusus-owner' }, 'Halaman ini khusus owner.') });
  }
  return jalankan(rute, url, nomor, gulir);
}

function tampilkan({ judul, isi, tanpaNav = false }) {
  setJudul(judul);
  el.atas.hidden = tanpaNav;
  el.nav.hidden = tanpaNav || !sesi.profil;
  el.lonceng.hidden = tanpaNav;
  el.kembali.hidden = true;
  el.isi.classList.remove('lebar');
  kosongkan(el.isi, isi);
}

async function jalankan(rute, url, nomor, gulir = 0) {
  const tanpaKerangka = rute.publik || rute.bolehSaatGanti && sesi.profil && sesi.profil.member?.harus_ganti_password;
  el.atas.hidden = !!rute.publik;
  el.nav.hidden = !!tanpaKerangka;
  el.lonceng.hidden = !!tanpaKerangka;
  el.isi.classList.toggle('lebar', !!rute.lebar);
  kembaliKe = rute.kembali || null;
  el.kembali.hidden = !kembaliKe;
  for (const a of el.nav.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === rute.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  perbaruiKepala();
  const wadah = h('div', { class: 'layar' });
  kosongkan(el.isi, wadah);
  const m = url.pathname.match(rute.pola);
  const ctx = {
    el: wadah,
    params: m ? m.slice(1).map(decodeURIComponent) : [],
    query: url.searchParams,
    hash: url.hash,
    judul: setJudul,
    navigasi,
    aktif: () => nomor === nomorRender,
    /** ganti query tanpa menambah riwayat & tanpa render ulang */
    setQuery(obj) {
      const u = new URL(location.href);
      for (const [k, v] of Object.entries(obj)) { if (v === null || v === undefined || v === '') u.searchParams.delete(k); else u.searchParams.set(k, v); }
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    },
  };
  setJudul('');
  try {
    const bersih = await rute.layar.tampil(ctx);
    if (typeof bersih === 'function') {
      if (nomor === nomorRender) bersihkanLayar = bersih; else bersih();
    }
  } catch (e) {
    console.error(e);
    if (nomor !== nomorRender) return;
    if (e instanceof GalatApi && e.sesiHabis) {
      await keluar();
      return navigasi(`/masuk?lanjut=${encodeURIComponent(url.pathname + url.search)}`, { ganti: true });
    }
    kosongkan(wadah, h('div', { class: 'kotak-galat', role: 'alert' }, pesanGalat(e)),
      h('button', { class: 'tombol', type: 'button', onclick: () => render() }, 'Coba lagi'));
  }
  if (nomor === nomorRender && !url.hash) {
    el.isi.focus({ preventScroll: true });
    window.scrollTo(0, gulir || 0);
  }
}

// ------------------------------------------------------------------ tautan internal
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || a.dataset.luar !== undefined) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin) return;
  if (/^\/(css|js|vendor)\//.test(u.pathname) || /\.[a-z0-9]+$/i.test(u.pathname)) return;
  e.preventDefault();
  if (u.pathname + u.search === location.pathname + location.search && u.hash) {
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    const t = document.getElementById(u.hash.slice(1));
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  navigasi(u.pathname + u.search + u.hash);
});

window.addEventListener('popstate', (e) => {
  riwayatDalam = (e.state && e.state.dalam) || 0;
  render((e.state && e.state.gulir) || 0);
});

el.kembali.addEventListener('click', () => {
  if (riwayatDalam > 0) history.back();
  else navigasi(kembaliKe || '/saya', { ganti: true });
});

el.mode.addEventListener('click', () => {
  lembar({
    judul: 'Mode cermin',
    isi: h('div', {},
      h('p', { text: 'Aplikasi sedang berjalan paralel dengan ClickUp. Selama mode cermin:' }),
      h('ul', {},
        h('li', { text: 'Kartu, komentar, dan lampiran yang berasal dari ClickUp hanya-baca di sini. Ubah di ClickUp; perubahan masuk lewat sinkron harian.' }),
        h('li', { text: 'Tugas buatan aplikasi (mis. di space latihan) tetap bisa diubah.' }),
        h('li', { text: 'Owner memindah ke mode utama saat cutover.' }))),
    aksi: [{ label: 'Mengerti', kelas: 'utama' }],
  });
});

el.menu.addEventListener('click', () => {
  const p = sesi.profil;
  if (!p || !p.member) return;
  lembar({
    judul: 'Menu',
    isi: (api) => {
      const ke = (path) => (e) => { e.preventDefault(); api.tutup(null); navigasi(path); };
      return h('div', {},
        h('div', { class: 'item-admin' },
          h('span', { class: 'avatar besar', vars: { '--warna': p.member.color } }, p.member.initials || '?'),
          h('div', { class: 'info' }, h('strong', { text: p.member.nama || p.member.username }),
            h('div', { class: 'sub' }, h('span', { text: p.member.email || '' }), h('span', { class: 'chip', text: p.member.role })))),
        h('ul', { class: 'menu-daftar' },
          h('li', {}, h('a', { href: '/notif', onclick: ke('/notif') }, 'Notifikasi')),
          p.owner ? h('li', {}, h('a', { href: '/admin', onclick: ke('/admin'), 'data-uji': 'menu-admin' }, 'Admin')) : null,
          p.owner ? h('li', {}, h('a', { href: '/sampah', onclick: ke('/sampah'), 'data-uji': 'menu-sampah' }, 'Sampah')) : null,
          h('li', {}, h('a', { href: '/ganti-password', onclick: ke('/ganti-password') }, 'Ganti password')),
          h('li', {}, h('button', { type: 'button', class: 'bahaya', 'data-uji': 'keluar', onclick: async () => {
            api.tutup(null);
            await keluar();
            toast('Anda sudah keluar');
            navigasi('/masuk', { ganti: true });
          } }, 'Keluar'))));
    },
  });
});

// ------------------------------------------------------------------ polling lonceng & mode (60 dtk)
const INTERVAL_POLLING = 60000;
async function segarkanProfil() {
  if (!sesi.profil || document.visibilityState !== 'visible') return;
  try {
    const lama = sesi.profil;
    await muatProfil();
    if (lama.mode !== sesi.profil.mode) toast(`Mode aplikasi sekarang: ${sesi.profil.mode}`);
  } catch (e) {
    if (e instanceof GalatApi && e.sesiHabis) { await keluar(); navigasi('/masuk', { ganti: true }); }
  }
}
setInterval(segarkanProfil, INTERVAL_POLLING);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') segarkanProfil(); });

if (klien) {
  klien.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT') { sesi.profil = null; }
  });
}

// ------------------------------------------------------------------ service worker (cache aset saja)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

document.getElementById('muat-awal')?.remove();
history.replaceState({ dalam: 0 }, '', location.pathname + location.search + location.hash);
if (KONFIG_OK) render();
else {
  kosongkan(el.isi, h('div', { class: 'layar-masuk' }, h('div', { class: 'kotak-galat', role: 'alert', 'data-uji': 'konfig-kosong' },
    'Konfigurasi aplikasi belum diisi (config.js: SUPABASE_URL / SUPABASE_ANON_KEY). Hubungi pengelola aplikasi.')));
}
