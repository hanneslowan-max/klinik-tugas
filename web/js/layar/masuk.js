// Layar Masuk: email + password (akun dibuat owner; tanpa daftar mandiri). Tidak memuat data apa pun.
import { klien } from '../api.js';
import { muatProfil, muatLibur } from '../sesi.js';
import { h, lanjutAman } from '../util.js';

export async function tampil(ctx) {
  ctx.judul('Masuk');
  const galat = h('div', { class: 'kotak-galat', role: 'alert', hidden: true });
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'username', required: true, inputmode: 'email', autocapitalize: 'none', spellcheck: 'false' });
  const sandi = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const lihat = h('button', { type: 'button', 'aria-label': 'Tampilkan password', onclick: () => {
    const tampak = sandi.type === 'text';
    sandi.type = tampak ? 'password' : 'text';
    lihat.textContent = tampak ? 'Lihat' : 'Sembunyi';
  } }, 'Lihat');
  const kirim = h('button', { type: 'submit', class: 'tombol utama penuh' }, 'Masuk');

  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    galat.hidden = true;
    if (!email.value.trim() || !sandi.value) {
      galat.textContent = 'Isi email dan password.';
      galat.hidden = false;
      return;
    }
    kirim.disabled = true;
    kirim.textContent = 'Memeriksa…';
    try {
      const { error } = await klien.auth.signInWithPassword({ email: email.value.trim(), password: sandi.value });
      if (error) {
        galat.textContent = /invalid login|invalid_credentials|Invalid/i.test(error.message)
          ? 'Email atau password salah.'
          : /rate|too many/i.test(error.message) ? 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.'
            : `Gagal masuk: ${error.message}`;
        galat.hidden = false;
        return;
      }
      await Promise.all([muatProfil(), muatLibur()]);
      ctx.navigasi(lanjutAman(ctx.query.get('lanjut'), '/saya', ['/masuk']), { ganti: true });
    } catch (err) {
      galat.textContent = /fetch|network/i.test(err.message) ? 'Tidak bisa terhubung ke server. Periksa koneksi.' : err.message;
      galat.hidden = false;
    } finally {
      kirim.disabled = false;
      kirim.textContent = 'Masuk';
    }
  } },
  h('label', { class: 'bidang' }, h('span', { text: 'Email' }), email),
  h('label', { class: 'bidang' }, h('span', { text: 'Password' }), h('div', { class: 'lihat-sandi' }, sandi, lihat)),
  galat,
  kirim);

  ctx.el.append(h('div', { class: 'layar-masuk' },
    h('div', { class: 'logo' }, h('img', { src: '/ikon.svg', alt: '' }),
      h('div', {}, h('h2', { text: 'Tugas RHJ' }), h('div', { class: 'redup kecil', text: 'PT Roda Hammerindo Jaya' }))),
    ctx.query.get('lanjut') ? h('div', { class: 'kotak-info', text: 'Silakan masuk untuk melanjutkan.' }) : null,
    form,
    h('p', { class: 'redup kecil', text: 'Lupa password atau belum punya akun? Hubungi owner.' })));
  email.focus();
}
