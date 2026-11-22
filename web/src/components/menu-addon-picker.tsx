"use client";

import { addonCategories } from "@/lib/addon-categories";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AddonEditor, { type Addon, type AddonIngredient } from "./addon-editor";

export default function MenuAddonPicker({ addons, selectedIds = [], ingredients, meatRequired = false }: { meatRequired?: boolean; addons: Addon[]; selectedIds?: number[]; ingredients: AddonIngredient[] }) {
  const [items, setItems] = useState(addons);
  const [selected, setSelected] = useState(selectedIds);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  return <fieldset className="rounded-xl border border-orange-200 p-4">
    <legend className="px-2 font-bold">ตัวเลือกเสริมที่ใช้กับเมนูนี้</legend>
    <p className="mb-3 text-sm text-zinc-500">ติ๊กเพื่ออนุญาตให้ลูกค้าเลือก ใช้ราคาและสูตรจากข้อมูลกลาง</p>
    {addonCategories.map((category) => <section key={category.value} className="mb-5">
      <h3 className="mb-2 font-bold">{category.label}</h3>
      {category.value === "meat" && <label className="mb-3 block"><input type="checkbox" name="meat_required" defaultChecked={meatRequired} /> บังคับเลือกเนื้อสัตว์ 1 รายการ</label>}
      <div className="grid gap-3 sm:grid-cols-2">{items.filter((a) => a.category === category.value).map((a) => <label key={a.id} className="flex gap-2">
        <input type="checkbox" name="addon_ids" value={a.id} checked={selected.includes(a.id)} disabled={!a.is_available && !selected.includes(a.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id))} />
        {a.name} +{a.additional_price} บาท {!a.is_available && "(ปิดขาย)"}
      </label>)}</div>
    </section>)}
    {!items.length && <p className="text-sm">ยังไม่มีตัวเลือกเสริมกลาง</p>}
    <button type="button" onClick={() => setOpen(true)} className="mt-4 font-semibold text-orange-700">+ เพิ่มตัวเลือกเสริม</button>
    {open && createPortal(<dialog ref={dialog} onCancel={() => setOpen(false)} className="m-auto max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl p-6 backdrop:bg-black/40">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">เพิ่มตัวเลือกเสริมกลาง</h2><button type="button" onClick={() => setOpen(false)}>ปิด</button></div>
      <AddonEditor ingredients={ingredients} onSaved={(a) => { setItems([...items.filter((i) => i.id !== a.id), a]); if (a.is_available) setSelected([...new Set([...selected,a.id])]); setOpen(false); }} />
    </dialog>, document.body)}
  </fieldset>;
}
