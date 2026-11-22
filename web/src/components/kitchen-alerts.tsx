"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectNewKitchenOrders, type KitchenAlertOrder } from "@/lib/kitchen-notifications";

const preferenceKey = "kitchen_sound_enabled";

interface AlertFeedback {
  type: "success" | "info" | "warning" | "error" | "new";
  text: string;
}

/**
 * Kitchen Bell Chime (Web Audio API)
 * Distinct, clear, two-tone kitchen bell (784Hz [G5] -> 1046Hz [C6])
 * Resonant and cutting through noisy kitchen environments, distinct from front-of-house (660->880)
 */
export function playKitchenOrderChime(audio: AudioContext) {
  if (audio.state !== "running") return;

  const notes = [
    { delay: 0, freq: 784, duration: 0.35, gainVal: 0.2 },       // G5
    { delay: 0.22, freq: 1046.5, duration: 0.5, gainVal: 0.24 }, // C6
  ];

  for (const { delay, freq, duration, gainVal } of notes) {
    const startTime = audio.currentTime + delay;

    // Primary bell tone
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, startTime);

    // Harmonic bell shimmer
    const shimmerOsc = audio.createOscillator();
    const shimmerGain = audio.createGain();
    shimmerOsc.type = "triangle";
    shimmerOsc.frequency.setValueAtTime(freq * 2.75, startTime);

    // Envelope for main bell
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainVal, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    // Envelope for shimmer
    shimmerGain.gain.setValueAtTime(0, startTime);
    shimmerGain.gain.linearRampToValueAtTime(gainVal * 0.25, startTime + 0.01);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.6);

    osc.connect(gain).connect(audio.destination);
    shimmerOsc.connect(shimmerGain).connect(audio.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
    shimmerOsc.start(startTime);
    shimmerOsc.stop(startTime + duration * 0.6);
  }
}

export default function KitchenAlerts({
  orders,
  valid,
  userId,
}: {
  orders: KitchenAlertOrder[];
  valid: boolean;
  userId?: string;
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
    playKitchenOrderChime(audio);
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
          const storageKey = `kitchen-order-heard:${userId || "default"}`;
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
          // Without shared storage, only the active tab announces
          if (document.hasFocus()) play();
        }
      };
      if (navigator.locks) {
        await navigator.locks.request(`kitchen-order-sound:${userId || "default"}`, claim);
      } else if (document.hasFocus()) {
        claim();
      }
    },
    [play, userId]
  );

  // Initialize preference from localStorage (kitchen_sound_enabled)
  useEffect(() => {
    const startup = setTimeout(() => {
      try {
        const storedPref = localStorage.getItem(preferenceKey);
        // Default to on if not set, but remember permission is per-session
        const isPrefOn = storedPref === "on" || storedPref === "true" || storedPref === null;
        setPreferred(isPrefOn);
      } catch {
        /* Storage may be disabled */
      }
    }, 0);
    return () => {
      clearTimeout(startup);
      if (pendingSound.current) clearTimeout(pendingSound.current);
      void context.current?.close();
      context.current = null;
    };
  }, []);

  // Detect newly arrived kitchen orders
  useEffect(() => {
    if (!valid) return;
    const added = collectNewKitchenOrders(orders, seen.current, !initialized.current);
    initialized.current = true;
    if (!added.length) return;

    setFeedback({
      type: "new",
      text: `🔔 มีออเดอร์ใหม่เข้าครัว ${added.length} รายการ`,
    });

    if (enabledRef.current && context.current?.state === "running") {
      pendingKeys.current.push(...added);
      if (pendingSound.current) return;
      pendingSound.current = setTimeout(() => {
        pendingSound.current = null;
        const keys = pendingKeys.current.splice(0);
        void playOnceAcrossTabs(keys).catch(() => {});
      }, 500);
    }
  }, [orders, valid, playOnceAcrossTabs]);

  // Sound toggle (turn on / off)
  async function handleToggleSound() {
    if (enabled) {
      enabledRef.current = false;
      setEnabled(false);
      setPreferred(false);
      try {
        localStorage.setItem(preferenceKey, "off");
      } catch {
        /* Optional preference */
      }
      setFeedback({ type: "info", text: "ปิดเสียงแจ้งเตือนออเดอร์ใหม่แล้ว" });
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
        /* Optional preference */
      }
      play();
      setFeedback({
        type: "success",
        text: "เปิดเสียงแจ้งเตือนแล้ว (ทดสอบกระดิ่งเข้าครัวเรียบร้อย)",
      });
    } catch {
      setFeedback({
        type: "error",
        text: "เปิดเสียงไม่สำเร็จ กรุณากดอนุญาตให้เปิดเสียงในเบราว์เซอร์หรือตรวจการตั้งค่าอุปกรณ์",
      });
    }
  }

  // Quick sound test button
  async function handleTestSound() {
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      if (context.current.state !== "running") throw new Error("AUDIO_BLOCKED");
      play();
      setFeedback({ type: "success", text: "ทดลองเล่นเสียงกระดิ่งครัวสำเร็จ" });
    } catch {
      setFeedback({
        type: "error",
        text: "ไม่สามารถเล่นเสียงได้ กรุณากดอนุญาตให้เปิดเสียงในเบราว์เซอร์",
      });
    }
  }

  const isSoundActive = enabled;
  const isWaitingPermission = !enabled && preferred;

  return (
    <div className="mt-4">
      {/* Audio Unlock / Attention Banner when user prefers sound but browser requires user gesture */}
      {isWaitingPermission && (
        <aside
          role="status"
          aria-live="polite"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-800 text-lg">
              🔔
            </span>
            <div>
              <p className="text-sm font-bold text-amber-950">
                เบราว์เซอร์ต้องการให้กดเปิดเสียงในเซสชันนี้
              </p>
              <p className="text-xs text-amber-800">
                กดปุ่มเพื่อปลดล็อกเสียงแจ้งเตือนออเดอร์ใหม่เข้าครัว
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleSound}
            className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition"
          >
            🔊 แตะเพื่อเปิดเสียงแจ้งเตือน
          </button>
        </aside>
      )}

      {/* Main Sound Status & Control Bar */}
      <section
        aria-label="การแจ้งเตือนด้วยเสียงออเดอร์เข้าครัว"
        className="rounded-2xl border border-zinc-200/80 bg-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Status info */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-xs ${
                isSoundActive
                  ? "bg-emerald-100 text-emerald-600"
                  : isWaitingPermission
                  ? "bg-amber-100 text-amber-700"
                  : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {isSoundActive ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900">
                  เสียงแจ้งเตือนออเดอร์ใหม่เข้าครัว
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    isSoundActive
                      ? "bg-emerald-100 text-emerald-800"
                      : isWaitingPermission
                      ? "bg-amber-100 text-amber-800"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isSoundActive
                        ? "bg-emerald-500"
                        : isWaitingPermission
                        ? "bg-amber-500 animate-pulse"
                        : "bg-zinc-400"
                    }`}
                  />
                  {isSoundActive ? "เปิดใช้งานแล้ว" : isWaitingPermission ? "รอยืนยันเสียง" : "ปิดเสียงอยู่"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                เสียงกระดิ่งเตือน 2 จังหวะทันทีเมื่อมีรายการใหม่ส่งเข้าครัว
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            {isSoundActive && (
              <button
                type="button"
                onClick={handleTestSound}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition shadow-xs"
              >
                <span>🔔</span>
                <span>ทดสอบเสียงกระดิ่ง</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleSound}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition shadow-xs ${
                isSoundActive
                  ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              }`}
            >
              {isSoundActive ? (
                <>
                  <span>🔇</span>
                  <span>ปิดเสียง</span>
                </>
              ) : (
                <>
                  <span>🔊</span>
                  <span>เปิดเสียงแจ้งเตือน</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feedback message banner */}
        {feedback && (
          <div
            role="status"
            className={`mt-3 flex items-center justify-between rounded-xl px-3.5 py-2 text-xs ${
              feedback.type === "new"
                ? "bg-orange-50 text-orange-800 border border-orange-200 font-semibold"
                : feedback.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : feedback.type === "error"
                ? "bg-rose-50 text-rose-800 border border-rose-200 font-semibold"
                : "bg-zinc-100 text-zinc-700"
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="ml-2 text-zinc-400 hover:text-zinc-600 font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
