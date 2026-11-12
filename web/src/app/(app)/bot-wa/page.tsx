import type { Metadata } from "next";

import { PenjagaOwner } from "@/features/auth/penjaga-owner";
import { LayarBotWa } from "@/features/bot-wa/layar-bot-wa";

export const metadata: Metadata = { title: "Bot WA" };

/** Bot WA 0878 (khusus owner). Penjaga hanya tampilan; hak sebenarnya dicek web_wa_* (mulai_web owner) dan Edge /x/admin/*. */
export default function HalamanBotWa() {
  return (
    <PenjagaOwner judul="Bot WA">
      <LayarBotWa />
    </PenjagaOwner>
  );
}
