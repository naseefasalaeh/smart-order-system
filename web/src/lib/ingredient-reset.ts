export function readIngredientReset(form: FormData) {
  const mode = String(form.get("reset_mode") ?? "none");
  if (mode === "none") {
    return { reset_every_days: null, reset_start_date: null, reset_time: null };
  }
  if (mode !== "daily" && mode !== "interval") {
    throw new Error("รอบรีเซ็ตไม่ถูกต้อง");
  }
  const days = mode === "daily" ? 1 : Number(form.get("reset_every_days"));
  const start = String(form.get("reset_start_date") ?? "");
  const time = String(form.get("reset_time") ?? "");
  const parsedStart = new Date(`${start}T00:00:00Z`);
  const validDays = Number.isInteger(days) && days >= 1 && days <= 3650;
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(start)
    && Number.isFinite(parsedStart.getTime())
    && parsedStart.toISOString().slice(0, 10) === start;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

  if (!validDays || !validStart || !validTime) {
    throw new Error("กรุณาตรวจสอบจำนวนวัน วันเริ่มต้น และเวลารีเซ็ต");
  }
  return { reset_every_days: days, reset_start_date: start, reset_time: time };
}
