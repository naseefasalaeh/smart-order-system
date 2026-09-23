"use client";

import { addonCategories, type AddonCategory } from "@/lib/addon-categories";
import { useRef, useState, type ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { saveAddon } from "@/app/dashboard/addons/actions";
import ActionForm from "./action-form";
import SubmitButton from "./submit-button";

export type Addon = { id: number; category: AddonCategory; name: string; additional_price: number; is_available: boolean; max_quantity: number; display_order?: number };
export type AddonIngredient = { id: number; name: string; unit: string };
export type AddonRecipe = { ingredient_id: number; quantity_required: number };
const input = "mt-1 w-full rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900";

function RecipeButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return <button {...props} type="button" disabled={props.disabled || pending} />;
}

export default function AddonEditor({ addon, ingredients, recipe = [], onSaved }: {
  addon?: Addon; ingredients: AddonIngredient[]; recipe?: AddonRecipe[]; onSaved?: (addon: Addon) => void;
}) {
  const [rows, setRows] = useState(() => recipe.map((r, i) => ({ ...r, key: i })));
  const key = useRef(recipe.length);
  const busy = useRef(false);
  const [message, setMessage] = useState("");
  return <ActionForm action={async (form) => {
    if (busy.current) return;
    busy.current = true; setMessage("");
    try {
      const result = await saveAddon(form);
      if (result.error) setMessage(result.error);
      else if (result.addon) {
        setMessage("บันทึกตัวเลือกเสริมกลางแล้ว");
        onSaved?.(result.addon);
      }
    } catch { setMessage("เชื่อมต่อไม่สำเร็จ กรุณาโหลดหน้าใหม่เพื่อตรวจสถานะก่อนลองอีกครั้ง"); }
    finally { busy.current = false; }
  }} className="space-y-4">
    {addon && <input type="hidden" name="id" value={addon.id} />}
    <label className="block">ประเภท<select name="category" required className={input} defaultValue={addon?.category ?? ""}><option value="" disabled>เลือกประเภท</option>{addonCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
    <label className="block">ชื่อ<input className={input} name="name" required maxLength={120} defaultValue={addon?.name} /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label>ราคาเพิ่ม (บาท)<input className={input} name="price" type="number" required min="0" step="0.01" defaultValue={addon?.additional_price ?? 10} /></label>
      <label>จำนวนสูงสุดต่อจาน<input className={input} name="max_quantity" type="number" required min="1" max="3" defaultValue={addon?.max_quantity ?? 3} /></label>
    </div>
    <label className="block">ลำดับการแสดง<input className={input} name="display_order" type="number" required min="0" step="1" defaultValue={addon?.display_order ?? 0} /></label>
    <label className="block"><input name="is_available" type="checkbox" defaultChecked={addon?.is_available ?? true} /> เปิดขาย</label>
    <fieldset className="space-y-3"><legend className="font-bold">สูตรต่อ 1 ตัวเลือก</legend>
      {rows.map((row) => <div key={row.key} className="flex items-end gap-2">
        <label className="min-w-0 flex-1">วัตถุดิบ<select aria-label="วัตถุดิบ" name="ingredient_id" required className={input} defaultValue={row.ingredient_id || ""}>
          <option value="">เลือกวัตถุดิบ</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
        </select></label>
        <label className="w-28">ปริมาณ<input aria-label="ปริมาณ" name="quantity_required" type="number" min="0.001" step="0.001" required defaultValue={row.quantity_required} className={input} /></label>
        <RecipeButton className="p-2 text-red-700" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>นำออก</RecipeButton>
      </div>)}
      <RecipeButton className="text-orange-700" onClick={() => setRows([...rows, { key: key.current++, ingredient_id: 0, quantity_required: 1 }])}>+ เพิ่มวัตถุดิบในสูตร</RecipeButton>
    </fieldset>
    <p className="text-sm text-zinc-500">ราคาและสูตรที่แก้ไขใช้กับทุกเมนูที่เลือก Add-on นี้ ประวัติออเดอร์เดิมยังคงเดิม</p>
    {message && <p role="status" className="text-sm text-orange-800">{message}</p>}
    <SubmitButton className="rounded-xl bg-orange-600 px-4 py-3 font-bold text-white disabled:opacity-50">บันทึกตัวเลือกเสริม</SubmitButton>
  </ActionForm>;
}
