"use client";

import { useEffect, useState } from "react";

// ---------- Мишка (SVG, как в онлайн-курсе) ----------

export function Bear({ size = 88, wave = false }: { size?: number; wave?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={wave ? "motion-safe:animate-[wiggle_1s_ease-in-out_infinite]" : undefined}
      aria-hidden
    >
      {/* уши */}
      <circle cx="30" cy="30" r="16" fill="#B97B4F" />
      <circle cx="90" cy="30" r="16" fill="#B97B4F" />
      <circle cx="30" cy="30" r="8" fill="#F3C79F" />
      <circle cx="90" cy="30" r="8" fill="#F3C79F" />
      {/* лапка-привет */}
      <circle cx="106" cy="76" r="11" fill="#C68B5C" />
      <circle cx="106" cy="76" r="11" fill="none" stroke="#00000022" strokeWidth="1" />
      {/* голова */}
      <circle cx="60" cy="62" r="40" fill="#C68B5C" />
      {/* мордочка */}
      <ellipse cx="60" cy="75" rx="20" ry="15" fill="#F0D2AC" />
      <ellipse cx="60" cy="69" rx="6.2" ry="4.6" fill="#4A2E1D" />
      <path d="M52 79 Q60 86 68 79" stroke="#4A2E1D" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* глаза */}
      <circle cx="46" cy="55" r="4.6" fill="#2E1B10" />
      <circle cx="74" cy="55" r="4.6" fill="#2E1B10" />
      <circle cx="47.6" cy="53.4" r="1.5" fill="#fff" />
      <circle cx="75.6" cy="53.4" r="1.5" fill="#fff" />
      {/* румянец */}
      <circle cx="37" cy="69" r="5" fill="#F79BB0" opacity="0.75" />
      <circle cx="83" cy="69" r="5" fill="#F79BB0" opacity="0.75" />
    </svg>
  );
}

// ---------- плавающий маскот с фразами ----------

const PHRASES = [
  "Привет, Томи! Ты лучшая 💜",
  "Ты точно справишься!",
  "Пробуй ещё, если надо — точно справишься 💪",
  "Каждый эскиз — шаг к топу Астаны ✨",
  "Твой вкус — уже премиум. Дожимаем детали!",
];

export function Mascot({ mood = "idle" }: { mood?: "idle" | "busy" | "error" }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PHRASES.length), 7000);
    return () => clearInterval(t);
  }, []);

  const text =
    mood === "busy"
      ? "Колдую над эскизом для тебя, Томи ✨"
      : mood === "error"
        ? "Пробуй ещё — ты точно справишься 💪"
        : PHRASES[i];

  return (
    <div className="fixed bottom-5 right-5 z-50 hidden select-none items-end gap-3 sm:flex">
      <div className="card max-w-[240px] px-4 py-3 text-sm leading-snug shadow-[0_10px_44px_rgba(0,0,0,0.5)]">
        {text}
      </div>
      <button
        onClick={() => setI((v) => (v + 1) % PHRASES.length)}
        aria-label="Мишка"
        className="motion-safe:animate-[floaty_3.5s_ease-in-out_infinite] transition-transform hover:scale-105"
      >
        <Bear size={84} wave={mood === "busy"} />
      </button>
    </div>
  );
}
