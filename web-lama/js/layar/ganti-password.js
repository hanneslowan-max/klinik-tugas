// Ganti password. Wajib saat members.harus_ganti_password (password sementara dari owner); juga bisa dari Menu.
import { klien, rpc, pesanGalat } from '../api.js';
import { sesi, muatProfil, keluar } from '../sesi.js';
import { h, toast, lanjutAman } from '../util.js';

const MIN = 8;

export async function tampil(ctx) {
  const wajib = !!sesi.member?.harus_ganti_password;
  ctx.judul('Ganti password');
  const galat = h('div', { class: 'kotak-galat', role: 'alert', hidden: true });
  const baru = h('input', { type: 'password', name: 'password-baru', autocomplete: 'new-password', required: true, minlength: MIN });
  const ulang = h('input', { type: 'password', name: 'password-ulang', autocomplete: 'new-password', required: true, minlength: MIN });
  const kirim = h('button', { type: 'submit', class: 'tombol utama penuh' }, 'Simpan password');

  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    galat.hidden = true;
    const salah = baru.value.length < MIN ? `Password minimal ${MIN} karakter.`
      : baru.value !== ulang.value ? 'Kedua password tidak sama.'
        : /^(.)\1+$/.test(baru.value) ? 'Password terlalu mudah ditebak.' : null;
    if (salah) { galat.textContent = salah; galat.hidden = false; return; }
    kirim.disabled = true;
    try {
      const { error } = await klien.auth.updateUser({ password: baru.value });
      if (error) {
        galat.textContent = /same|different/i.test(error.message) ? 'Password baru harus berbeda dari password lama.'
          : /weak|short|length/i.test(error.message) ? 'Password terlalu lemah. Pakai minimal 8 karakter campuran.'
            : `Gagal mengganti password: ${error.message}`;
        galat.hidden = false;
        return;
      }
      await rpc('web_sudah_ganti_password');
      await muatProfil();
      toast('Password sudah diganti', 'sukses');
      ctx.navigasi(lanjutAman(ctx.query.get('lanjut'), '/saya', ['/ganti-password', '/masuk']), { ganti: true });
    } catch (err) {
      galat.textContent = pesanGalat(err);
      galat.hidden = false;
    } finally {
      kirim.disabled = false;
    }
  } },
  h('label', { class: 'bidang' }, h('span', { text: `Password baru (min. ${MIN} karakter)` }), baru),
  h('label', { class: 'bidang' }, h('span', { text: 'Ulangi password baru' }), ulang),
  galat, kirim);

  ctx.el.append(h('div', { class: 'layar-masuk' },
    wajib ? h('div', { class: 'kotak-peringatan', 'data-uji': 'wajib-ganti' },
      'Anda masuk dengan password sementara dari owner. Buat password baru sebelum lanjut.') : null,
    form,
    wajib ? h('button', { type: 'button', class: 'tombol polos penuh', onclick: async () => { await keluar(); ctx.navigasi('/masuk', { ganti: true }); } }, 'Keluar') : null));
  baru.focus();
}
