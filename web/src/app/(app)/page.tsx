import { redirect } from "next/navigation";

/** Beranda = Tugas Saya (sama dengan web lama: "/" dan "/saya"). */
export default function Beranda() {
  redirect("/saya");
}
