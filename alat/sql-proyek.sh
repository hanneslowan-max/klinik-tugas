#!/usr/bin/env bash
# Alat deploy/bootstrap project Supabase rhj-tugas ("RHJ ClickUp", ref admhlyurfvodfyedgaio, Sydney) lewat
# Management API (HTTPS). Dipakai dari sesi cloud yang tidak bisa membuka koneksi Postgres langsung
# (`supabase db push` macet karena hanya HTTPS yang lewat proxy).
#
# HANYA project di atas: ref lain ditolak, jadi project ERP (akun lama) tidak bisa tersentuh.
# Butuh env SUPABASE_ACCESS_TOKEN (PAT akun baru) dan SUPABASE_PROJECT_REF (harus = ref di atas).
#
#   bash alat/sql-proyek.sh --migrasi
#       Terapkan migrasi supabase/migrations/*.sql yang belum tercatat di supabase_migrations.schema_migrations,
#       urut nama berkas, satu transaksi per berkas (berkas + catatan versinya). Seed TIDAK pernah dikirim.
#   bash alat/sql-proyek.sh --akun <member_id> <email>
#       Langkah 6: buat akun login anggota (GoTrue admin, email terkonfirmasi) dengan password ACAK yang tidak
#       pernah ditampilkan/disimpan, lalu hubungkan lewat public.x_admin_akun (aktor = owner, harus_ganti_password
#       = true). Password sementara dibuat owner nanti lewat Admin → Reset.
#   bash alat/sql-proyek.sh <berkas.sql> [berkas-keluaran]
#       Jalankan satu berkas SQL. Hasil ke stdout, atau ke [berkas-keluaran] (mode 600, isi tidak dicetak) bila
#       hasilnya rahasia (mis. token dari web_admin_token_buat).
set -euo pipefail

REF_SAH="admhlyurfvodfyedgaio"
OWNER_ID=312823267

[ "${SUPABASE_PROJECT_REF:-}" = "$REF_SAH" ] || { echo "Tolak: SUPABASE_PROJECT_REF bukan $REF_SAH" >&2; exit 2; }
[ -n "${SUPABASE_ACCESS_TOKEN:-}" ] || { echo "SUPABASE_ACCESS_TOKEN kosong" >&2; exit 2; }

AKAR="$(cd "$(dirname "$0")/.." && pwd)"
MGMT="https://api.supabase.com/v1/projects/$REF_SAH"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# kirim <berkas.sql> <berkas-respons> → cetak kode HTTP
kirim() {
  jq -nc --rawfile q "$1" '{query:$q}' | curl -sS -o "$2" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'content-type: application/json' "$MGMT/database/query" -d @-
}
ok() { [ "$1" = 200 ] || [ "$1" = 201 ]; }

# sql <teks> → cetak respons JSON; gagal bila HTTP bukan 2xx
sql() {
  printf '%s\n' "$1" > "$TMP/q.sql"
  local kode; kode=$(kirim "$TMP/q.sql" "$TMP/q.json")
  ok "$kode" || { echo "SQL gagal: HTTP $kode $(head -c 800 "$TMP/q.json")" >&2; return 1; }
  cat "$TMP/q.json"
}

migrasi() {
  sql "create schema if not exists supabase_migrations;
       create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);" >/dev/null
  local sudah; sudah=$(sql "select version from supabase_migrations.schema_migrations order by 1;" | jq -r '.[].version')
  local f b v n kode
  for f in "$AKAR"/supabase/migrations/*.sql; do
    b=$(basename "$f" .sql); v=${b%%_*}; n=${b#*_}
    if grep -qx "$v" <<<"$sudah"; then echo "$b: sudah tercatat"; continue; fi
    if grep -q 'rhjmig' "$f"; then echo "$b memuat penanda rhjmig, tidak bisa dicatat" >&2; exit 1; fi
    { cat "$f"
      printf '\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (%s, %s, array[$rhjmig$' "'$v'" "'$n'"
      cat "$f"
      printf '$rhjmig$]);\n'
    } > "$TMP/m.sql"
    kode=$(kirim "$TMP/m.sql" "$TMP/m.json")
    if ok "$kode"; then echo "$b: diterapkan"; else echo "$b: GAGAL HTTP $kode $(head -c 800 "$TMP/m.json")" >&2; exit 1; fi
  done
}

kunci_service() {
  curl -sS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$MGMT/api-keys?reveal=true" \
    | jq -r '([.[] | select(.type == "secret")][0].api_key) // ([.[] | select(.name == "service_role")][0].api_key) // empty'
}

akun() {
  local id="$1" email; email=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]' | xargs)
  [[ "$id" =~ ^[0-9]+$ ]] || { echo "member_id harus angka" >&2; exit 2; }
  [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo "email tidak sah" >&2; exit 2; }
  local m; m=$(sql "select id, username, role, aktif, auth_user_id, email from public.members where id = $id;")
  [ "$(jq length <<<"$m")" = 1 ] || { echo "Anggota $id tidak ditemukan" >&2; exit 1; }
  [ "$(jq -r '.[0].role' <<<"$m")" != bot ] || { echo "Bot tidak punya akun login" >&2; exit 1; }
  if [ "$(jq -r '.[0].auth_user_id // empty' <<<"$m")" != "" ]; then echo "$id: sudah punya akun login, dilewati"; return 0; fi
  local bentrok; bentrok=$(sql "select count(*) as n from public.members where lower(email) = '$email' and id <> $id;" | jq -r '.[0].n')
  [ "$bentrok" = 0 ] || { echo "Email $email sudah dipakai anggota lain" >&2; exit 1; }

  local kunci; kunci=$(kunci_service)
  [ -n "$kunci" ] || { echo "Kunci service tidak tersedia" >&2; exit 1; }
  local auth="https://$REF_SAH.supabase.co/auth/v1/admin/users"
  local pw; pw=$(openssl rand -base64 36 | tr -d '\n')
  local kode; kode=$(jq -nc --arg e "$email" --arg p "$pw" '{email:$e, password:$p, email_confirm:true}' \
    | curl -sS -o "$TMP/u.json" -w '%{http_code}' -X POST "$auth" -H "apikey: $kunci" -H "Authorization: Bearer $kunci" \
        -H 'content-type: application/json' -d @-)
  unset pw
  ok "$kode" || { echo "GoTrue gagal: HTTP $kode $(jq -c '{code, error_code, msg}' "$TMP/u.json" 2>/dev/null)" >&2; exit 1; }
  local uid; uid=$(jq -r '.id' "$TMP/u.json")
  if ! sql "select public.x_admin_akun($OWNER_ID, $id, '$uid'::uuid, '$email', true) as hasil;" > "$TMP/a.json"; then
    curl -sS -o /dev/null -X DELETE "$auth/$uid" -H "apikey: $kunci" -H "Authorization: Bearer $kunci" # jangan tinggalkan akun yatim
    exit 1
  fi
  jq -c '.[0].hasil | {id, username, email, auth_user_id, harus_ganti_password}' "$TMP/a.json"
}

case "${1:-}" in
  --migrasi) migrasi ;;
  --akun) [ $# -eq 3 ] || { echo "pakai: --akun <member_id> <email>" >&2; exit 2; }; akun "$2" "$3" ;;
  ""|-h|--help) sed -n '2,23p' "$0"; exit 2 ;;
  *)
    # terima berkas biasa, FIFO, atau process substitution <(...) (/dev/fd/NN, dibaca sekali oleh `kirim`)
    [ -f "$1" ] || [ -p "$1" ] || [ -r "$1" ] || { echo "Berkas/aliran tidak ada: $1" >&2; exit 2; }
    kode=$(kirim "$1" "$TMP/r.json")
    if [ -n "${2:-}" ]; then
      (umask 077; cp "$TMP/r.json" "$2")
      echo "HTTP $kode, $(wc -c < "$2") byte ditulis ke $2"
    else
      cat "$TMP/r.json"; echo
    fi
    ok "$kode"
    ;;
esac
