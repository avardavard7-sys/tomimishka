"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <div className="card mx-auto max-w-md p-6 text-sm text-graphite">
        Supabase не настроен. Заполни <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL</span> и{" "}
        <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> в .env — тогда появятся аккаунты и сохранение проектов.
      </div>
    );
  }

  const submit = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        router.push("/");
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw new Error(error.message);
        if (data.session) {
          router.push("/");
        } else {
          setMsg("Аккаунт создан. Если включено подтверждение почты — проверь ящик, либо отключи Confirm email в настройках Supabase Auth.");
        }
      }
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mx-auto mt-10 max-w-md p-6">
      <p className="eyebrow mb-2">{mode === "in" ? "Вход" : "Регистрация"}</p>
      <h1 className="font-display text-xl font-semibold">
        {mode === "in" ? "С возвращением" : "Создать аккаунт"}
      </h1>
      <div className="mt-5 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm outline-none focus:border-violet/60"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="пароль (мин. 6 символов)"
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm outline-none focus:border-violet/60"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn-primary w-full" onClick={submit} disabled={busy || !email || password.length < 6}>
          {busy ? "…" : mode === "in" ? "Войти" : "Зарегистрироваться"}
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-graphite">{msg}</p>}
      <button
        className="mt-4 text-sm text-graphite underline"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
      >
        {mode === "in" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
      </button>
    </div>
  );
}
