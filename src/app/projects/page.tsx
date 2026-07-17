"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, isSupabaseConfigured, publicUrl } from "@/lib/supabase";

interface Row {
  id: string;
  title: string;
  created_at: string;
  render_path: string | null;
  base_photo_path: string | null;
}

export default function ProjectsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setMsg("Supabase не настроен — сохранение проектов недоступно.");
      setRows([]);
      return;
    }
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setMsg("Войди, чтобы видеть свои проекты.");
        setRows([]);
        return;
      }
      const { data: list, error } = await sb
        .from("design_projects")
        .select("id,title,created_at,render_path,base_photo_path")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) setMsg(error.message);
      setRows(list || []);
    });
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Проекты</h1>
        <Link href="/" className="btn-ghost !py-1.5">+ Новый</Link>
      </div>

      {msg && <p className="mb-4 text-sm text-graphite">{msg}</p>}
      {rows === null && <p className="text-sm text-graphite">Загружаю…</p>}
      {rows && rows.length === 0 && !msg && (
        <p className="text-sm text-graphite">Пока пусто. Сгенерируй первый эскиз и нажми «Сохранить проект».</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows?.map((r) => {
          const img = publicUrl(r.render_path || r.base_photo_path);
          return (
            <Link key={r.id} href={`/p/${r.id}`} className="card overflow-hidden transition hover:border-ink/40">
              <div className="h-40 bg-white/[0.03]">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={r.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-graphite">без превью</div>
                )}
              </div>
              <div className="px-4 py-3">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 text-xs text-graphite">
                  {new Date(r.created_at).toLocaleDateString("ru-RU")}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
