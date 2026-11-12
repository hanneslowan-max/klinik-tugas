#!/usr/bin/env bash
# Runner tes DB: jalankan tiap uji/db/NN_*.sql dengan psql ke DB lokal. Gagal → exit ≠ 0.
# Pakai: bash uji/db/jalankan.sh [pola-file] [--izinkan-remote]     (mis. bash uji/db/jalankan.sh 05)
# Syarat: stack Supabase lokal jalan + `supabase db reset` (migrasi + seed sintetis) sudah diterapkan.
# Penjaga (uji/penjaga.mjs): DB_URL selain 127.0.0.1/localhost/soket unix ditolak (exit 3) sebelum psql terhubung,
# kecuali --izinkan-remote atau UJI_IZINKAN_REMOTE=1; project produksi selalu ditolak.
set -u
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IZIN=(); POLA=""
for a in "$@"; do
  if [[ "$a" == --izinkan-remote ]]; then IZIN=(--izinkan-remote); else POLA="$a"; fi
done

command -v node >/dev/null || { echo "node tidak ditemukan (dibutuhkan penjaga uji/penjaga.mjs)"; exit 2; }
DB_URL="$DB_URL" node "$DIR/../penjaga.mjs" --suite "bash uji/db/jalankan.sh" --db DB_URL ${IZIN[@]+"${IZIN[@]}"} || exit $?
command -v psql >/dev/null || { echo "psql tidak ditemukan"; exit 2; }
psql "$DB_URL" -X -q -c "select 1" >/dev/null 2>&1 || { echo "DB tidak terjangkau: $DB_URL"; exit 2; }

gagal=0; total=0; berkas=0
for f in "$DIR"/[0-9][0-9]_*.sql; do
  nama="$(basename "$f")"
  [[ -n "$POLA" && "$nama" != *"$POLA"* ]] && continue
  berkas=$((berkas + 1))
  keluaran="$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1)"; rc=$?
  n="$(grep -c 'LULUS:' <<<"$keluaran")"
  total=$((total + n))
  if [[ $rc -eq 0 ]] && ! grep -q 'GAGAL:' <<<"$keluaran"; then
    printf 'LULUS  %-28s %3d cek\n' "$nama" "$n"
  else
    gagal=$((gagal + 1))
    printf 'GAGAL  %-28s %3d cek lulus sebelum berhenti (rc=%s)\n' "$nama" "$n" "$rc"
    grep -E 'GAGAL|ERROR' <<<"$keluaran" | head -5 | sed 's/^/       /'
  fi
done

echo "----"
echo "Berkas: $berkas · cek lulus: $total · berkas gagal: $gagal"
[[ $berkas -gt 0 && $gagal -eq 0 ]]
