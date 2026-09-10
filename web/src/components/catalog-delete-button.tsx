"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCatalogItem } from "@/app/dashboard/catalog-delete-actions";
import type { DeleteResult } from "@/lib/catalog-deletion";

export default function CatalogDeleteButton({ id, name, kind }: {
  id: number; name: string; kind: "menu" | "ingredient";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const titleId = useId();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<DeleteResult | null>(null);
  const [notice, setNotice] = useState("");
  const label = kind === "menu" ? "เมนู" : "วัตถุดิบ";

  async function submit(mode: "delete" | "archive") {
    if (busy.current || confirmation !== name) return;
    busy.current = true;
    setPending(true);
    try {
      const data = new FormData();
      data.set("id", String(id));
      data.set("kind", kind);
      data.set("mode", mode);
      data.set("confirmation", confirmation);
      const response = await deleteCatalogItem(data);
      setResult(response);
      if (response.status === "deleted" || response.status === "archived") {
        setNotice(response.message);
        dialog.current?.close();
        router.replace(`/dashboard/${kind === "menu" ? "menus" : "ingredients"}?success=${encodeURIComponent(response.message)}`);
      }
    } catch {
      setResult({ status: "error", message: "เชื่อมต่อไม่สำเร็จ กรุณาโหลดหน้าเพื่อตรวจสอบสถานะก่อนลองใหม่" });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <span className="ml-3 inline-block text-left">
      <button type="button" className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        onClick={() => { setConfirmation(""); setResult(null); dialog.current?.showModal(); }}>
        ลบ{label}
      </button>
      {notice && <span role="status" className="mt-2 block text-sm text-green-700">{notice}</span>}
      <dialog ref={dialog} aria-labelledby={titleId}
        onCancel={(event) => { if (busy.current) event.preventDefault(); }}
        className="fixed inset-0 m-auto w-[min(92vw,32rem)] rounded-2xl bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-black/50">
        <h2 id={titleId} className="text-xl font-bold">ยืนยันลบ{label} “{name}”</h2>
        <p className="mt-3 text-sm text-zinc-600">
          {kind === "menu"
            ? "เมนูที่ไม่เคยมีออเดอร์จะถูกลบถาวรพร้อมสูตร กลุ่ม และตัวเลือก หากมีประวัติจะลบไม่ได้ แต่สามารถยืนยันปิดขายแทนได้"
            : "ลบถาวรได้เฉพาะวัตถุดิบที่ไม่อยู่ในสูตรและไม่มีประวัติการหัก/คืน stock การลบไม่สามารถย้อนกลับได้"}
        </p>
        <form onSubmit={(event) => { event.preventDefault(); void submit(result?.status === "used" ? "archive" : "delete"); }}>
          <label className="mt-5 block text-sm font-semibold">
            พิมพ์ชื่อ “{name}” เพื่อยืนยัน
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending}
              autoComplete="off" className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2" />
          </label>
          {result && <p role="alert" className="mt-4 text-sm text-red-700">{result.message}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" disabled={pending} onClick={() => dialog.current?.close()}
              className="rounded-lg border px-4 py-2 disabled:opacity-50">ยกเลิก</button>
            <button type="submit" disabled={pending || confirmation !== name}
              className="rounded-lg bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {pending ? "กำลังตรวจสอบ..." : result?.status === "used" ? "ยืนยันปิดขายแทน" : "ยืนยันลบถาวร"}
            </button>
          </div>
        </form>
      </dialog>
    </span>
  );
}
