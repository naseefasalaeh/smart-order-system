"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectNewReadyPlates } from "@/lib/ready-plate-notifications";

const preferenceKey = "smart-order-ready-sound";
type Orders = Parameters<typeof collectNewReadyPlates>[0];

interface AlertFeedback {
  type: "success" | "info" | "warning" | "error" | "new";
  text: string;
}

export default function ReadyPlateAlerts({
  orders,
  valid,
  onNew,
  userId,
}: {
  orders: Orders;
  valid: boolean;
  onNew: (keys: string[]) => void;
  userId: string;
}) {
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const context = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [preferred, setPreferred] = useState(false);
  const [feedback, setFeedback] = useState<AlertFeedback | null>(null);
  const pendingSound = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeys = useRef<string[]>([]);

  const play = useCallback(() => {
    const audio = context.current;
    if (!audio || audio.state !== "running") return;
    for (const [delay, frequency] of [
      [0, 660],
      [0.18, 880],
    ]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, audio.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.12, audio.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + 0.17);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(audio.currentTime + delay);
      oscillator.stop(audio.currentTime + delay + 0.18);
    }
  }, []);

  const playOnceAcrossTabs = useCallback(
    async (keys: string[]) => {
      const claim = () => {
        if (
          !enabledRef.current ||
          context.current?.state !== "running" ||
          document.visibilityState !== "visible"
        )
          return;
        try {
          const storageKey = `smart-order-ready-heard:${userId}`;
          const now = Date.now();
          const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
          const heard = Object.fromEntries(
            Object.entries(stored).filter(
              ([, at]) => typeof at === "number" && now - at < 30 * 60_000
            )
          ) as Record<string, number>;
          if (!keys.some((key) => !heard[key])) return;
          for (const key of keys) heard[key] = now;
          localStorage.setItem(
            storageKey,
            JSON.stringify(Object.fromEntries(Object.entries(heard).slice(-2000)))
          );
          play();
        } catch {
          // Without shared storage, only the focused tab can announce.
          if (document.hasFocus()) play();
        }
      };
      if (navigator.locks)
        await navigator.locks.request(`smart-order-ready-sound:${userId}`, claim);
      else if (document.hasFocus()) claim();
    },
    [play, userId]
  );

  useEffect(() => {
    // A remembered preference is not permission to autoplay in a new document.
    const startup = setTimeout(() => {
      try {
        setPreferred(localStorage.getItem(preferenceKey) === "on");
      } catch {
        /* Storage may be disabled. */
      }
    }, 0);
    return () => {
      clearTimeout(startup);
      if (pendingSound.current) clearTimeout(pendingSound.current);
      void context.current?.close();
      context.current = null;
    };
  }, []);

  useEffect(() => {
    if (!valid) return;
    const added = collectNewReadyPlates(orders, seen.current, !initialized.current);
    initialized.current = true;
    if (!added.length) return;
    onNew(added);
    setFeedback({
      type: "new",
      text: `มีอาหารพร้อมเสิร์ฟใหม่ ${added.length} จาน`,
    });
    // Coalesce rapid snapshots. Never queue a backlog while muted or suspended.
    if (enabledRef.current && context.current?.state === "running") {
      pendingKeys.current.push(...added);
      if (pendingSound.current) return;
      pendingSound.current = setTimeout(() => {
        pendingSound.current = null;
        const keys = pendingKeys.current.splice(0);
        void playOnceAcrossTabs(keys).catch(() => {});
      }, 600);
    }
  }, [orders, valid, onNew, playOnceAcrossTabs]);

  // Sound toggle (turn on / off)
  async function handleToggleSound() {
    if (enabled) {
      enabledRef.current = false;
      setEnabled(false);
      setPreferred(false);
      try {
        localStorage.setItem(preferenceKey, "off");
      } catch {
        /* Optional preference. */
      }
      setFeedback({ type: "info", text: "ปิดเสียงแจ้งเตือนแล้ว" });
      return;
    }

    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      if (context.current.state !== "running") throw new Error("AUDIO_BLOCKED");
      enabledRef.current = true;
      setEnabled(true);
      setPreferred(true);
      try {
        localStorage.setItem(preferenceKey, "on");
      } catch {
        /* Optional preference. */
      }
      play();
      setFeedback({
        type: "success",
        text: "เปิดเสียงแจ้งเตือนแล้ว (จะส่งเสียงเตือนเฉพาะจานใหม่ขณะเปิดหน้านี้)",
      });
    } catch {
      setFeedback({
        type: "error",
        text: "เปิดเสียงไม่สำเร็จ กรุณากดอนุญาตให้เปิดเสียงในเบราว์เซอร์หรือตรวจการตั้งค่าอุปกรณ์",
      });
    }
  }

  // Test sound without changing toggle state
  async function handleTestSound() {
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      if (context.current.state !== "running") throw new Error("AUDIO_BLOCKED");
      play();
      setFeedback({ type: "success", text: "ทดลองเล่นเสียงแจ้งเตือนสำเร็จ" });
    } catch {
      setFeedback({
        type: "error",
        text: "ไม่สามารถเล่นเสียงได้ กรุณากดอนุญาตให้เปิดเสียงในเบราว์เซอร์หรือตรวจการตั้งค่าอุปกรณ์",
      });
    }
  }

  // Determine state:
  // 1. isSoundActive: AudioContext is running and sound is enabled
  // 2. isWaitingPermission: localStorage had "on" (preferred), but AudioContext needs gesture in this session
  // 3. isSoundDisabled: sound is explicitly turned off
  const isSoundActive = enabled;
  const isWaitingPermission = !enabled && preferred;

  return (
    <section
      aria-label="การแจ้งเตือนด้วยเสียง"
      className="mt-6 rounded-2xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: Status badge & description */}
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Icon Container */}
          {isSoundActive ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-xs">
              {/* Volume 2 Icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </div>
          ) : isWaitingPermission ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 shadow-xs">
              {/* Bell / Alert Icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 shadow-xs">
              {/* Volume X Icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
            </div>
          )}

          <div className="min-w-0">
            {/* Status Pill Badge */}
            <div className="flex flex-wrap items-center gap-2">
              {isSoundActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-0.5 text-xs font-bold text-emerald-700">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  เปิดเสียงแจ้งเตือนอยู่
                </span>
              ) : isWaitingPermission ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-bold text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  รอเปิดใช้งานเสียง
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 px-3 py-0.5 text-xs font-bold text-zinc-600">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" />
                  ปิดเสียงแจ้งเตือนอยู่
                </span>
              )}
            </div>

            {/* Description */}
            <p className="mt-1 text-xs sm:text-sm text-zinc-600">
              {isSoundActive
                ? "พร้อมส่งเสียงเตือนอัตโนมัติเมื่อมีอาหารจานใหม่ทำเสร็จพร้อมเสิร์ฟ"
                : isWaitingPermission
                ? "อุปกรณ์นี้เคยเปิดเสียงไว้ กรุณากดปุ่มเพื่ออนุญาตให้เล่นเสียงในหน้านี้"
                : "ปิดเสียงแจ้งเตือนอยู่ คุณสามารถเปิดเสียงเพื่อรับการแจ้งเตือนเมื่ออาหารพร้อมเสิร์ฟ"}
            </p>
          </div>
        </div>

        {/* Right side: Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 sm:self-center">
          {/* Main Action Button */}
          {isSoundActive ? (
            <button
              type="button"
              onClick={handleToggleSound}
              aria-pressed={true}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-zinc-500"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="22" y1="9" x2="16" y2="15" />
                <line x1="16" y1="9" x2="22" y2="15" />
              </svg>
              <span>ปิดเสียง</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleSound}
              aria-pressed={false}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 transition shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
              <span>{isWaitingPermission ? "เปิดใช้งานเสียง" : "เปิดเสียง"}</span>
            </button>
          )}

          {/* Test Sound Button */}
          <button
            type="button"
            onClick={() => void handleTestSound()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 px-3.5 py-2 text-sm font-semibold text-zinc-700 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-zinc-500"
              aria-hidden="true"
            >
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
            <span>ทดลองเสียง</span>
          </button>
        </div>
      </div>

      {/* Realtime Alert or Action Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`mt-3.5 flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-medium transition ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : feedback.type === "error"
              ? "bg-red-50 text-red-800 border-red-200"
              : feedback.type === "new"
              ? "bg-amber-50 text-amber-900 border-amber-300 shadow-xs"
              : "bg-zinc-100 text-zinc-800 border-zinc-200"
          }`}
        >
          {feedback.type === "success" && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600 shrink-0">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          )}
          {feedback.type === "error" && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-red-600 shrink-0">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          )}
          {feedback.type === "new" && (
            <span className="flex h-2 w-2 rounded-full bg-amber-500 shrink-0 animate-ping" />
          )}
          <span className="flex-1">{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-zinc-400 hover:text-zinc-600 ml-2"
            aria-label="ปิดการแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}
