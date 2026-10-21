#!/usr/bin/env bash
# Pagar ERP baca-saja (perintah Hannes 29 Sep 2026; docs/STATUS.md "0. Pagar & alat").
# MCP Supabase di sesi RHJ tersambung ke ERP lama (rhj-tracker, rhj-tacker.dev), bukan Anvil.
# PreToolUse untuk mcp__Supabase__execute_sql: tolak query yang bisa mengubah data/skema/sesi.
# Kata kunci di komentar SQL juga ditolak (sengaja: lebih baik salah tolak daripada lolos).
q=$(jq -r '.tool_input.query // empty' 2>/dev/null)
pola='\b(insert|update|delete|merge|upsert|alter|create|drop|truncate|grant|revoke|vacuum|reindex|cluster|copy|call|refresh|lock|comment[[:space:]]+on|security[[:space:]]+label|set[[:space:]]+role|reset[[:space:]]+role|nextval|setval|set_config|pg_terminate_backend|pg_cancel_backend|lo_import|lo_unlink|dblink)\b|\bdo[[:space:]]*\$'
if [ -z "$q" ] || printf '%s' "$q" | grep -qiE "$pola"; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Pagar RHJ: MCP Supabase = ERP lama, BACA-SAJA. Query kosong atau berisi kata kunci penulis ditolak. Anvil memakai berkas migrasi + alat/sql-proyek.sh, bukan MCP."}}'
fi
exit 0
