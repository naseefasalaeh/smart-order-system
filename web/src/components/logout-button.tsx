"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();

    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="mt-8 w-full rounded-xl border border-zinc-700 px-4 py-3 text-left text-zinc-300 transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-400"
    >
      ออกจากระบบ
    </button>
  );
}