"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getSupabase, publicUrl } from "@/lib/supabase";
import { DesignSpec, normalizeSpec, dimsSummary, dimsDetail, materialUsage } from "@/lib/spec";
import { exportSketchPdf } from "@/lib/pdfExport";
import type { ViewerApi } from "@/components/Viewer3D";
import PhotoCompare from "@/components/PhotoCompare";

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

interface Row {
  id: string;
  title: string;
  summary: string | null;
  spec: unknown;
  base_photo_path: string | null;
  render_path: string | null;
  created_at: string;
}

export default function ProjectPage({ params }: { params: { id: string } }) {
  const [row, setRow] = useState<Row | null>(null);
  const [spec, setSpec] = useState<DesignSpec | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showDims, setShowDims] = useState(true);
  const [exporting, setExporting] = useState(false);
  const apiRef = useRef<ViewerApi | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setMsg("Supabase не настроен.");
      return;
    }
    sb.from("design_projects")
      .select("*")
      .eq("id", params.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setMsg("Проект не найден (или нет доступа).");
          return;
        }
        setRow(data as Row);
        const next = normalizeSpec((data as Row).spec);
        setSpec(next);
        setShowDims(!next.room);
      });
  }, [params.id]);

  const doExportPdf = async () => {
    if (!apiRef.current || !spec || !row) return;
    setExporting(true);
    const prev = showDims;
    setShowDims(true);
    await new Promise((r) => setTimeout(r, 200));
    try {
      await exportSketchPdf({ api: apiRef.current, title: row.title, dims: dimsSummary(spec), notes: spec.notes, isRoom: !!spec.room });
    } finally {
      setShowDims(prev);
      setExporting(false);
    }
  };

  if (msg) return <p className="text-sm text-graphite">{msg} <Link className="underline" href="/projects">← к проектам</Link></p>;
  if (!row || !spec) return <p className="text-sm text-graphite">Загружаю…</p>;

  const beforeUrl = publicUrl(row.base_photo_path);
  const afterUrl = publicUrl(row.render_path);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{row.title}</h1>
        <span className="dim text-sm">{dimsSummary(spec)}</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
                <input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} className="accent-amber" />
                размеры
              </label>
            </div>
          </div>
          <div className="h-[420px] bg-[#F1F0EB]">
            <Viewer3D spec={spec} showDims={showDims} onApi={(api) => (apiRef.current = api)} />
          </div>
          <div className="flex flex-wrap gap-3 border-t border-line px-4 py-3">
            <button className="btn-primary !py-2" onClick={doExportPdf} disabled={exporting}>
              {exporting ? "Собираю листы…" : "Скачать PDF-эскиз"}
            </button>
            <button className="btn-ghost !py-2" onClick={() => apiRef.current?.exportGLB(`${row.title}.glb`)}>
              Скачать 3D (GLB)
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <p className="eyebrow">Фотореалистичный рендер</p>
          </div>
          <div className="p-4">
            {afterUrl ? (
              <PhotoCompare before={beforeUrl} after={afterUrl} />
            ) : (
              <div className="flex h-[380px] items-center justify-center text-sm text-graphite">
                Рендер не сохранялся для этого проекта.
              </div>
            )}
          </div>
        </div>
      </div>

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
        {row.summary && (
          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="eyebrow mb-3">Как будет выглядеть</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{row.summary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
