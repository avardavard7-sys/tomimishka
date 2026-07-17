"use client";

import { useState } from "react";

interface Props {
  before?: string | null;
  after: string;
}

export default function PhotoCompare({ before, after }: Props) {
  const [pos, setPos] = useState(52);

  if (!before) {
    // рендер с нуля — просто картинка
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={after} alt="Рендер" className="w-full rounded-xl border border-white/10" />;
  }

  return (
    <div className="select-none">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt="Было" className="block w-full" draggable={false} />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={after} alt="Стало" className="block h-full w-full object-cover" draggable={false} />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 w-[2px] bg-amber"
          style={{ left: `${pos}%` }}
        />
        <span className="absolute left-3 top-3 rounded bg-gradient-to-r from-violet to-pink px-2 py-0.5 font-mono text-[11px] tracking-wide text-white">
          НОВЫЙ ДИЗАЙН
        </span>
        <span className="absolute right-3 top-3 rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] tracking-wide text-white/75">
          ИСХОДНИК
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="mt-3 w-full accent-amber"
        aria-label="Сравнение до и после"
      />
    </div>
  );
}
