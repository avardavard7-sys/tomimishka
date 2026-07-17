"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const isSupabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createClient(url, anon);
  return client;
}

export const BUCKET = "design-projects";

export function publicUrl(path: string | null | undefined): string | null {
  const sb = getSupabase();
  if (!sb || !path) return null;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
