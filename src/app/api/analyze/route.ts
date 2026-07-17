import { NextResponse } from "next/server";
import { ANALYZE_SYSTEM, buildUserText } from "@/lib/prompts";
import { parseAnswer } from "@/lib/parseAnswer";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ImagePayload {
  media_type: string;
  data: string; // base64 без префикса
}

// Префилл: ответ ассистента начинается с <title>, поэтому модель
// физически не может начать с уточняющего вопроса или преамбулы.
// Часть моделей префилл не поддерживает — определяем на лету и работаем без него.
const PREFILL = "<title>";
let prefillSupported = true;

const RETRY_HINT =
  "\n\nПОВТОРНАЯ ПОПЫТКА: предыдущий ответ не распарсился. Выдай ТОЛЬКО четыре тега. " +
  "JSON внутри <spec> — строго одной строкой, без переносов, без markdown-заборов, без комментариев.";

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const keyOk = !!apiKey && /^[\x21-\x7E]{20,}$/.test(apiKey) && !apiKey.includes("PASTE");
  if (!keyOk) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY не задан или в .env остался плейсхолдер. Вставь настоящий ключ (sk-ant-...) в .env / переменные Vercel." },
      { status: 500 },
    );
  }

  let body: {
    images?: ImagePayload[];
    brief?: string;
    prevSpec?: string;
    refineNote?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const images = (body.images || []).slice(0, 8);
  const content: unknown[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.media_type || "image/jpeg", data: img.data },
  }));
  content.push({ type: "text", text: buildUserText(body.brief || "", body.prevSpec, body.refineNote) });

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  // до двух разборов: обычный, затем «строгий» на нулевой температуре.
  // +1 запас на случай, если модель отвергнет префилл.
  let lastText = "";
  let lastStop = "";
  let tries = 0;
  for (let loop = 0; loop < 3 && tries < 2; loop++) {
    const usePrefill = prefillSupported;
    let resp: Response;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          temperature: tries === 0 ? 0.2 : 0,
          system: ANALYZE_SYSTEM + (tries === 0 ? "" : RETRY_HINT),
          messages: usePrefill
            ? [{ role: "user", content }, { role: "assistant", content: PREFILL }]
            : [{ role: "user", content }],
        }),
      });
    } catch (e) {
      return NextResponse.json({ error: "Нет связи с Anthropic API: " + String(e) }, { status: 502 });
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      // модель не принимает префилл — отключаем и повторяем, попытку не тратим
      if (resp.status === 400 && /prefill/i.test(detail) && usePrefill) {
        prefillSupported = false;
        continue;
      }
      if (resp.status === 401) {
        return NextResponse.json({ error: "Anthropic: ключ недействителен. Проверь ANTHROPIC_API_KEY в переменных Vercel." }, { status: 502 });
      }
      if (resp.status === 429) {
        return NextResponse.json({ error: "Anthropic: лимит запросов. Подожди минуту и попробуй снова." }, { status: 502 });
      }
      if (resp.status === 400 && detail.includes("credit balance")) {
        return NextResponse.json({ error: "Anthropic: на балансе нет средств. Пополни в console.anthropic.com → Billing." }, { status: 502 });
      }
      return NextResponse.json({ error: `Anthropic API ${resp.status}: ${detail.slice(0, 300)}` }, { status: 502 });
    }

    tries++;
    const data = await resp.json();
    lastStop = data.stop_reason || "";
    const body2: string = Array.isArray(data.content)
      ? data.content
          .filter((c: { type: string }) => c.type === "text")
          .map((c: { text: string }) => c.text)
          .join("\n")
      : "";
    // префилл не приходит в ответе — возвращаем его на место
    const text = (usePrefill ? PREFILL : "") + body2;
    lastText = text;

    const parsed = parseAnswer(text);
    if (parsed) return NextResponse.json(parsed);

    // ответ обрезан лимитом токенов — вторая попытка не поможет
    if (lastStop === "max_tokens") break;
  }

  const hint =
    lastStop === "max_tokens"
      ? "Ответ модели обрезан по лимиту токенов — изделие слишком сложное. Разбей задачу или упрости ТЗ."
      : "Опиши задачу конкретнее: что за изделие, где стоит, размеры и материалы. Пример: «прихожая 2200×400, высота 2400, шкаф с 3 дверцами, дуб + чёрный металл».";
  const said = lastText.replace(/\s+/g, " ").slice(0, 180);

  return NextResponse.json(
    { error: `Мозг не вернул валидный спек. ${hint}${said ? ` (ответ модели: «${said}…»)` : ""}` },
    { status: 502 },
  );
}
