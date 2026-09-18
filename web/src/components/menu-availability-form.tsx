"use client";

import { useFormStatus } from "react-dom";

function SubmitButton({ available, disabled }: { available: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} aria-busy={pending}
      className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        available ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50" : "border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
      }`}>{pending ? "กำลังบันทึก..." : available ? "ปิดขาย" : "เปิดขาย"}</button>
  );
}

export default function MenuAvailabilityForm({ id, available, disabled, action }: {
  id: number; available: boolean; disabled: boolean; action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="available" value={String(!available)} />
      <SubmitButton available={available} disabled={disabled} />
    </form>
  );
}
