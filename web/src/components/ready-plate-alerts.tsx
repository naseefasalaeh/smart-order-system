"use client";

import { useEffect, useRef, useState } from "react";
import { collectNewReadyPlates } from "@/lib/ready-plate-notifications";

const preferenceKey = "smart-order-ready-sound";
type Orders = Parameters<typeof collectNewReadyPlates>[0];

export default function ReadyPlateAlerts({ orders, valid, onNew }: {
  orders: Orders; valid: boolean; onNew: (keys: string[]) => void;
}) {
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const context = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [preferred, setPreferred] = useState(false);
  const [message, setMessage] = useState("");
  const pendingSound = useRef<ReturnType<typeof setTimeout> | null>(null);

  function play() {
    const audio = context.current;
    if (!audio || audio.state !== "running") return;
    for (const [delay, frequency] of [[0, 660], [0.18, 880]]) {
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
  }

  useEffect(() => {
    // A remembered preference is not permission to autoplay in a new document.
    const startup = setTimeout(() => {
      try { setPreferred(localStorage.getItem(preferenceKey) === "on"); } catch { /* Storage may be disabled. */ }
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
    setMessage(`มีอาหารพร้อมเสิร์ฟใหม่ ${added.length} จาน`);
    // Coalesce rapid snapshots. Never queue a backlog while muted or suspended.
    if (enabledRef.current && context.current?.state === "running" && !pendingSound.current) {
      pendingSound.current = setTimeout(() => {
        pendingSound.current = null;
        if (enabledRef.current) play();
      }, 600);
    }
  }, [orders, valid, onNew]);

  async function activate(test: boolean) {
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      if (context.current.state !== "running") throw new Error("AUDIO_BLOCKED");
      if (!test) {
        enabledRef.current = true;
        setEnabled(true);
        setPreferred(true);
        try { localStorage.setItem(preferenceKey, "on"); } catch { /* Optional preference. */ }
      }
      play();
      setMessage(test ? "ทดลองเสียงแล้ว" : "เปิดเสียงแล้วขณะเปิดหน้านี้");
    } catch { setMessage("เปิดเสียงไม่สำเร็จ กรุณากดเปิดเสียงอีกครั้งหรือตรวจการตั้งค่าเบราว์เซอร์"); }
  }

  return <div className="mt-4 rounded-xl border border-orange-200 bg-white p-4">
    <div className="flex flex-wrap gap-3">
      <button type="button" aria-pressed={enabled} className="rounded-lg bg-orange-600 px-4 py-2 text-white" onClick={() => {
        if (!enabled) { void activate(false); return; }
        enabledRef.current = false;
        setEnabled(false);
        setPreferred(false);
        try { localStorage.setItem(preferenceKey, "off"); } catch { /* Optional preference. */ }
      }}>{enabled ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}</button>
      <button type="button" className="rounded-lg border px-4 py-2" onClick={() => void activate(true)}>ทดลองเสียง</button>
    </div>
    <p className="mt-2 text-sm text-zinc-600">{!enabled && preferred ? "อุปกรณ์นี้เคยเปิดเสียง กรุณากดเปิดเสียงเพื่อเริ่มใช้ในหน้านี้" : "กดเปิดเสียงครั้งแรกเพื่ออนุญาตเบราว์เซอร์ แจ้งเฉพาะจานใหม่ขณะเปิดหน้านี้"}</p>
    <p role="status" className="mt-1 text-sm text-orange-800">{message}</p>
  </div>;
}
