"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { prepareFiles, splitDataUrl, dataUrlToBlob, SourceItem } from "@/lib/files";
import { DesignSpec, normalizeSpec, dimsSummary, dimsDetail, materialUsage, SAMPLE_SPEC, SAMPLE_ROOM } from "@/lib/spec";
import { getSupabase, isSupabaseConfigured, BUCKET } from "@/lib/supabase";
import { exportSketchPdf } from "@/lib/pdfExport";
import type { ViewerApi } from "@/components/Viewer3D";
import PhotoCompare from "@/components/PhotoCompare";
import { Mascot } from "@/components/Bear";

const Viewer3D = dynamic(() => import("@/components/Viewer3D"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-graphite">Загрузка 3D…</div>,
});

type Preset = { n: string; az: number; el: number; dist?: number };

const VIEW_PRESETS: Preset[] = [
  { n: "Изо", az: 38, el: 22 },
  { n: "Спереди", az: 0, el: 4 },
  { n: "Сбоку", az: 90, el: 4 },
  { n: "Сверху", az: 30, el: 84 },
];

// для интерьера: обзор «кукольного домика», взгляд изнутри и план
const ROOM_PRESETS: Preset[] = [
  { n: "Обзор", az: 38, el: 16 },
  { n: "Внутри", az: 20, el: 2, dist: 1.4 },
  { n: "Внутри 2", az: 200, el: 2, dist: 1.4 },
  { n: "План", az: 0, el: 86 },
];

export default function Workspace() {
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rawSpec, setRawSpec] = useState<unknown>(null);
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");

  const [renderBusy, setRenderBusy] = useState(false);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderNote, setRenderNote] = useState<string | null>(null);

  const [showDims, setShowDims] = useState(true);
  const [refineNote, setRefineNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [photoreal, setPhotoreal] = useState<string | null>(null);
  const [prBusy, setPrBusy] = useState(false);

  const apiRef = useRef<ViewerApi | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const basePhoto = items.find((i) => i.id === baseId) || null;

  const addFiles = useCallback(async (list: FileList | File[]) => {
    setImporting(true);
    setError(null);
    try {
      const prepared = await prepareFiles(Array.from(list));
      if (!prepared.length) {
        setError("Не нашёл поддерживаемых файлов. Форматы: JPG / PNG / WEBP / PDF / ZIP.");
        return;
      }
      setItems((prev) => {
        const next = [...prev, ...prepared];
        return next.slice(0, 12);
      });
      setBaseId((prev) => prev || prepared.find((p) => p.kind === "photo")?.id || null);
    } catch (e) {
      setError("Ошибка чтения файлов: " + String(e instanceof Error ? e.message : e));
    } finally {
      setImporting(false);
    }
  }, []);

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setBaseId((prev) => (prev === id ? null : prev));
  };

  // ---------- генерация ----------

  const startPhotoRender = useCallback(
    async (prompt: string, base: SourceItem | null) => {
      if (!prompt) return;
      setRenderBusy(true);
      setRenderError(null);
      setRenderNote(null);
      setRenderUrl(null);
      try {
        const resp = await fetch("/api/render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt,
            image: base ? splitDataUrl(base.dataUrl) : null,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `Ошибка ${resp.status}`);
        setRenderUrl(`data:${data.mediaType};base64,${data.image}`);
        setRenderNote(typeof data.note === "string" ? data.note : null);
      } catch (e) {
        setRenderError(String(e instanceof Error ? e.message : e));
      } finally {
        setRenderBusy(false);
      }
    },
    [],
  );

  const generate = async (refine = false) => {
    if (!refine && items.length === 0 && brief.trim().length < 8) {
      setError("Добавь исходники (фото / чертежи) или опиши задачу текстом.");
      return;
    }
    setBusy(true);
    setError(null);
    setSavedId(null);
    try {
      const ordered = basePhoto ? [basePhoto, ...items.filter((i) => i.id !== basePhoto.id)] : items;
      const images = ordered.slice(0, 8).map((i) => splitDataUrl(i.dataUrl));
      const body: Record<string, unknown> = { images, brief };
      if (refine && rawSpec) {
        body.prevSpec = JSON.stringify(rawSpec);
        body.refineNote = refineNote;
      }
      const resp = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Ошибка ${resp.status}`);

      setRawSpec(data.spec);
      const next = normalizeSpec(data.spec);
      setSpec(next);
      setShowDims(!next.room); // в интерьере размерные линии мешают смотреть — включаются галочкой
      setPhotoreal(null);
      setTitle(data.title || "Изделие");
      setSummary(data.summary || "");
      setImagePrompt(data.imagePrompt || "");
      if (refine) setRefineNote("");
      startPhotoRender(data.imagePrompt || "", basePhoto);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const loadSample = (kind: "counter" | "room" = "counter") => {
    const sample = kind === "room" ? SAMPLE_ROOM : SAMPLE_SPEC;
    setRawSpec(sample);
    setSpec(sample);
    setShowDims(!sample.room);
    setPhotoreal(null);
    setTitle(sample.title);
    setSummary(
      kind === "room"
        ? "Пример интерьера: спальня 3600 × 4200 мм, потолок 2800.\n\nСтены — мрамор Calacatta, акцентная стена — тёмный Emperador. Пол — паркет дуб, плинтус 80 мм. По периметру потолка карниз со скрытой янтарной LED-подсветкой.\n\nОбстановка: кровать 1800 × 2100 с изголовьем 1100, две тумбы с подвесными светильниками, ковёр 2600 × 2000, ТВ-зона, картина, растение, торшер. Крути мышью, жми «Внутри» — зайдёшь в комнату."
        : "Пример предмета: П-образная стойка 3800 × 3800 мм. Барные фронты 1200 мм (полка 250 / 32 мм), рабочие стороны 900 мм (столешница 40 мм, выступ 50). Облицовка — мрамор, цоколь 100 мм с отступом 50 и янтарной LED-подсветкой, витрина на фронтальной стороне, несущая колонна 600×600 в центре.",
    );
    setImagePrompt("");
    setRenderUrl(null);
    setRenderError(null);
    setError(null);
    setSavedId(null);
  };

  // Фотореализм ровно с того ракурса, который сейчас в окне 3D:
  // снимаем кадр модели и просим сохранить геометрию и камеру, подняв только материалы и свет.
  const makePhotoreal = async () => {
    const api = apiRef.current;
    if (!api || !spec) return;
    setPrBusy(true);
    setError(null);
    const prevDims = showDims;
    setShowDims(false);
    await new Promise((r) => setTimeout(r, 320));
    try {
      const shot = await api.snapshot();
      const mats = materialUsage(spec).map((m) => `${m.label} ${m.hex} (${m.usedFor.join("/")})`).join("; ");
      const resp = await fetch("/api/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "photoreal",
          prompt: `Subject: ${title || spec.title}. Dimensions: ${dimsSummary(spec)}. Materials and finishes: ${mats}.${spec.notes ? " Notes: " + spec.notes : ""}`,
          image: splitDataUrl(shot),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Ошибка ${resp.status}`);
      setPhotoreal(`data:${data.mediaType};base64,${data.image}`);
    } catch (e) {
      setError("Фотореализм с ракурса: " + String(e instanceof Error ? e.message : e));
    } finally {
      setShowDims(prevDims);
      setPrBusy(false);
    }
  };

  // ---------- экспорт ----------

  const doExportPdf = async () => {
    const api = apiRef.current;
    if (!api || !spec) return;
    setExporting(true);
    const prevDims = showDims;
    setShowDims(true);
    await new Promise((r) => setTimeout(r, 200));
    try {
      await exportSketchPdf({ api, title: title || spec.title, dims: dimsSummary(spec), notes: spec.notes, isRoom: !!spec.room });
    } catch (e) {
      setError("Не удалось собрать PDF: " + String(e));
    } finally {
      setShowDims(prevDims);
      setExporting(false);
    }
  };

  const doExportGlb = async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      await api.exportGLB(`${title || "eskiz"}.glb`);
    } catch (e) {
      setError("Не удалось экспортировать GLB: " + String(e));
    }
  };

  const downloadRender = () => {
    if (!renderUrl) return;
    const a = document.createElement("a");
    a.href = renderUrl;
    a.download = `${title || "render"} — рендер.png`;
    a.click();
  };

  // ---------- сохранение ----------

  const saveProject = async () => {
    const sb = getSupabase();
    if (!sb || !user || !spec) return;
    setSaving(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      let basePath: string | null = null;
      let renderPath: string | null = null;

      if (basePhoto) {
        basePath = `${user.id}/${id}/base.jpg`;
        const blob = await dataUrlToBlob(basePhoto.dataUrl);
        const { error: e1 } = await sb.storage.from(BUCKET).upload(basePath, blob, { contentType: "image/jpeg" });
        if (e1) throw new Error(e1.message);
      }
      if (renderUrl) {
        renderPath = `${user.id}/${id}/render.png`;
        const blob = await dataUrlToBlob(renderUrl);
        const { error: e2 } = await sb.storage.from(BUCKET).upload(renderPath, blob, { contentType: "image/png" });
        if (e2) throw new Error(e2.message);
      }

      const { error: e3 } = await sb.from("design_projects").insert({
        id,
        user_id: user.id,
        title: title || spec.title,
        brief,
        spec: rawSpec,
        summary,
        image_prompt: imagePrompt,
        base_photo_path: basePath,
        render_path: renderPath,
        status: "ready",
      });
      if (e3) throw new Error(e3.message);
      setSavedId(id);
    } catch (e) {
      setError("Не удалось сохранить проект: " + String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  // ---------- UI ----------

  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Фото и ТЗ на входе — <span className="glow-text">точный эскиз</span> и фотореализм на выходе
        </h1>
        <p className="mt-2 text-graphite">
          Загрузи фото места и чертежи (JPG / PNG / PDF / ZIP), опиши дизайн, размеры и материалы.
          Мозг соберёт параметрическую 3D-модель с точными размерами (крутится, PDF-эскиз, GLB) и
          фотореалистичный рендер нового дизайна прямо на твоём фото.
        </p>
      </section>

      {!isSupabaseConfigured && (
        <div className="card px-4 py-3 text-sm text-graphite">
          Supabase не настроен — генерация работает, но проекты не сохраняются. Заполни ключи в <span className="font-mono">.env</span>.
        </div>
      )}
      {isSupabaseConfigured && !user && (
        <div className="card flex items-center justify-between gap-4 px-4 py-3 text-sm">
          <span className="text-graphite">Войди, чтобы сохранять проекты и открывать их позже.</span>
          <Link className="btn-ghost !py-1.5" href="/login">Войти</Link>
        </div>
      )}

      {/* 01 — исходники */}
      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="eyebrow">01 · Исходники</p>
          {importing && <Spinner label="Читаю файлы…" />}
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-10 text-center"
        >
          <p className="text-sm text-graphite">Перетащи сюда фото места, чертежи, PDF или ZIP</p>
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

        {items.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <figure
                key={it.id}
                className={`group relative overflow-hidden rounded-xl border bg-white/[0.05] ${
                  it.id === baseId ? "border-amber ring-2 ring-amber/40" : "border-white/10"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.dataUrl} alt={it.name} className="h-32 w-full object-cover" />
                <figcaption className="truncate px-2 py-1.5 text-[11px] text-graphite">{it.name}</figcaption>
                <button
                  onClick={() => setBaseId(it.id)}
                  className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wide ${
                    it.id === baseId ? "bg-amber text-black" : "bg-black/55 text-white/75 hover:text-white"
                  }`}
                  title="Использовать как фото места для рендера"
                >
                  {it.id === baseId ? "ФОТО ДЛЯ РЕНДЕРА" : "СДЕЛАТЬ БАЗОЙ"}
                </button>
                <button
                  onClick={() => removeItem(it.id)}
                  className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded bg-black/60 text-white/80 hover:text-dimred group-hover:flex"
                  aria-label="Убрать файл"
                >
                  ×
                </button>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* 02 — ТЗ */}
      <section className="card p-5">
        <p className="eyebrow mb-4">02 · Что делаем</p>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          placeholder="Например: стойка как на чертеже, но облицовка — тёмный мрамор Nero Marquina, столешницы белый кварц, подсветка тёплая янтарная по цоколю и под столешницами, справа витрина для десертов, барная сторона 1200, рабочие 900…"
          className="w-full resize-y rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm outline-none focus:border-violet/60"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={() => generate(false)} disabled={busy || importing}>
            {busy ? <Spinner light label="Мозг анализирует…" /> : "Сгенерировать эскиз и рендер"}
          </button>
          <button className="btn-ghost" onClick={() => loadSample("room")} disabled={busy}>
            Пример: интерьер спальни
          </button>
          <button className="btn-ghost" onClick={() => loadSample("counter")} disabled={busy}>
            Пример: стойка 3800×3800
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-dimred">{error}</p>}
      </section>

      {/* 03 — результат */}
      {spec && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              03 · {title || spec.title}
            </h2>
            <span className="dim text-sm">{dimsSummary(spec)}</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 3D-эскиз */}
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <p className="eyebrow">Точный 3D-эскиз</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {(spec.room ? ROOM_PRESETS : VIEW_PRESETS).map((v) => (
                      <button
                        key={v.n}
                        onClick={() => apiRef.current?.setView(v.az, v.el, v.dist)}
                        className="rounded-lg border border-white/12 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-graphite transition-colors hover:border-white/40 hover:text-ink"
                      >
                        {v.n}
                      </button>
                    ))}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-graphite">
                    <input
                      type="checkbox"
                      checked={showDims}
                      onChange={(e) => setShowDims(e.target.checked)}
                      className="accent-amber"
                    />
                    размеры
                  </label>
                </div>
              </div>
              <div className="relative h-[420px] bg-[#0E0E14]">
                <Viewer3D spec={spec} showDims={showDims} onApi={(api) => (apiRef.current = api)} />
                {photoreal && (
                  <div className="absolute inset-0 bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoreal} alt="Фотореалистичный вид" className="h-full w-full object-contain" />
                    <button
                      onClick={() => setPhotoreal(null)}
                      className="absolute left-3 top-3 rounded-lg bg-black/65 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/85 hover:text-white"
                    >
                      ← вернуться в 3D
                    </button>
                    <button
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = photoreal;
                        a.download = `${title || "ракурс"} — фотореализм.png`;
                        a.click();
                      }}
                      className="absolute right-3 top-3 rounded-lg bg-black/65 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/85 hover:text-white"
                    >
                      скачать
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
                <button className="btn-primary !py-2" onClick={doExportPdf} disabled={exporting}>
                  {exporting ? <Spinner light label="Собираю листы…" /> : "Скачать PDF-эскиз"}
                </button>
                <button className="btn-ghost !py-2" onClick={doExportGlb}>
                  Скачать 3D (GLB)
                </button>
                <button className="btn-ghost !py-2" onClick={makePhotoreal} disabled={prBusy}>
                  {prBusy ? <Spinner label="Довожу до фото…" /> : "✦ Фотореализм с этого ракурса"}
                </button>
                <span className="ml-auto text-[11px] text-graphite">вращение — мышью, зум — колесом, сдвиг — правой кнопкой</span>
              </div>
            </div>

            {/* фоторендер */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="eyebrow">Фотореалистичный рендер</p>
                {!basePhoto && <span className="text-[11px] text-graphite">без фото места — рендер с нуля</span>}
              </div>
              <div className="p-4">
                {renderBusy && (
                  <div className="flex h-[380px] items-center justify-center">
                    <Spinner label="Рисую новый дизайн на твоём фото…" />
                  </div>
                )}
                {!renderBusy && renderUrl && (
                  <>
                    <PhotoCompare before={basePhoto?.dataUrl} after={renderUrl} />
                    {renderNote && <p className="mt-3 text-xs text-graphite">{renderNote}</p>}
                  </>
                )}
                {!renderBusy && !renderUrl && renderError && (
                  <div className="flex h-[380px] flex-col items-center justify-center gap-3 text-center">
                    <p className="max-w-sm text-sm text-dimred">{renderError}</p>
                    <button className="btn-ghost" onClick={() => startPhotoRender(imagePrompt, basePhoto)}>
                      Повторить рендер
                    </button>
                  </div>
                )}
                {!renderBusy && !renderUrl && !renderError && (
                  <div className="flex h-[380px] items-center justify-center text-sm text-graphite">
                    {imagePrompt
                      ? "Рендер ещё не запускался."
                      : "Для примера фоторендер не выполняется — загрузи свои исходники и нажми «Сгенерировать»."}
                  </div>
                )}
              </div>
              {renderUrl && (
                <div className="flex items-center gap-3 border-t border-line px-4 py-3">
                  <button className="btn-ghost !py-2" onClick={downloadRender}>Скачать PNG</button>
                  <button
                    className="btn-ghost !py-2"
                    onClick={() => startPhotoRender(imagePrompt, basePhoto)}
                    disabled={!imagePrompt}
                  >
                    Перегенерировать
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ТЗ от мозга + правки + сохранение */}
          <div className="card p-5">
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
              <div>
                <p className="eyebrow mb-3">Размеры</p>
                <ul className="space-y-1.5">
                  {dimsDetail(spec).map((l, i) => (
                    <li key={i} className="font-mono text-[13px] leading-snug text-dimred">{l}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-3">Материалы и цвета</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {materialUsage(spec).map((m) => (
                    <div key={m.key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                      <span className="h-9 w-9 shrink-0 rounded-lg border border-white/25" style={{ background: m.color }} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.label}</p>
                        <p className="truncate text-xs text-graphite">
                          {m.kindRus} · <span className="font-mono">{m.hex}</span> · {m.usedFor.join(", ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {summary && (
              <div className="mt-6 border-t border-white/10 pt-5">
                <p className="eyebrow mb-3">Как будет выглядеть</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{summary}</p>
              </div>
            )}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                value={refineNote}
                onChange={(e) => setRefineNote(e.target.value)}
                placeholder="Правки: например — «подсветку сделай синей, фронт 1100, витрину убери»"
                className="flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm outline-none focus:border-violet/60"
              />
              <button
                className="btn-primary"
                onClick={() => generate(true)}
                disabled={busy || !refineNote.trim() || !rawSpec}
              >
                {busy ? <Spinner light label="Вношу…" /> : "Внести правки"}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
              {isSupabaseConfigured && user && !savedId && (
                <button className="btn-ghost" onClick={saveProject} disabled={saving}>
                  {saving ? <Spinner label="Сохраняю…" /> : "Сохранить проект"}
                </button>
              )}
              {savedId && (
                <Link href={`/p/${savedId}`} className="btn-ghost">
                  Проект сохранён — открыть →
                </Link>
              )}
              {isSupabaseConfigured && !user && (
                <span className="text-sm text-graphite">
                  Чтобы сохранить проект, <Link href="/login" className="underline">войди</Link>.
                </span>
              )}
            </div>
          </div>
        </section>
      )}
      <Mascot mood={busy || renderBusy ? "busy" : error || renderError ? "error" : "idle"} />
    </div>
  );
}

function Spinner({ label, light }: { label?: string; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span
        className={`h-4 w-4 animate-spin rounded-full border-2 border-t-transparent ${
          light ? "border-white" : "border-graphite"
        }`}
      />
      {label}
    </span>
  );
}
