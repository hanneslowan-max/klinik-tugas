// Admin (owner): anggota + login/reset password (Edge), status per list, struktur, hari libur, token API,
// mode cermin/utama, laporan sinkron. Semua tulis lewat web_admin_* (cek owner di DB) atau Edge /x/admin/*.
import { rpc, pilih, pesanGalat, edgeAdmin } from '../api.js';
import { sesi, anggota, struktur, semuaList, muatProfil, muatLibur, lupakanCache } from '../sesi.js';
import { h, kosongkan, toast, lembar, konfirmasi, salinTeks, avatar, fmtWaktu, fmtTanggalPanjang, labelPeran } from '../util.js';

const TAB = [
  ['anggota', 'Anggota'], ['status', 'Status list'], ['struktur', 'Struktur'], ['libur', 'Hari libur'],
  ['token', 'Token API'], ['mode', 'Mode'], ['sinkron', 'Sinkron'],
];

export async function tampil(ctx) {
  ctx.judul('Admin');
  let tab = TAB.some(([k]) => k === ctx.query.get('tab')) ? ctx.query.get('tab') : 'anggota';
  const isi = h('div', { class: 'admin-isi' });
  const baris = h('div', { class: 'chip-baris', role: 'tablist', 'aria-label': 'Bagian admin' });
  const gambarTab = () => {
    baris.replaceChildren(...TAB.map(([k, label]) => h('button', { type: 'button', role: 'tab', class: 'chip-pilih', 'aria-pressed': tab === k ? 'true' : 'false',
      'aria-selected': tab === k ? 'true' : 'false', 'data-tab': k, onclick: () => { tab = k; ctx.setQuery({ tab: k }); gambarTab(); buka(); } }, label)));
  };
  ctx.el.append(baris, isi);
  gambarTab();

  async function buka() {
    kosongkan(isi, h('p', { class: 'kosong', text: 'Memuat…' }));
    try {
      const fn = { anggota: tabAnggota, status: tabStatus, struktur: tabStruktur, libur: tabLibur, token: tabToken, mode: tabMode, sinkron: tabSinkron }[tab];
      await fn(isi);
    } catch (e) {
      kosongkan(isi, h('div', { class: 'kotak-galat', role: 'alert' }, pesanGalat(e)));
    }
  }
  await buka();
}

async function panggil(nama, args, pesan) {
  try {
    const r = await rpc(nama, args);
    if (pesan) toast(pesan, 'sukses', 2000);
    return r;
  } catch (e) {
    toast(pesanGalat(e), 'galat', 6000);
    return null;
  }
}

function bidang(label, input, ket) {
  return h('label', { class: 'bidang' }, h('span', { text: label }), input, ket ? h('div', { class: 'redup kecil', text: ket }) : null);
}

// ------------------------------------------------------------------ anggota
function sandiSementara() {
  const abjad = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const b = new Uint32Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => abjad[x % abjad.length]).join('');
}

async function tabAnggota(el) {
  const daftar = await anggota(true);
  kosongkan(el,
    h('div', { class: 'baris-aksi' }, h('p', { class: 'redup kecil spasi', text: `${daftar.length} anggota. Akun login dibuat owner (tanpa daftar mandiri).` }),
      h('button', { type: 'button', class: 'tombol utama kecil', 'data-uji': 'tambah-anggota', onclick: () => formAnggota(null, el) }, 'Tambah anggota')),
    h('ul', { class: 'daftar-tugas', 'data-uji': 'daftar-anggota' }, daftar.map((m) => h('li', { class: 'item-admin', 'data-anggota': m.username },
      avatar(m, true),
      h('div', { class: 'info' }, h('strong', { text: m.username }), m.nama && m.nama !== m.username ? h('span', { class: 'redup kecil', text: ` · ${m.nama}` }) : null,
        h('div', { class: 'sub' },
          h('span', { class: 'chip', text: labelPeran(m.role) }),
          !m.aktif ? h('span', { class: 'chip telat', text: 'nonaktif' }) : null,
          m.role !== 'bot' ? h('span', { class: `chip ${m.punya_akun ? 'selesai' : 'garis'}`, text: m.punya_akun ? 'bisa login' : 'belum ada login' }) : null,
          m.harus_ganti_password ? h('span', { class: 'chip hari-ini', text: 'wajib ganti password' }) : null,
          m.impor_clickup ? h('span', { class: 'chip garis', text: 'dari ClickUp' }) : null,
          m.email ? h('span', { text: m.email }) : null)),
      h('button', { type: 'button', class: 'tombol kecil', 'aria-label': `Ubah ${m.username}`, onclick: () => formAnggota(m, el) }, 'Ubah')))));
}

async function formAnggota(m, el) {
  const baru = !m;
  const f = {
    username: h('input', { type: 'text', value: m ? m.username : '', disabled: m && m.impor_clickup, required: true, autocomplete: 'off', name: 'username' }),
    nama: h('input', { type: 'text', value: m ? m.nama || '' : '', name: 'nama' }),
    email: h('input', { type: 'email', value: m ? m.email || '' : '', name: 'email', autocomplete: 'off' }),
    clickup_email: h('input', { type: 'email', value: m ? m.clickup_email || '' : '', name: 'clickup_email' }),
    initials: h('input', { type: 'text', value: m ? m.initials || '' : '', maxlength: 3, name: 'initials' }),
    color: h('input', { type: 'color', value: m && m.color ? m.color : '#7b68ee', name: 'color' }),
    role: h('select', { name: 'role' }, [['member', 'anggota'], ['owner', 'owner (admin penuh)'], ['bot', 'bot (token agent)']].map(([r, label]) =>
      h('option', { value: r, selected: (m ? m.role : 'member') === r, text: label }))),
    aktif: h('input', { type: 'checkbox', checked: m ? m.aktif : true, name: 'aktif' }),
  };
  const galat = h('div', { class: 'kotak-galat', hidden: true, role: 'alert' });
  const saya = Number(sesi.member.id);
  const aksiAkun = [];
  if (m && m.role !== 'bot' && m.aktif) {
    aksiAkun.push(h('button', { type: 'button', class: 'tombol kecil', 'data-uji': m.punya_akun ? 'reset-password' : 'aktifkan-login',
      onclick: async () => { const ok = await formAkun(m); if (ok) await tabAnggota(el); } },
    m.punya_akun ? 'Setel ulang password' : 'Aktifkan login'));
  }
  const r = await lembar({
    judul: baru ? 'Tambah anggota' : `Ubah ${m.username}`,
    isi: h('form', { onsubmit: (e) => e.preventDefault() },
      bidang('Username (dipakai untuk @mention & routine)', f.username, m && m.impor_clickup ? 'Username anggota dari ClickUp dikunci.' : 'Huruf kecil, mis. "nama depan".'),
      bidang('Nama lengkap', f.nama),
      bidang('Email login', f.email, 'Email untuk masuk ke aplikasi.'),
      bidang('Email ClickUp', f.clickup_email),
      h('div', { class: 'filter' }, bidang('Inisial', f.initials), bidang('Warna', f.color)),
      bidang('Peran', f.role, 'owner = admin penuh; anggota = anggota tim; bot = pemilik token routine/agent (tanpa login).'),
      h('label', { class: 'centang' }, f.aktif, 'Aktif'),
      m && Number(m.id) === saya ? h('p', { class: 'redup kecil', text: 'Anda tidak bisa menurunkan peran atau menonaktifkan diri sendiri.' }) : null,
      aksiAkun.length ? h('div', { class: 'baris-aksi' }, aksiAkun) : null,
      galat),
    aksi: [
      { label: 'Batal', nilai: null },
      { label: 'Simpan', kelas: 'utama', klik: async () => {
        galat.hidden = true;
        const p = { nama: f.nama.value, email: f.email.value, clickup_email: f.clickup_email.value, initials: f.initials.value,
          color: f.color.value, role: f.role.value, aktif: f.aktif.checked };
        if (!m || !m.impor_clickup) p.username = f.username.value.trim();
        if (m) p.id = m.id;
        try {
          const hasil = await rpc('web_admin_anggota_simpan', { p });
          toast(baru ? 'Anggota ditambahkan' : 'Anggota disimpan', 'sukses');
          return hasil;
        } catch (e) { galat.textContent = pesanGalat(e); galat.hidden = false; return false; }
      } },
    ],
  });
  if (r) { lupakanCache(); await tabAnggota(el); }
}

/** Aktifkan login / reset password lewat Edge /api/x/admin/akun|reset. Password sementara tampil sekali. */
async function formAkun(m) {
  const reset = m.punya_akun;
  const email = h('input', { type: 'email', value: m.email || '', required: true, name: 'email-login', disabled: reset });
  const sandi = h('input', { type: 'text', value: sandiSementara(), required: true, name: 'password-sementara', autocomplete: 'off', spellcheck: 'false' });
  const galat = h('div', { class: 'kotak-galat', hidden: true, role: 'alert' });
  const r = await lembar({
    judul: reset ? `Setel ulang password ${m.username}` : `Aktifkan login ${m.username}`,
    isi: h('form', { onsubmit: (e) => e.preventDefault() },
      h('p', { class: 'redup kecil', text: reset
        ? 'Password lama diganti password sementara. Anggota wajib menggantinya saat masuk berikutnya.'
        : 'Membuat akun login. Anggota wajib mengganti password sementara saat pertama masuk.' }),
      bidang('Email login', email),
      bidang('Password sementara (min. 8)', sandi, 'Berikan lewat jalur pribadi (WA/langsung), jangan di grup.'),
      galat),
    aksi: [
      { label: 'Batal', nilai: null },
      { label: reset ? 'Setel ulang password' : 'Aktifkan login', kelas: 'utama', klik: async () => {
        galat.hidden = true;
        if (!reset && !email.value.trim()) { galat.textContent = 'Email wajib diisi.'; galat.hidden = false; return false; }
        if (sandi.value.length < 8) { galat.textContent = 'Password sementara minimal 8 karakter.'; galat.hidden = false; return false; }
        try {
          if (reset) await edgeAdmin('reset', { member_id: m.id, password_sementara: sandi.value });
          else await edgeAdmin('akun', { member_id: m.id, email: email.value.trim(), password_sementara: sandi.value });
          return { email: reset ? m.email : email.value.trim(), sandi: sandi.value };
        } catch (e) {
          galat.textContent = e.hint === 'EDGE_TIDAK_ADA' ? `${e.message} Hubungi pengelola aplikasi.` : pesanGalat(e);
          galat.hidden = false;
          return false;
        }
      } },
    ],
  });
  if (!r) return false;
  lupakanCache();
  await lembar({
    judul: 'Password sementara',
    isi: h('div', { 'data-uji': 'hasil-akun' },
      h('p', { text: `Login ${m.username}: ${r.email}` }),
      h('div', { class: 'token-tampil', 'data-uji': 'sandi-sementara' }, r.sandi),
      h('p', { class: 'kotak-peringatan kecil', text: 'Password ini hanya tampil sekali. Anggota diminta menggantinya saat masuk.' })),
    aksi: [{ label: 'Salin', klik: async () => { await salinTeks(r.sandi); return false; } }, { label: 'Selesai', kelas: 'utama' }],
  });
  return true;
}

// ------------------------------------------------------------------ status per list
// nilai = tipe status ClickUp (open/custom/done/closed); label Indonesia
const TIPE_STATUS = [['open', 'Awal (open)'], ['custom', 'Proses (custom)'], ['done', 'Selesai (done)'], ['closed', 'Ditutup (closed)']];

async function tabStatus(el) {
  const lists = await semuaList(true);
  const pilihL = h('select', { 'aria-label': 'Pilih list', 'data-uji': 'status-pilih-list' }, h('option', { value: '', text: '— pilih list —' }),
    lists.map((l) => h('option', { value: l.id, text: l.label })));
  const editor = h('div');
  kosongkan(el, bidang('List', pilihL), editor);
  pilihL.addEventListener('change', () => gambarEditor());

  function gambarEditor() {
    const l = lists.find((x) => x.id === pilihL.value);
    if (!l) { kosongkan(editor); return; }
    const kunci = sesi.cermin && l.sumber === 'clickup';
    const rows = [...l.statuses].sort((a, b) => a.orderindex - b.orderindex).map((s) => ({ ...s, nama_lama: s.status }));
    const galat = h('div', { class: 'kotak-galat', hidden: true, role: 'alert' });
    const wadah = h('div');
    const gambarBaris = () => {
      kosongkan(wadah, rows.map((s, i) => {
        const nama = h('input', { type: 'text', value: s.status, 'aria-label': 'Nama status', disabled: kunci });
        nama.addEventListener('input', () => { s.status = nama.value; });
        const tipe = h('select', { 'aria-label': 'Tipe status', disabled: kunci }, TIPE_STATUS.map(([t, label]) => h('option', { value: t, selected: s.type === t, text: label })));
        tipe.addEventListener('change', () => { s.type = tipe.value; });
        const warna = h('input', { type: 'color', value: s.color || '#d3d3d3', 'aria-label': 'Warna', disabled: kunci });
        warna.addEventListener('input', () => { s.color = warna.value; });
        return h('div', { class: 'status-edit' }, warna, nama, tipe,
          kunci ? null : h('div', { class: 'tombol-baris' },
            h('button', { type: 'button', class: 'tombol kecil', disabled: i === 0, 'aria-label': 'Naik', onclick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; gambarBaris(); } }, '↑'),
            h('button', { type: 'button', class: 'tombol kecil', disabled: i === rows.length - 1, 'aria-label': 'Turun', onclick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; gambarBaris(); } }, '↓'),
            h('button', { type: 'button', class: 'tombol kecil bahaya', 'aria-label': 'Buang status', onclick: () => { rows.splice(i, 1); gambarBaris(); } }, 'Buang')));
      }));
    };
    gambarBaris();
    kosongkan(editor,
      kunci ? h('div', { class: 'kotak-cermin', text: 'List ClickUp: status hanya-baca selama mode cermin (ikut sinkron).' }) : null,
      h('p', { class: 'redup kecil', text: 'Wajib ≥1 status bertipe Awal dan ≥1 bertipe Ditutup. Status yang masih dipakai tugas tidak bisa dibuang (pindahkan tugasnya dulu). Ganti nama = tugas ikut; nama disimpan huruf kecil.' }),
      wadah, galat,
      kunci ? null : h('div', { class: 'baris-aksi' },
        h('button', { type: 'button', class: 'tombol kecil', onclick: () => { rows.push({ status: 'status baru', type: 'custom', color: '#a0a0a0', nama_lama: null }); gambarBaris(); } }, 'Tambah status'),
        h('span', { class: 'spasi' }),
        h('button', { type: 'button', class: 'tombol utama kecil', onclick: async () => {
          galat.hidden = true;
          const payload = rows.map((s, i) => ({ status: s.status.trim(), type: s.type, color: s.color, orderindex: i, ...(s.nama_lama ? { nama_lama: s.nama_lama } : {}) }));
          try {
            await rpc('web_admin_status_simpan', { p_list: l.id, p_statuses: payload });
            toast('Status disimpan', 'sukses');
            lupakanCache();
            await tabStatus(el);
          } catch (e) { galat.textContent = pesanGalat(e); galat.hidden = false; }
        } }, 'Simpan status')));
  }
}

// ------------------------------------------------------------------ struktur
async function tabStruktur(el) {
  const s = await struktur(true);
  const baris = (jenis, x, sub) => h('li', { class: 'item-admin', 'data-struktur': x.id },
    h('div', { class: 'info' }, h('strong', { text: x.name }),
      h('div', { class: 'sub' }, h('span', { class: 'chip', text: jenis }),
        x.sumber === 'clickup' ? h('span', { class: 'chip garis', text: 'ClickUp' }) : null,
        x.archived ? h('span', { class: 'chip garis', text: 'arsip' }) : null,
        x.hidden ? h('span', { class: 'chip garis', text: 'tersembunyi' }) : null,
        x.tidak_ditagih ? h('span', { class: 'chip hari-ini', text: 'tidak ditagih' }) : null, sub)),
    h('button', { type: 'button', class: 'tombol kecil', onclick: () => formStruktur(jenis, x, s, el) }, 'Ubah'));
  kosongkan(el,
    h('div', { class: 'baris-aksi' },
      h('button', { type: 'button', class: 'tombol kecil', onclick: () => formStruktur('space', null, s, el) }, '+ Space'),
      h('button', { type: 'button', class: 'tombol kecil', onclick: () => formStruktur('folder', null, s, el) }, '+ Folder'),
      h('button', { type: 'button', class: 'tombol kecil', 'data-uji': 'tambah-list', onclick: () => formStruktur('list', null, s, el) }, '+ List')),
    sesi.cermin ? h('p', { class: 'kotak-cermin kecil', text: 'Mode cermin: struktur ClickUp hanya-baca, kecuali tanda "tidak ditagih" pada list.' }) : null,
    s.spaces.map((sp) => h('section', { class: 'kartu' },
      h('ul', { class: 'daftar-tugas' }, baris('space', sp),
        sp.folders.map((f) => [baris('folder', f), f.lists.map((l) => baris('list', l, h('span', { text: `di ${f.name}` })))]),
        sp.lists.map((l) => baris('list', l, h('span', { text: 'tanpa folder' })))))));
}

async function formStruktur(jenis, x, s, el) {
  const baru = !x;
  const kunciCu = sesi.cermin && x && x.sumber === 'clickup';
  const nama = h('input', { type: 'text', value: x ? x.name : '', required: true, disabled: kunciCu, name: 'nama' });
  const arsip = h('input', { type: 'checkbox', checked: x ? x.archived : false, disabled: kunciCu });
  const tersembunyi = h('input', { type: 'checkbox', checked: x ? !!x.hidden : false, disabled: kunciCu });
  const privat = h('input', { type: 'checkbox', checked: x ? !!x.private : false, disabled: kunciCu });
  const ditagih = h('input', { type: 'checkbox', checked: x ? !!x.tidak_ditagih : false });
  const spaceSel = h('select', { name: 'space' }, s.spaces.map((sp) => h('option', { value: sp.id, text: sp.name })));
  const folderSel = h('select', { name: 'folder' });
  const isiFolder = () => {
    const sp = s.spaces.find((z) => z.id === spaceSel.value);
    folderSel.replaceChildren(h('option', { value: '', text: '— tanpa folder —' }), ...(sp ? sp.folders : []).map((f) => h('option', { value: f.id, text: f.name })));
  };
  spaceSel.addEventListener('change', isiFolder);
  isiFolder();
  const galat = h('div', { class: 'kotak-galat', hidden: true, role: 'alert' });
  const r = await lembar({
    judul: `${baru ? 'Tambah' : 'Ubah'} ${jenis}`,
    isi: h('form', { onsubmit: (e) => e.preventDefault() },
      kunciCu ? h('div', { class: 'kotak-cermin kecil', text: 'Struktur ClickUp: hanya "tidak ditagih" yang bisa diubah selama mode cermin.' }) : null,
      bidang('Nama', nama),
      baru && jenis !== 'space' ? bidang('Space', spaceSel) : null,
      baru && jenis === 'list' ? bidang('Folder', folderSel) : null,
      jenis === 'space' ? h('label', { class: 'centang' }, privat, 'Privat') : null,
      jenis === 'folder' ? h('label', { class: 'centang' }, tersembunyi, 'Tersembunyi') : null,
      jenis === 'list' ? h('label', { class: 'centang' }, ditagih, 'Tidak ditagih (tidak masuk TENGGAT/B5)') : null,
      !baru ? h('label', { class: 'centang' }, arsip, 'Diarsip') : null,
      galat),
    aksi: [
      { label: 'Batal', nilai: null },
      { label: 'Simpan', kelas: 'utama', klik: async () => {
        galat.hidden = true;
        const p = { jenis };
        if (x) p.id = x.id;
        if (!kunciCu) {
          p.name = nama.value.trim();
          if (!baru) p.archived = arsip.checked;
          if (jenis === 'space') p.private = privat.checked;
          if (jenis === 'folder') p.hidden = tersembunyi.checked;
        }
        if (jenis === 'list') p.tidak_ditagih = ditagih.checked;
        if (baru && jenis !== 'space') p.space_id = spaceSel.value;
        if (baru && jenis === 'list' && folderSel.value) p.folder_id = folderSel.value;
        try { return await rpc('web_admin_struktur_simpan', { p }); } catch (e) { galat.textContent = pesanGalat(e); galat.hidden = false; return false; }
      } },
    ],
  });
  if (r) { toast('Struktur disimpan', 'sukses'); lupakanCache(); await tabStruktur(el); }
}

// ------------------------------------------------------------------ hari libur
async function tabLibur(el) {
  const rows = await pilih('hari_libur', (q) => q.select('tanggal,nama').order('tanggal'));
  const tgl = h('input', { type: 'date', required: true, name: 'tanggal' });
  const nama = h('input', { type: 'text', required: true, placeholder: 'mis. Maulid Nabi', name: 'nama-libur' });
  const galat = h('div', { class: 'kotak-galat', hidden: true, role: 'alert' });
  kosongkan(el,
    h('p', { class: 'redup kecil', text: 'Hari libur mengurangi hitungan hari kerja (≤3 hari kerja, TENGGAT, sisa hk).' }),
    h('form', { class: 'kartu', onsubmit: async (e) => {
      e.preventDefault();
      galat.hidden = true;
      if (!tgl.value || !nama.value.trim()) { galat.textContent = 'Isi tanggal dan nama.'; galat.hidden = false; return; }
      try {
        await rpc('web_admin_libur_simpan', { p: { tanggal: tgl.value, nama: nama.value.trim() } });
        toast('Hari libur disimpan', 'sukses');
        await muatLibur();
        await tabLibur(el);
      } catch (err) { galat.textContent = pesanGalat(err); galat.hidden = false; }
    } }, h('div', { class: 'filter' }, bidang('Tanggal', tgl), bidang('Nama', nama)), galat,
    h('button', { type: 'submit', class: 'tombol utama kecil' }, 'Tambah hari libur')),
    rows.length ? h('ul', { class: 'daftar-tugas' }, rows.map((r) => h('li', { class: 'item-admin' },
      h('div', { class: 'info' }, h('strong', { text: r.nama }), h('div', { class: 'sub', text: fmtTanggalPanjang(r.tanggal) })),
      h('button', { type: 'button', class: 'tombol kecil bahaya', onclick: async () => {
        if (!await konfirmasi(`Hapus hari libur ${r.nama} (${fmtTanggalPanjang(r.tanggal)})?`, { ya: 'Hapus', bahaya: true })) return;
        if (await panggil('web_admin_libur_simpan', { p: { tanggal: r.tanggal, hapus: true } }, 'Dihapus')) { await muatLibur(); await tabLibur(el); }
      } }, 'Hapus'))))
      : h('p', { class: 'kosong', text: 'Belum ada hari libur.' }));
}

// ------------------------------------------------------------------ token API
async function tabToken(el) {
  const [tokens, daftar] = await Promise.all([rpc('web_admin_tokens'), anggota(true)]);
  const aktif = daftar.filter((m) => m.aktif);
  const member = h('select', { name: 'token-anggota' }, aktif.map((m) => h('option', { value: String(m.id), selected: m.role === 'bot', text: `${m.username} (${labelPeran(m.role)})` })));
  const nama = h('input', { type: 'text', placeholder: 'mis. routine digest pagi', name: 'token-nama' });
  const scope = h('select', { name: 'token-scope' },
    h('option', { value: 'baca', text: 'baca (hanya membaca)' }), h('option', { value: 'tulis', text: 'tulis (baca + buat/ubah)' }), h('option', { value: 'impor', text: 'impor (khusus sinkron ClickUp)' }));
  const galat = h('div', { class: 'kotak-galat', hidden: true, role: 'alert' });
  kosongkan(el,
    h('form', { class: 'kartu', onsubmit: async (e) => {
      e.preventDefault();
      galat.hidden = true;
      if (!nama.value.trim()) { galat.textContent = 'Nama token wajib diisi.'; galat.hidden = false; return; }
      try {
        const r = await rpc('web_admin_token_buat', { p_member: Number(member.value), p_nama: nama.value.trim(), p_scope: scope.value });
        await lembar({
          judul: 'Token baru',
          isi: h('div', { 'data-uji': 'token-baru' },
            h('p', { class: 'kotak-peringatan kecil', text: 'Salin sekarang. Token ini hanya tampil SEKALI dan tidak bisa dilihat lagi.' }),
            h('div', { class: 'token-tampil', 'data-uji': 'token-mentah' }, r.token),
            h('p', { class: 'redup kecil', text: `${r.nama} · hak ${r.scope} · awalan ${r.prefix}` })),
          aksi: [{ label: 'Salin', klik: async () => { await salinTeks(r.token); return false; } }, { label: 'Sudah disalin', kelas: 'utama' }],
        });
        await tabToken(el);
      } catch (err) { galat.textContent = pesanGalat(err); galat.hidden = false; }
    } },
    h('h3', { text: 'Buat token' }), bidang('Anggota', member), bidang('Nama', nama), bidang('Hak akses', scope, 'Routine: baca. Sesi interaktif agent: tulis (tanpa hapus). Hapus hanya token owner.'), galat,
    h('button', { type: 'submit', class: 'tombol utama kecil', 'data-uji': 'buat-token' }, 'Buat token')),
    tokens.length ? h('ul', { class: 'daftar-tugas', 'data-uji': 'daftar-token' }, tokens.map((k) => h('li', { class: 'item-admin', 'data-token': k.prefix },
      h('div', { class: 'info' }, h('strong', { text: k.nama }),
        h('div', { class: 'sub' }, h('code', { text: `${k.prefix}…` }), h('span', { class: 'chip', text: k.scope }), h('span', { text: k.member.username }),
          k.revoked_at ? h('span', { class: 'chip telat', text: `dicabut ${fmtWaktu(k.revoked_at)}` }) : null,
          h('span', { text: k.last_used_at ? `dipakai ${fmtWaktu(k.last_used_at)}` : 'belum dipakai' }))),
      k.revoked_at ? null : h('button', { type: 'button', class: 'tombol kecil bahaya', onclick: async () => {
        if (!await konfirmasi(`Cabut token "${k.nama}" (${k.prefix}…)? Routine/agent yang memakainya langsung ditolak.`, { ya: 'Cabut', bahaya: true })) return;
        if (await panggil('web_admin_token_cabut', { p_id: k.id }, 'Token dicabut')) await tabToken(el);
      } }, 'Cabut'))))
      : h('p', { class: 'kosong', text: 'Belum ada token.' }));
}

// ------------------------------------------------------------------ mode
async function tabMode(el) {
  await muatProfil();
  const mode = sesi.profil.mode;
  const target = mode === 'cermin' ? 'utama' : 'cermin';
  kosongkan(el,
    h('div', { class: 'kartu' },
      h('p', {}, 'Mode sekarang: ', h('strong', { 'data-uji': 'mode-sekarang', text: mode })),
      h('ul', { class: 'kecil' },
        h('li', { text: 'cermin = masa paralel: data dari ClickUp hanya-baca di aplikasi; sinkron harian memperbarui.' }),
        h('li', { text: 'utama = setelah cutover: aplikasi jadi sumber utama; semua kartu bisa diubah.' })),
      h('button', { type: 'button', class: `tombol ${target === 'utama' ? 'bahaya' : ''}`, 'data-uji': 'ganti-mode', onclick: async () => {
        const pesan = target === 'utama'
          ? 'Pindah ke mode UTAMA? Lakukan hanya saat cutover (setelah sinkron akhir & hitungan selisih 0). Kartu ClickUp jadi bisa diubah di aplikasi.'
          : 'Kembali ke mode CERMIN? Kartu ClickUp kembali hanya-baca.';
        if (!await konfirmasi(pesan, { judul: 'Ganti mode', ya: `Ya, mode ${target}`, bahaya: target === 'utama' })) return;
        if (await panggil('web_admin_mode', { p_mode: target }, `Mode: ${target}`)) { await muatProfil(); await tabMode(el); }
      } }, `Pindah ke mode ${target}`)));
}

// ------------------------------------------------------------------ sinkron
// counts dari impor/sinkron.mjs (runSelesai): jumlah (tugas/komentar/anggota/list), tulis {entitas: {inserted, updated,
// unchanged, gagal, …}}, lampiran {ok, gagal, …}, hilang {entitas: {ditandai, ids}} | teks, clickup {permintaan, r429, …},
// space_privat [..], muat, only, durasi_detik. Semua ditampilkan sebagai tabel berbahasa Indonesia; kunci yang belum
// dikenal tetap tampil dengan label yang dirapikan (tidak pernah "[object Object]").
const NAMA_ENTITAS = {
  tasks: 'Tugas', lists: 'List', spaces: 'Space', folders: 'Folder', members: 'Anggota', comments: 'Komentar',
  attachments: 'Lampiran', list_statuses: 'Status list', space_anggota: 'Anggota space privat', workspace: 'Ruang kerja',
  sync_raw: 'Arsip data mentah', tags: 'Label', checklists: 'Checklist',
};
const NAMA_KOLOM = {
  inserted: 'Baru', updated: 'Diubah', unchanged: 'Tetap', ditambah: 'Ditambah', dibuang: 'Dibuang', dihapus: 'Dihapus',
  gagal: 'Gagal', ditandai: 'Ditandai hilang', ok: 'Tersalin', sudah_ada: 'Sudah ada', tautan_saja: 'Hanya tautan',
  dilewati: 'Dilewati',
};
// kolom utama tabel entitas; kunci angka lain (ditambah/dibuang/dihapus …) digabung ke kolom "Lainnya"
const KOLOM_UTAMA = ['inserted', 'updated', 'unchanged', 'ditandai', 'gagal'];
const URUT_LAIN = ['ditambah', 'dibuang', 'dihapus'];
const urutLain = (a, b) => ((URUT_LAIN.indexOf(a) + 1 || 99) - (URUT_LAIN.indexOf(b) + 1 || 99)) || a.localeCompare(b);
// ukuran sensus (KUNCI_SENSUS impor/sinkron.mjs) & fase galat importer
const NAMA_SENSUS = {
  '(list)': 'List', tasks_total: 'Jumlah tugas', open: 'Tugas terbuka', closed: 'Tugas selesai', archived: 'Tugas diarsip',
  subtasks: 'Sub-tugas', comments_top: 'Komentar', replies: 'Balasan', reply_count_sum: 'Jumlah balasan (hitungan ClickUp)',
  attachments_task: 'Lampiran tugas', attachments_comment: 'Lampiran komentar', assignee_links: 'Penugasan',
  sha_ids_tasks: 'Sidik ID tugas', sha_ids_comments: 'Sidik ID komentar',
};
const NAMA_FASE = {
  fatal: 'fatal', email_anggota: 'email anggota', space_anggota: 'anggota space', anggota_list: 'anggota list',
  time_in_status: 'riwayat status', tugas_detail: 'detail tugas', lampiran: 'lampiran',
};
const NAMA_UKURAN = {
  muat: 'Jenis muat', only: 'Cakupan', list: 'List', tugas: 'Tugas', komentar: 'Komentar', anggota: 'Anggota',
  anggota_nonaktif: 'Anggota nonaktif', durasi_detik: 'Durasi', lampiran: 'Lampiran',
  permintaan: 'Permintaan ke ClickUp', r429: 'Kena batas (HTTP 429)', ulang: 'Permintaan diulang', unduh: 'Berkas diunduh',
  tunggu_ms: 'Waktu tunggu batas', rpm: 'Batas per menit',
};
const NILAI_MUAT = { sinkron: 'sinkron (perbarui data)', impor: 'impor awal' };
const rapikan = (k) => { const t = String(k).replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const labelDari = (peta, k) => peta[k] || rapikan(k);
const angka = (v) => (typeof v === 'number' ? v.toLocaleString('id-ID') : v);

/** Nilai apa pun → teks pendek berbahasa Indonesia (objek → "Label n · Label n", array → jumlah butir). */
function teksNilai(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak';
  if (typeof v === 'number') return angka(v);
  if (Array.isArray(v)) return `${angka(v.length)} butir`;
  if (typeof v === 'object') {
    return Object.entries(v).map(([k, x]) => `${labelDari({ ...NAMA_KOLOM, ...NAMA_UKURAN, ...NAMA_ENTITAS }, k)} ${teksNilai(x)}`).join(' · ') || '—';
  }
  return String(v);
}

/**
 * Tabel: kolom pertama = label baris (th); kolom angka rata kanan (kolomAngka = true/false atau array per kolom sesudah
 * kolom pertama); sel {buruk, n} = angka bermasalah (merah).
 */
function tabelAngka(kepala, baris, uji, { kolomAngka = true } = {}) {
  const angkaKah = (i) => (Array.isArray(kolomAngka) ? !!kolomAngka[i] : kolomAngka);
  return h('div', { class: 'tabel-gulir' }, h('table', { class: 'tabel-angka', 'data-uji': uji },
    h('thead', {}, h('tr', {}, kepala.map((k, i) => h('th', { scope: 'col', class: i && angkaKah(i - 1) ? 'angka' : null, text: k })))),
    h('tbody', {}, baris.map((b) => h('tr', {}, h('th', { scope: 'row', text: b[0] }), b.slice(1).map((sel, i) => {
      const buruk = !!(sel && typeof sel === 'object' && sel.buruk);
      const n = buruk ? sel.n : sel;
      const kelas = [typeof n === 'number' && angkaKah(i) ? 'angka' : null, n === 0 ? 'nol' : null, buruk ? 'buruk' : null].filter(Boolean).join(' ');
      return h('td', { class: kelas || null, text: teksNilai(n) });
    }))))));
}

/** {entitas: {kolom: n}} → tabel Entitas × kolom utama (Baru/Diubah/Tetap/Ditandai/Gagal) + "Lainnya" (teks). */
function tabelEntitas(obj, uji, judulKolom = 'Data') {
  const rows = Object.entries(obj || {}).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
  if (!rows.length) return null;
  const angkaDari = (v) => Object.keys(v).filter((k) => k !== 'ids' && (typeof v[k] === 'number' || v[k] === null));
  const semua = new Set(rows.flatMap(([, v]) => angkaDari(v)));
  const utama = KOLOM_UTAMA.filter((k) => semua.has(k));
  const adaLain = [...semua].some((k) => !utama.includes(k));
  return tabelAngka([judulKolom, ...utama.map((k) => labelDari(NAMA_KOLOM, k)), ...(adaLain ? ['Lainnya'] : [])],
    rows.map(([e, v]) => {
      const lain = angkaDari(v).filter((k) => !utama.includes(k) && v[k]).sort(urutLain).map((k) => `${labelDari(NAMA_KOLOM, k)} ${angka(v[k])}`);
      return [labelDari(NAMA_ENTITAS, e), ...utama.map((k) => {
        const n = v[k] ?? 0;
        return (k === 'gagal' || k === 'ditandai') && n > 0 ? { buruk: true, n } : n;
      }), ...(adaLain ? [lain.join(' · ') || '—'] : [])];
    }), uji, { kolomAngka: [...utama.map(() => true), false] });
}

const objekAngka = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).length > 0
  && Object.values(v).every((n) => typeof n === 'number' || n === null);

function ringkasanRun(c) {
  const baris = [];
  const dipakai = new Set(['tulis', 'lampiran', 'hilang', 'clickup', 'space_privat']);
  const tambah = (k, nilai) => { if (k in c) { baris.push([labelDari(NAMA_UKURAN, k), nilai]); dipakai.add(k); } };
  tambah('muat', NILAI_MUAT[c.muat] || c.muat || '—');
  tambah('only', Array.isArray(c.only) && c.only.length ? `${angka(c.only.length)} list terpilih (${c.only.join(', ')})` : 'semua list');
  for (const k of ['list', 'tugas', 'komentar', 'anggota', 'anggota_nonaktif']) tambah(k, c[k]);
  if (typeof c.lampiran === 'number') { baris.push(['Lampiran', c.lampiran]); }
  tambah('durasi_detik', typeof c.durasi_detik === 'number' ? `${angka(c.durasi_detik)} detik` : c.durasi_detik);
  // kunci lain yang belum dikenal: tetap ditampilkan (teks), tanpa [object Object]; objek angka ditabelkan di bawah
  for (const [k, v] of Object.entries(c)) {
    if (dipakai.has(k) || objekAngka(v)) continue;
    baris.push([labelDari({ ...NAMA_UKURAN, ...NAMA_ENTITAS }, k), v]);
  }
  return baris;
}

function nodeRun(x, terbuka) {
  const c = x.counts && typeof x.counts === 'object' ? x.counts : {};
  const galat = Array.isArray(x.errors) ? x.errors : [];
  const selisih = Array.isArray(x.diffs) ? x.diffs : (x.diffs && Array.isArray(x.diffs.selisih) ? x.diffs.selisih : []);
  const bagian = [];
  const ringkas = ringkasanRun(c);
  if (ringkas.length) bagian.push(h('h4', { text: 'Ringkasan' }), tabelAngka(['Ukuran', 'Nilai'], ringkas, 'sinkron-ringkasan', { kolomAngka: false }));
  // entitas di level atas (bentuk lama/seed: {"tasks": {"inserted": …}})
  const entitasAtas = Object.fromEntries(Object.entries(c).filter(([k, v]) => !['tulis', 'hilang', 'lampiran', 'clickup'].includes(k) && objekAngka(v)));
  const tulis = { ...entitasAtas, ...(c.tulis && typeof c.tulis === 'object' ? c.tulis : {}) };
  const tTulis = tabelEntitas(tulis, 'sinkron-tulis');
  if (tTulis) bagian.push(h('h4', { text: 'Data ditulis ke aplikasi' }), tTulis);
  if (c.lampiran && typeof c.lampiran === 'object') {
    bagian.push(h('h4', { text: 'Salin lampiran' }), tabelAngka(['Hasil', 'Jumlah'], Object.entries(c.lampiran).map(([k, v]) =>
      [labelDari(NAMA_KOLOM, k), k === 'gagal' && v > 0 ? { buruk: true, n: v } : v]), 'sinkron-lampiran'));
  }
  if (typeof c.hilang === 'string') bagian.push(h('h4', { text: 'Ditandai hilang di ClickUp' }), h('p', { class: 'kecil', text: c.hilang }));
  else if (c.hilang && typeof c.hilang === 'object') {
    const t = tabelEntitas(c.hilang, 'sinkron-hilang');
    if (t) bagian.push(h('h4', { text: 'Ditandai hilang di ClickUp' }), t);
  }
  if (Array.isArray(c.space_privat) && c.space_privat.length) {
    bagian.push(h('h4', { text: 'Anggota space privat' }), tabelAngka(['Space', 'List dibaca', 'Anggota', 'Hasil'],
      c.space_privat.map((sp) => [String(sp.space_id ?? '—'), sp.list ?? 0, sp.anggota ?? 0, sp.ok === false ? 'tidak lengkap (tidak dikirim)' : 'ok']),
      'sinkron-space', { kolomAngka: [true, true, false] }));
  }
  if (c.clickup && typeof c.clickup === 'object' && Object.keys(c.clickup).length) {
    bagian.push(h('h4', { text: 'Pemakaian API ClickUp' }), tabelAngka(['Ukuran', 'Nilai'], Object.entries(c.clickup).map(([k, v]) =>
      [labelDari(NAMA_UKURAN, k), k === 'tunggu_ms' && typeof v === 'number' ? `${(v / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} detik`
        : k === 'r429' && v > 0 ? { buruk: true, n: v } : v]), 'sinkron-clickup', { kolomAngka: false }));
  }
  if (galat.length) {
    // pesan galat = log teknis importer apa adanya (bisa berisi path API ClickUp); konteksnya diberi label Indonesia
    bagian.push(h('h4', { text: `Galat (${galat.length})` }), h('ul', { class: 'kecil', 'data-uji': 'sinkron-galat' }, galat.slice(0, 20).map((g) => {
      if (!g || typeof g !== 'object') return h('li', { class: 'teks-log', text: String(g) });
      const konteks = [g.task_id ? `tugas ${g.task_id}` : null, g.fase ? `tahap ${labelDari(NAMA_FASE, g.fase).toLowerCase()}` : null,
        g.status ? `HTTP ${g.status}` : null].filter(Boolean).join(' · ');
      return h('li', {}, konteks ? `${konteks}: ` : null, h('span', { class: 'teks-log', text: g.err || g.message || 'tanpa pesan' }));
    })), galat.length > 20 ? h('p', { class: 'redup kecil', text: `… ${galat.length - 20} galat lain ada di rincian teknis.` }) : null);
  }
  if (selisih.length) {
    const baris = selisih.slice(0, 50).map((d) => (d && typeof d === 'object'
      ? [String(d.list_id ?? '—'), labelDari(NAMA_SENSUS, d.kunci ?? '—'), d.clickup ?? '—', d.db ?? '—']
      : [String(d), '—', '—', '—']));
    bagian.push(h('h4', { text: `Selisih sensus (${selisih.length})` }),
      tabelAngka(['List', 'Ukuran', 'ClickUp', 'Aplikasi'], baris.map((b) => [b[0], b[1], typeof b[2] === 'string' && b[2].length > 16 ? `${b[2].slice(0, 12)}…` : b[2],
        typeof b[3] === 'string' && b[3].length > 16 ? `${b[3].slice(0, 12)}…` : b[3]]), 'sinkron-selisih', { kolomAngka: false }),
      selisih.length > 50 ? h('p', { class: 'redup kecil', text: `… ${selisih.length - 50} selisih lain ada di rincian teknis.` }) : null);
  }
  if (!bagian.length) bagian.push(h('p', { class: 'redup kecil', text: 'Run ini tidak mencatat hitungan.' }));
  return h('li', { class: 'kartu', 'data-run': x.id },
    h('details', { class: 'run-sinkron', open: terbuka },
      h('summary', {},
        h('strong', { text: `#${x.id} · ${x.mode === 'uji' ? 'uji (tanpa tandai hilang)' : x.mode}` }),
        galat.length ? h('span', { class: 'chip telat', text: `${galat.length} galat` }) : h('span', { class: 'chip selesai', text: '0 galat' }),
        h('span', { class: `chip ${selisih.length ? 'hari-ini' : 'selesai'}`, text: `${selisih.length} selisih` }),
        h('span', { class: 'waktu-run', text: `Mulai ${fmtWaktu(x.started_at)} · ${x.finished_at ? `selesai ${fmtWaktu(x.finished_at)}` : 'belum selesai'}` })),
      bagian,
      h('details', { class: 'lipat-sentuh' }, h('summary', { text: 'Rincian teknis (JSON)' }),
        h('pre', { class: 'json', text: JSON.stringify({ counts: x.counts, census: x.census, diffs: x.diffs, errors: x.errors }, null, 2) }))));
}

async function tabSinkron(el) {
  const r = await rpc('web_admin_sinkron');
  kosongkan(el,
    h('p', { class: 'redup kecil', text: `Mode: ${r.mode}. Sinkron otomatis dijalankan GitHub Actions (05:45 WIB); pemicu manual ada di Actions. Run terbaru terbuka; ketuk run lain untuk melihat hitungannya.` }),
    r.runs.length ? h('ul', { class: 'daftar-tugas', 'data-uji': 'daftar-sinkron' }, r.runs.map((x, i) => nodeRun(x, i === 0)))
      : h('p', { class: 'kosong', text: 'Belum ada run sinkron.' }));
}
