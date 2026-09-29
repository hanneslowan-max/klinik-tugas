// State sesi bersama: profil (web_saya), hari libur, cache anggota & struktur.
import { rpc, pilih, klien } from './api.js';

export const sesi = {
  profil: null,        // hasil web_saya()
  libur: new Set(),    // 'YYYY-MM-DD'
  _anggota: null,
  _struktur: null,
  get member() { return this.profil && this.profil.member; },
  get owner() { return !!(this.profil && this.profil.owner); },
  get cermin() { return !!(this.profil && this.profil.mode === 'cermin'); },
  get hariIni() { return (this.profil && this.profil.hari_ini) || null; },
};

const pendengar = new Set();
export function dengarSesi(fn) { pendengar.add(fn); return () => pendengar.delete(fn); }
function kabari() { for (const fn of pendengar) { try { fn(sesi); } catch (e) { console.error(e); } } }

export async function muatProfil() {
  sesi.profil = await rpc('web_saya');
  kabari();
  return sesi.profil;
}

export async function muatLibur() {
  try {
    const rows = await pilih('hari_libur', (q) => q.select('tanggal'));
    sesi.libur = new Set(rows.map((r) => r.tanggal));
  } catch (e) {
    console.warn('hari libur tidak termuat', e);
  }
}

export async function anggota(segarkan = false) {
  if (!sesi._anggota || segarkan) sesi._anggota = await rpc('web_anggota');
  return sesi._anggota;
}
/** Anggota yang boleh di-assign / di-mention: aktif & bukan bot. */
export async function anggotaAktif() {
  return (await anggota()).filter((m) => m.aktif && m.role !== 'bot');
}

export async function struktur(segarkan = false) {
  if (!sesi._struktur || segarkan) sesi._struktur = await rpc('web_struktur');
  return sesi._struktur;
}

/** Semua list (datar) dari struktur, dengan label "Space › Folder › List". */
export async function semuaList(termasukArsip = false) {
  const s = await struktur();
  const hasil = [];
  for (const sp of s.spaces) {
    if (sp.archived && !termasukArsip) continue;
    for (const f of sp.folders) {
      if (f.archived && !termasukArsip) continue;
      for (const l of f.lists) {
        if (l.archived && !termasukArsip) continue;
        hasil.push({ ...l, space: sp, folder: f, label: `${sp.name} › ${f.hidden ? '' : `${f.name} › `}${l.name}` });
      }
    }
    for (const l of sp.lists) {
      if (l.archived && !termasukArsip) continue;
      hasil.push({ ...l, space: sp, folder: null, label: `${sp.name} › ${l.name}` });
    }
  }
  return hasil;
}

export function lupakanCache() {
  sesi._anggota = null;
  sesi._struktur = null;
}

export async function keluar() {
  try { await klien.auth.signOut(); } catch { /* abaikan */ }
  sesi.profil = null;
  lupakanCache();
  kabari();
}

/** Kartu terkunci (mode cermin + sumber ClickUp). */
export function terkunci(t) {
  return sesi.cermin && t && t.sumber === 'clickup';
}
