"use client";

import { useCallback, useEffect, useState } from "react";
import type { ShopRole } from "@/lib/dashboard-auth";

type UserRow = {
  id: string;
  email: string | undefined;
  lastSignInAt: string | undefined;
  profile: { full_name: string; role: ShopRole; is_active: boolean } | null;
};

const roles: ShopRole[] = ["admin", "staff", "kitchen_staff"];

export default function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ShopRole>("staff");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    if (!res.ok) throw new Error("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
    const body = await res.json() as { users: UserRow[] };
    setUsers(body.users);
  }, []);

  useEffect(() => {
    void fetch("/api/admin/users", { cache: "no-store" }).then(async (res) => {
      if (!res.ok) throw new Error("โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
      const body = await res.json() as { users: UserRow[] };
      setUsers(body.users);
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  async function submit(payload: object, method: "POST" | "PATCH") {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/users", {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = await res.json() as { error?: string };
      if (!res.ok) throw new Error(result.error ?? "ดำเนินการไม่สำเร็จ");
      await load();
      setMessage(method === "POST" ? "ส่งคำเชิญแล้ว"
        : (payload as { action?: string }).action === "reset" ? "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว" : "บันทึกเรียบร้อย");
      if (method === "POST") { setEmail(""); setFullName(""); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-8 space-y-8">
    <form className="rounded-2xl bg-white p-6 shadow-sm" onSubmit={(event) => {
      event.preventDefault();
      void submit({ email, fullName, role }, "POST");
    }}>
      <h2 className="text-xl font-semibold">เชิญพนักงานใหม่</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm">อีเมล<input className="mt-1 w-full rounded-lg border p-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="text-sm">ชื่อ<input className="mt-1 w-full rounded-lg border p-2" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label className="text-sm">สิทธิ์<select className="mt-1 w-full rounded-lg border p-2" value={role} onChange={(event) => setRole(event.target.value as ShopRole)}>
          {roles.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </div>
      <button disabled={busy} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">ส่งคำเชิญ</button>
    </form>
    {message && <p role="status" className="rounded-lg bg-white p-3 text-sm">{message}</p>}
    <section className="space-y-3" aria-label="รายชื่อผู้ใช้งาน">
      {users.map((user) => <UserEditor key={user.id} user={user} busy={busy} submit={submit} />)}
    </section>
  </div>;
}

function UserEditor({ user, busy, submit }: {
  user: UserRow; busy: boolean; submit: (payload: object, method: "PATCH") => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user.profile?.full_name ?? "");
  const [role, setRole] = useState<ShopRole>(user.profile?.role ?? "staff");
  const [isActive, setIsActive] = useState(user.profile?.is_active ?? false);
  return <form className="rounded-2xl bg-white p-5 shadow-sm" onSubmit={(event) => {
    event.preventDefault();
    void submit({ id: user.id, action: "update", fullName, role, isActive }, "PATCH");
  }}>
    <p className="break-all font-medium text-zinc-900">{user.email ?? user.id}</p>
    <p className="mt-1 text-xs text-zinc-500">เข้าสู่ระบบล่าสุด: {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString("th-TH") : "ยังไม่เคย"}</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <label className="text-sm">ชื่อ<input className="mt-1 w-full rounded-lg border p-2" required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
      <label className="text-sm">สิทธิ์<select className="mt-1 w-full rounded-lg border p-2" value={role} onChange={(event) => setRole(event.target.value as ShopRole)}>
        {roles.map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />เปิดใช้งาน</label>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={busy || !user.profile} className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white disabled:opacity-50">บันทึก</button>
      <button type="button" disabled={busy} onClick={() => void submit({ id: user.id, action: "reset" }, "PATCH")}
        className="rounded-lg border px-4 py-2 disabled:opacity-50">ส่งอีเมลรีเซ็ตรหัสผ่าน</button>
    </div>
  </form>;
}
