"use client";

import { useEffect, useState } from "react";
import { Bear } from "./Bear";

const KEY = "tomi_welcome_seen";

export default function Welcome() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {}
    setShow(true);
    const t1 = setTimeout(() => setLeaving(true), 3000);
    const t2 = setTimeout(close, 3450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setShow(false);
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {}
  };

  if (!show) return null;

  return (
    <div
      onClick={close}
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-paper ${
        leaving ? "animate-[fadeOut_.45s_ease_both]" : "animate-[fadeIn_.35s_ease_both]"
      }`}
      role="dialog"
      aria-label="Приветствие"
    >
      {/* аврора */}
      <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-violet/35 blur-[130px] motion-safe:animate-[drift_6s_ease-in-out_infinite]" />
      <div className="absolute -bottom-44 -right-36 h-[540px] w-[540px] rounded-full bg-pink/30 blur-[130px] motion-safe:animate-[drift_7s_ease-in-out_infinite_reverse]" />
      <div className="absolute right-1/4 top-1/3 h-[300px] w-[300px] rounded-full bg-amber/25 blur-[110px] motion-safe:animate-pulse" />

      <div className="relative z-10 flex max-w-2xl flex-col items-center px-6 text-center">
        <div className="animate-[pop_.7s_cubic-bezier(.34,1.56,.64,1)_both]">
          <Bear size={124} wave />
        </div>
        <p className="eyebrow mt-7 animate-[fadeUp_.6s_.25s_both]">
          Добро пожаловать в рабочее пространство
        </p>
        <h1 className="glow-text mt-3 font-display text-5xl font-bold tracking-tight animate-[fadeUp_.6s_.5s_both] sm:text-6xl">
          ТОМИ МИШКА
        </h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.34em] text-graphite animate-[fadeUp_.6s_.75s_both]">
          компания French IT
        </p>
        <p className="mt-7 max-w-md text-lg leading-relaxed text-ink/90 animate-[fadeUp_.6s_1s_both]">
          Уверены: вы станете лучшей и самой высокооплачиваемой дизайнершей Астаны ✨
        </p>
      </div>
    </div>
  );
}
