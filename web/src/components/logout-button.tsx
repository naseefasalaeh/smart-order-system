"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRef, useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
    const supabase = createClient();

    const result = await supabase.auth.signOut();
    if (result.error) throw result.error;
    router.replace("/login");
    } catch {
      setError("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
      busy.current = false; setPending(false);
    }
  }

  return (
    <><button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="mt-8 w-full rounded-xl border border-zinc-700 px-4 py-3 text-left text-zinc-300 transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-400"
    >
      {pending ? "กำลังดำเนินการ…" : "ออกจากระบบ"}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-red-500">{error}</p>}</>
  );
}
