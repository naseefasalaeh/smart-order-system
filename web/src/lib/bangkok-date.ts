const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportPeriodType = "daily" | "weekly" | "monthly" | "yearly" | "custom";

export function bangkokToday(now = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function bangkokDayRange(day: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const utcMidnight = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(utcMidnight) || new Date(utcMidnight).toISOString().slice(0, 10) !== day) return null;
  const start = utcMidnight - BANGKOK_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}

export function bangkokMonthRange(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const start = Date.UTC(year, monthNumber - 1, 1) - BANGKOK_OFFSET_MS;
  const end = Date.UTC(year, monthNumber, 1) - BANGKOK_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function bangkokCurrentMonth(now = new Date()): string {
  return bangkokToday(now).slice(0, 7);
}

export function bangkokCurrentYear(now = new Date()): number {
  return Number(bangkokToday(now).slice(0, 4));
}

export function bangkokYearRange(yearVal: string | number): { start: string; end: string; year: number } | null {
  const year = Number(yearVal);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  const start = Date.UTC(year, 0, 1) - BANGKOK_OFFSET_MS;
  const end = Date.UTC(year + 1, 0, 1) - BANGKOK_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), year };
}

export function bangkokWeekRange(dateInWeek: string): {
  start: string;
  end: string;
  startDay: string;
  endDay: string;
} | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInWeek)) return null;
  const utcMidnight = Date.parse(`${dateInWeek}T00:00:00.000Z`);
  if (!Number.isFinite(utcMidnight) || new Date(utcMidnight).toISOString().slice(0, 10) !== dateInWeek) return null;
  const dow = new Date(utcMidnight).getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = (dow + 6) % 7; // Mon=0, ..., Sun=6
  const mondayUtcMidnight = utcMidnight - daysFromMonday * DAY_MS;
  const start = mondayUtcMidnight - BANGKOK_OFFSET_MS;
  const end = start + 7 * DAY_MS;
  const startDay = new Date(mondayUtcMidnight).toISOString().slice(0, 10);
  const endDay = new Date(mondayUtcMidnight + 6 * DAY_MS).toISOString().slice(0, 10);
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    startDay,
    endDay,
  };
}

export function bangkokCustomRange(
  startDay: string,
  endDay: string
): {
  start: string;
  end: string;
  startDay: string;
  endDay: string;
  dayCount: number;
} | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(endDay)) return null;
  const startUtc = Date.parse(`${startDay}T00:00:00.000Z`);
  const endUtc = Date.parse(`${endDay}T00:00:00.000Z`);
  if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc)) return null;
  if (startUtc > endUtc) return null; // Start date must be before or equal to end date
  const start = startUtc - BANGKOK_OFFSET_MS;
  const end = endUtc + DAY_MS - BANGKOK_OFFSET_MS;
  const dayCount = Math.round((endUtc - startUtc) / DAY_MS) + 1;
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    startDay,
    endDay,
    dayCount,
  };
}

export function getPreviousDay(day: string): string {
  const utc = Date.parse(`${day}T00:00:00.000Z`) - DAY_MS;
  return new Date(utc).toISOString().slice(0, 10);
}

export function getPreviousWeekDate(dateInWeek: string): string {
  const utc = Date.parse(`${dateInWeek}T00:00:00.000Z`) - 7 * DAY_MS;
  return new Date(utc).toISOString().slice(0, 10);
}

export function getPreviousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  return `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getPreviousYear(year: number): number {
  return year - 1;
}

export function getPreviousCustomRange(
  startDay: string,
  endDay: string
): { prevStartDay: string; prevEndDay: string } {
  const startUtc = Date.parse(`${startDay}T00:00:00.000Z`);
  const endUtc = Date.parse(`${endDay}T00:00:00.000Z`);
  const dayCount = Math.round((endUtc - startUtc) / DAY_MS) + 1;
  const prevEndUtc = startUtc - DAY_MS;
  const prevStartUtc = prevEndUtc - (dayCount - 1) * DAY_MS;
  return {
    prevStartDay: new Date(prevStartUtc).toISOString().slice(0, 10),
    prevEndDay: new Date(prevEndUtc).toISOString().slice(0, 10),
  };
}

export function bangkokDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function bangkokHourKey(value: string | Date): number {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const hourStr = parts.find((item) => item.type === "hour")?.value ?? "0";
  return parseInt(hourStr, 10);
}

export function bangkokMonthKey(value: string | Date): string {
  return bangkokDateKey(value).slice(0, 7);
}

export function formatThaiDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  }
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    ...options,
  });
}

export function formatThaiYear(year: number): string {
  return `${year + 543}`;
}
