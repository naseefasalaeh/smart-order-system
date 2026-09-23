"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const busy = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setErrorMessage("");
    setIsLoading(true);
    let navigating = false;
    try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.status && error.status >= 500 ? "ระบบเข้าสู่ระบบไม่พร้อมชั่วคราว กรุณาลองใหม่" : "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    const user = data.user;
    const { data: profile, error: profileError } = user
      ? await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle()
      : { data: null, error: null };
    if (profileError) {
      setErrorMessage("ตรวจสอบสิทธิ์ไม่สำเร็จชั่วคราว กรุณาลองใหม่");
      return;
    }
    if (!profile?.is_active || !["admin", "staff", "kitchen_staff"].includes(profile.role)) {
      await supabase.auth.signOut();
      setErrorMessage("บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน");
      return;
    }
    navigating = true;
    router.replace(profile.role === "kitchen_staff" ? "/dashboard/kitchen" : "/dashboard");
    } catch {
      setErrorMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      if (!navigating) { busy.current = false; setIsLoading(false); }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-orange-50 px-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <p className="text-center font-semibold text-orange-500">
          SMART ORDER
        </p>

        <h1 className="mt-2 text-center text-3xl font-bold text-zinc-900">
          เข้าสู่ระบบพนักงาน
        </h1>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="mb-2 block font-medium text-zinc-700"
            >
              อีเมล
            </label>

            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500"
              placeholder="staff@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block font-medium text-zinc-700"
            >
              รหัสผ่าน
            </label>

            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500"
              placeholder="••••••••"
            />
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "กำลังดำเนินการ…" : "เข้าสู่ระบบ"}
          </button>
        </form>

        <Link
          href="/"
          className="mt-5 block text-center text-sm text-zinc-500 hover:text-orange-500"
        >
          กลับหน้าหลัก
        </Link>
      </section>
    </main>
  );
}
