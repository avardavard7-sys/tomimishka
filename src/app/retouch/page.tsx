"use client";

import { useCallback, useRef, useState } from "react";
import { prepareFiles, splitDataUrl, SourceItem } from "@/lib/files";
import PhotoCompare from "@/components/PhotoCompare";
import { Mascot } from "@/components/Bear";

const PRESETS = [
  "убрать людей",
  "убрать провода и розетки",
  "убрать мебель",
  "убрать вывески, текст и логотипы",
  "убрать мусор и лишние предметы",
  "убрать блики и отражение вспышки",
];

export default function RetouchPage() {
  const [items, setItems] = useState<SourceItem[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [what, setWhat] = useState("");
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // history[0] — исходник, дальше каждый шаг ретуши
  const [history, setHistory] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const base = items.find((i) => i.id === baseId) || null;
  const current = history.length ? history[history.length - 1] : base?.dataUrl || null;
  const original = history.length ? history[0] : base?.dataUrl || null;

  const addFiles = useCallback(async (list: FileList | File[]) => {
    setImporting(true);
    setError(null);
    try {
      const prepared = await prepareFiles(Array.from(list));
      if (!prepared.length) {
        setError("Не нашёл картинок. Форматы: JPG / PNG / WEBP / PDF / ZIP.");
        return;
      }
      setItems((prev) => [...prev, ...prepared].slice(0, 12));
      setBaseId((prev) => prev || prepared[0].id);
      setHistory([]);
    } catch (e) {
      setError("Ошибка чтения файлов: " + String(e instanceof Error ? e.message : e));
    } finally {
      setImporting(false);
    }
  }, []);

  const run = async () => {
    if (!current || !what.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const resp = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "remove",
          prompt: `Edit the provided photograph. Remove completely and only the following: "${what.trim()}".`,
          image: splitDataUrl(current),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Ошибка ${resp.status}`);
      setHistory((h) => (h.length ? [...h, `data:${data.mediaType};base64,${data.image}`] : [current, `data:${data.mediaType};base64,${data.image}`]));
      setNote(typeof data.note === "string" ? data.note : null);
      setWhat("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const undo = () => setHistory((h) => (h.length > 2 ? h.slice(0, -1) : []));

  const download = () => {
    if (!current) return;
    const a = document.createElement("a");
    a.href = current;
    a.download = "ретушь.png";
    a.click();
  };

  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Ретушь — <span className="glow-text">убрать лишнее</span> с фото
        </h1>
        <p className="mt-2 text-graphite">
          Загрузи фото, ИИ-картинку или файл, напиши что именно убрать — это исчезнет, а фон достроится
          сам. Остальной кадр не трогаем: ракурс, помещение, мебель, люди, цвета и свет остаются как были.
        </p>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="eyebrow">01 · Картинка</p>
          {importing && <span className="text-sm text-graphite">Читаю файлы…</span>}
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center"
        >
          <p className="text-sm text-graphite">Перетащи фото, ИИ-картинку, PDF или ZIP</p>
          <button className="btn-ghost mt-4" onClick={() => fileInput.current?.click()}>
            Выбрать файлы
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,.pdf,.zip"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {items.length > 1 && (
          <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {items.map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  setBaseId(it.id);
                  setHistory([]);
                }}
                className={`overflow-hidden rounded-xl border ${it.id === baseId ? "border-amber ring-2 ring-amber/40" : "border-white/10"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.dataUrl} alt={it.name} className="h-20 w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </section>

      {current && (
        <>
          <section className="card p-5">
            <p className="eyebrow mb-4">02 · Что убрать</p>
            <input
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && run()}
              placeholder="Например: убрать стул слева, провода на стене и коробку у окна"
              className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-violet/60"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setWhat(p)}
                  className="rounded-lg border border-white/12 px-2.5 py-1 text-xs text-graphite transition-colors hover:border-white/40 hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-primary" onClick={run} disabled={busy || !what.trim()}>
                {busy ? "Убираю…" : "Убрать"}
              </button>
              {history.length > 1 && (
                <button className="btn-ghost" onClick={undo} disabled={busy}>
                  ↩ Отменить шаг
                </button>
              )}
              {history.length > 1 && (
                <span className="text-xs text-graphite">
                  шагов ретуши: {history.length - 1} · можно убирать дальше по одному предмету
                </span>
              )}
            </div>
            {error && <p className="mt-3 text-sm text-dimred">{error}</p>}
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="eyebrow">03 · Результат</p>
              {history.length > 1 && (
                <button className="btn-ghost !py-1.5 !text-xs" onClick={download}>
                  Скачать PNG
                </button>
              )}
            </div>
            <div className="p-4">
              {busy ? (
                <div className="flex h-[420px] items-center justify-center">
                  <span className="inline-flex items-center gap-2 text-sm text-graphite">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-graphite border-t-transparent" />
                    Стираю и достраиваю фон…
                  </span>
                </div>
              ) : history.length > 1 ? (
                <PhotoCompare before={original} after={current} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current} alt="Исходник" className="w-full rounded-xl border border-white/10" />
              )}
              {note && <p className="mt-3 text-xs text-graphite">{note}</p>}
            </div>
          </section>
        </>
      )}

      <Mascot mood={busy ? "busy" : error ? "error" : "idle"} />
    </div>
  );
}
