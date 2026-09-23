"use client";

import { useRef, useState, type ComponentProps } from "react";

type Props = Omit<ComponentProps<"form">, "action"> & { action: (data: FormData) => void | Promise<void> };

export default function ActionForm({ action, children, onSubmit, ...props }: Props) {
  const locked = useRef(false);
  const [error, setError] = useState("");
  return <form {...props} onSubmit={(event) => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    if (locked.current) { event.preventDefault(); return; }
    locked.current = true;
  }} action={async (data) => {
    setError("");
    try { await action(data); }
    catch { setError("ดำเนินการไม่สำเร็จ กรุณาตรวจสถานะล่าสุดก่อนลองใหม่"); }
    finally { locked.current = false; }
  }}>
    {children}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </form>;
}
