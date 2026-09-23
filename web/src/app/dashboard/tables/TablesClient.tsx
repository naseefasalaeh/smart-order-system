"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import TableQRCode from "@/components/TableQRCode";
import { saveTable } from "./actions";
import ActionForm from "@/components/action-form";

type RestaurantTable = { id: number; table_number: string; status: string };
type Filter = "all" | "active" | "inactive";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending}
    className="min-h-11 rounded-lg bg-orange-500 px-5 py-2 font-semibold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
    {pending ? "กำลังดำเนินการ…" : label}
  </button>;
}

function ToggleButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending}
    className={`min-h-11 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 disabled:opacity-60 ${
      active ? "border-red-300 text-red-700 hover:bg-red-50" : "border-green-300 text-green-800 hover:bg-green-50"
    }`}>{pending ? "กำลังดำเนินการ…" : active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>;
}

export default function TablesClient({ tables }: { tables: RestaurantTable[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [modalKey, setModalKey] = useState(0);
  const [number, setNumber] = useState("");
  const [active, setActive] = useState(true);
  const [validation, setValidation] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const activeCount = tables.filter((table) => table.status !== "inactive").length;
  const visible = useMemo(() => tables.filter((table) =>
    table.table_number.toLocaleLowerCase("th-TH").includes(search.trim().toLocaleLowerCase("th-TH")) &&
    (filter === "all" || (filter === "inactive" ? table.status === "inactive" : table.status !== "inactive"))
  ), [tables, search, filter]);

  function openForm(table: RestaurantTable | null) {
    setEditing(table);
    setNumber(table?.table_number ?? "");
    setActive(table?.status !== "inactive");
    setValidation("");
    setModalKey((value) => value + 1);
    dialog.current?.showModal();
  }

  async function save(form: FormData) {
    const result = await saveTable(form);
    if (result.error) { setValidation(result.error); setNotice(result.error); return; }
    setValidation(""); setNotice("บันทึกโต๊ะแล้ว"); dialog.current?.close();
  }

  function validate(event: React.FormEvent<HTMLFormElement>) {
    const trimmed = number.trim();
    if (!trimmed || trimmed.length > 40) {
      event.preventDefault(); setValidation("กรุณากรอกหมายเลขหรือชื่อโต๊ะไม่เกิน 40 ตัวอักษร"); return;
    }
    if (tables.some((table) => table.id !== editing?.id && table.table_number.toLocaleLowerCase("th-TH") === trimmed.toLocaleLowerCase("th-TH"))) {
      event.preventDefault(); setValidation("หมายเลขหรือชื่อโต๊ะนี้ถูกใช้แล้ว"); return;
    }
    setValidation("");
  }

  return <>
    {notice && <p role="status" className="mt-4 rounded-xl bg-white p-4">{notice}</p>}
    <section aria-label="สรุปโต๊ะ" className="mt-6 grid gap-3 sm:grid-cols-3">
      {[
        ["โต๊ะทั้งหมด", tables.length], ["เปิดใช้งาน", activeCount], ["ปิดใช้งาน", tables.length - activeCount],
      ].map(([label, count]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">{label}</p>
        <p className="mt-2 text-2xl font-bold text-zinc-900">{count}</p>
      </div>)}
    </section>

    <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="table-search">ค้นหาโต๊ะ</label>
        <input id="table-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาหมายเลขหรือชื่อโต๊ะ"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" />
        <label className="sr-only" htmlFor="table-filter">กรองสถานะโต๊ะ</label>
        <select id="table-filter" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}
          className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
          <option value="all">ทั้งหมด</option><option value="active">เปิดใช้งาน</option><option value="inactive">ปิดใช้งาน</option>
        </select>
      </div>
      <button type="button" onClick={() => openForm(null)} className="min-h-11 rounded-lg bg-orange-500 px-5 py-2 font-semibold text-white hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2">+ เพิ่มโต๊ะ</button>
    </div>

    {tables.length === 0 ? <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm"><p className="rounded-xl border border-dashed border-zinc-300 p-12 text-center text-zinc-600">ยังไม่มีข้อมูลโต๊ะ</p></div>
      : visible.length === 0 ? <div className="mt-6 rounded-2xl bg-white p-12 text-center text-zinc-600 shadow-sm">ไม่พบโต๊ะที่ตรงกับการค้นหา</div>
      : <section aria-label="รายการโต๊ะ" className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((table) => {
          const isActive = table.status !== "inactive";
          return <article key={table.id} className={`min-w-0 rounded-2xl bg-white p-5 shadow-sm ${isActive ? "" : "opacity-75"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-semibold tracking-wider text-orange-600">SMART ORDER</p><h3 className="mt-1 break-words text-xl font-bold text-zinc-900">โต๊ะ {table.table_number}</h3></div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${isActive ? "bg-green-100 text-green-800" : "bg-zinc-200 text-zinc-700"}`}>{isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
            </div>
            <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-4"><TableQRCode tableId={`id-${table.id}`} tableNumber={table.table_number} /></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link href={`/table/id-${table.id}`} target="_blank" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-orange-300 px-3 py-2 text-center text-sm font-semibold text-orange-800 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">เปิดหน้าสั่งอาหาร</Link>
              <button type="button" onClick={() => openForm(table)} className="min-h-11 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">แก้ไขโต๊ะ</button>
            </div>
            <ActionForm action={save} className="mt-2">
              <input type="hidden" name="id" value={table.id} /><input type="hidden" name="table_number" value={table.table_number} />
              {!isActive && <input type="hidden" name="is_active" value="on" />}
              <ToggleButton active={isActive} />
            </ActionForm>
          </article>;
        })}
      </section>}

    <dialog ref={dialog} aria-labelledby="table-dialog-title" onCancel={() => setValidation("")}
      className="fixed inset-0 m-auto w-[min(92vw,30rem)] rounded-2xl bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-black/50">
      <h2 id="table-dialog-title" className="text-xl font-bold">{editing ? "แก้ไขโต๊ะ" : "เพิ่มโต๊ะ"}</h2>
      <p className="mt-1 text-sm text-zinc-600">ตั้งชื่อโต๊ะและเลือกสถานะการใช้งาน</p>
      <ActionForm key={modalKey} action={save} onSubmit={validate} className="mt-5 space-y-4">
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <label className="block text-sm font-semibold">หมายเลขหรือชื่อโต๊ะ
          <input name="table_number" value={number} onChange={(event) => { setNumber(event.target.value); setValidation(""); }} maxLength={40} autoFocus aria-invalid={Boolean(validation)} aria-describedby={validation ? "table-number-error" : undefined}
            className="mt-2 min-h-11 w-full rounded-lg border border-zinc-300 px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" />
        </label>
        {validation && <p id="table-number-error" role="alert" className="text-sm text-red-700">{validation}</p>}
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="is_active" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-orange-500" /> เปิดใช้งาน</label>
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">ยกเลิก</button>
          <SaveButton label={editing ? "บันทึกโต๊ะ" : "เพิ่มโต๊ะ"} />
        </div>
      </ActionForm>
    </dialog>
  </>;
}
