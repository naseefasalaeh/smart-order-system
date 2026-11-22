"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

export default function SubmitButton({ children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? "กำลังดำเนินการ…" : children}
  </button>;
}
