// Penyusun komentar: textarea + autocomplete @mention (username persis) + lampiran opsional.
import { anggotaAktif } from './sesi.js';
import { h, ikon, avatar, toast } from './util.js';
import { ACCEPT, mimeBerkas, BATAS_BERKAS } from './api.js';

/**
 * opsi: { placeholder, labelKirim, teksAwal, bolehLampiran, kirim: async (teks, berkas[]) => boolean|void, batal?: () => void }
 * Mention dideteksi DB dari '@username' persis di teks (web_komentar p_mentions=null).
 */
export function penyusun(opsi) {
  const ta = h('textarea', { placeholder: opsi.placeholder || 'Tulis komentar… (@ untuk mention)', 'aria-label': opsi.placeholder || 'Komentar',
    rows: 3, maxlength: 20000 });
  if (opsi.teksAwal) ta.value = opsi.teksAwal;
  const saran = h('ul', { class: 'saran-mention', role: 'listbox', hidden: true, 'aria-label': 'Saran mention' });
  const berkasDaftar = h('div', { class: 'baris-aksi kecil' });
  const berkas = [];
  const inputBerkas = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true });
  const tombolKirim = h('button', { type: 'submit', class: 'tombol utama kecil' }, opsi.labelKirim || 'Kirim');
  let anggota = [];
  let pilihan = [];
  let aktif = 0;
  let awalMention = -1;

  anggotaAktif().then((a) => { anggota = a; }).catch(() => {});

  function tutupSaran() { saran.hidden = true; awalMention = -1; ta.setAttribute('aria-expanded', 'false'); }

  function cekMention() {
    const pos = ta.selectionStart;
    const sebelum = ta.value.slice(0, pos);
    const m = sebelum.match(/(^|[\s(])@([^\n@]{0,40})$/);
    if (!m) return tutupSaran();
    const kata = m[2].toLowerCase();
    awalMention = pos - m[2].length - 1;
    pilihan = anggota.filter((x) => x.username.toLowerCase().startsWith(kata)
      || (x.nama || '').toLowerCase().startsWith(kata)
      || x.username.toLowerCase().split(/\s+/).some((p) => p.startsWith(kata))).slice(0, 8);
    if (!pilihan.length || (m[2].endsWith(' ') && !pilihan.some((x) => x.username.toLowerCase().startsWith(kata)))) return tutupSaran();
    aktif = 0;
    gambarSaran();
  }

  function gambarSaran() {
    saran.replaceChildren(...pilihan.map((x, i) => h('li', { role: 'option', 'aria-selected': i === aktif ? 'true' : 'false', 'data-username': x.username,
      onmousedown: (e) => { e.preventDefault(); sisipkan(x); } },
    avatar(x), h('span', {}, h('strong', { text: x.username }), x.nama && x.nama !== x.username ? h('span', { class: 'redup kecil', text: ` · ${x.nama}` }) : null))));
    saran.hidden = false;
    ta.setAttribute('aria-expanded', 'true');
  }

  function sisipkan(x) {
    if (awalMention < 0) return;
    const pos = ta.selectionStart;
    const sisip = `@${x.username} `;
    ta.value = ta.value.slice(0, awalMention) + sisip + ta.value.slice(pos);
    const baru = awalMention + sisip.length;
    ta.setSelectionRange(baru, baru);
    tutupSaran();
    ta.focus();
  }

  ta.addEventListener('input', cekMention);
  ta.addEventListener('click', cekMention);
  ta.addEventListener('blur', () => setTimeout(tutupSaran, 150));
  ta.addEventListener('keydown', (e) => {
    if (!saran.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); aktif = (aktif + 1) % pilihan.length; gambarSaran(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); aktif = (aktif - 1 + pilihan.length) % pilihan.length; gambarSaran(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); sisipkan(pilihan[aktif]); return; }
      if (e.key === 'Escape') { e.preventDefault(); tutupSaran(); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });

  function gambarBerkas() {
    berkasDaftar.replaceChildren(...berkas.map((f, i) => h('span', { class: 'chip garis' }, ikon('lampiran'), f.name,
      h('button', { type: 'button', class: 'tombol polos kecil', 'aria-label': `Buang ${f.name}`, onclick: () => { berkas.splice(i, 1); gambarBerkas(); } }, '×'))));
  }
  inputBerkas.addEventListener('change', () => {
    for (const f of inputBerkas.files) {
      if (!mimeBerkas(f)) { toast(`Tipe berkas tidak diizinkan: ${f.name}`, 'galat'); continue; }
      if (f.size > BATAS_BERKAS) { toast(`${f.name} melebihi 25 MB`, 'galat'); continue; }
      berkas.push(f);
    }
    inputBerkas.value = '';
    gambarBerkas();
  });

  const form = h('form', { class: 'penyusun', onsubmit: async (e) => {
    e.preventDefault();
    const teks = ta.value;
    if (!teks.trim()) { ta.focus(); return; }
    tombolKirim.disabled = true;
    try {
      const ok = await opsi.kirim(teks, [...berkas]);
      if (ok !== false) { ta.value = ''; berkas.length = 0; gambarBerkas(); }
    } finally { tombolKirim.disabled = false; }
  } },
  saran, ta, berkasDaftar,
  h('div', { class: 'baris-aksi kanan' },
    opsi.bolehLampiran ? h('button', { type: 'button', class: 'tombol polos kecil', 'aria-label': 'Lampirkan berkas', onclick: () => inputBerkas.click() }, ikon('lampiran'), 'Lampiran') : null,
    inputBerkas,
    opsi.batal ? h('button', { type: 'button', class: 'tombol polos kecil', onclick: opsi.batal }, 'Batal') : null,
    tombolKirim));
  form.fokus = () => ta.focus();
  return form;
}
