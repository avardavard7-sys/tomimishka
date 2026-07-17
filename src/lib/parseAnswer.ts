// Разбор ответа модели: теги + устойчивое извлечение JSON.
// Вынесено отдельным модулем, чтобы покрывалось тестами.

export interface ParsedAnswer {
  spec: unknown;
  title: string;
  summary: string;
  imagePrompt: string;
}

// ---------- разбор ответа ----------

export function parseAnswer(text: string): ParsedAnswer | null {
  const tag = (name: string): string => {
    const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m ? m[1].trim() : "";
  };

  let specRaw: unknown = null;
  const candidates = [tag("spec"), text].filter(Boolean);
  for (const c of candidates) {
    specRaw = tryJson(c);
    if (specRaw) break;
  }
  if (!specRaw || typeof specRaw !== "object") return null;

  return {
    spec: specRaw,
    title: tag("title") || "Изделие",
    summary: tag("summary"),
    imagePrompt: tag("image_prompt"),
  };
}

function tryJson(s: string): unknown {
  const cleaned = s.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // вытаскиваем самый большой сбалансированный объект с "runs"
    const start = cleaned.indexOf("{");
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
        }
      }
    }
    return null;
  }
}
