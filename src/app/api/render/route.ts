import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export type RenderMode = "edit" | "generate" | "photoreal" | "remove";

interface RenderBody {
  prompt: string;
  image?: { media_type: string; data: string } | null; // base64 без префикса
  mode?: RenderMode;
}

// Железные правила редактирования — дописываются на сервере ВСЕГДА,
// чтобы модель не перерисовывала комнату вокруг изделия.
const PRESERVE_RULES =
  " CRITICAL EDITING RULES: This is a targeted local edit of the provided photograph, not a re-generation. " +
  "Keep the original photograph identical everywhere outside the edited element: exact same camera position, focal length and perspective; " +
  "exact same room geometry, walls, floor, ceiling, windows and doors; exact same existing furniture, objects, decor, plants and people; " +
  "exact same colors, white balance, shadows and overall lighting. Do not restyle, recolor, relight, tidy up, crop, zoom, rotate or reframe the rest of the scene. " +
  "Only add or replace the described element, matched to the scene's existing perspective, scale and lighting so it looks naturally photographed in place. " +
  "Ultra-photorealistic, high-end interior photography, no text, no watermarks, no borders.";

const GENERATE_RULES =
  " Ultra-photorealistic, high-end interior photography, natural lighting, no text, no watermarks, no borders.";

// Апгрейд 3D-вида до фотореализма БЕЗ смены геометрии и ракурса.
const PHOTOREAL_RULES =
  " This image is a 3D massing view of an interior. Turn it into an ultra-photorealistic architectural interior photograph. " +
  "CRITICAL: keep the EXACT same camera position, focal length, perspective and composition, and the EXACT same geometry — " +
  "every wall, opening, furniture piece and decorative element must stay precisely in its current position, proportion and scale. " +
  "Do not move, add, remove, resize, rearrange or restyle anything. Do not change the layout. " +
  "Only upgrade realism: true material textures, physically correct lighting, soft and contact shadows, subtle reflections, " +
  "fine photographic detail and natural depth. Architectural interior photography, no text, no watermarks, no borders.";

// Удаление объектов: стереть и достроить фон, не трогая остальной кадр.
const REMOVE_RULES =
  " Erase those objects entirely and reconstruct what would realistically be behind them — continue the surrounding surfaces, " +
  "textures, patterns, seams, grain, joints and perspective so it looks like the objects were never there. " +
  "No blur, no smudging, no cloned artifacts, no leftover shadows, reflections or outlines of the removed objects. " +
  "CRITICAL: everything else must stay pixel-identical — same camera, same framing and crop, same aspect ratio and resolution, " +
  "same room, same furniture, same people, same colors, white balance, shadows and lighting. " +
  "Do not restyle, relight, recolor, sharpen, denoise, upscale or re-render any other part of the image. " +
  "Ultra-photorealistic, no text, no watermarks, no borders.";

export async function POST(req: Request) {
  let body: RenderBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (!body.prompt) {
    return NextResponse.json({ error: "Пустой промт рендера." }, { status: 400 });
  }

  const provider = (process.env.IMAGE_PROVIDER || "gemini").toLowerCase();
  const falKey = process.env.FAL_KEY;
  const hasFal = !!falKey && !falKey.includes("PASTE") && falKey.length > 10;

  const mode: RenderMode = body.mode || (body.image?.data ? "edit" : "generate");
  const rules =
    mode === "photoreal" ? PHOTOREAL_RULES
      : mode === "remove" ? REMOVE_RULES
        : body.image?.data ? PRESERVE_RULES
          : GENERATE_RULES;

  const job: RenderBody = { image: body.image, prompt: body.prompt + rules };

  if ((mode === "photoreal" || mode === "remove") && !body.image?.data) {
    return NextResponse.json({ error: "Для этого режима нужна исходная картинка." }, { status: 400 });
  }

  try {
    if (provider === "fal") return NextResponse.json(await renderFal(job));
    return NextResponse.json(await renderGemini(job));
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    // автофолбэк: Gemini лёг (квота/сбой) → пробуем fal.ai, если ключ есть
    if (provider !== "fal" && hasFal && job.image?.data) {
      try {
        const out = await renderFal(job);
        return NextResponse.json({ ...out, note: "Gemini недоступен — рендер сделан через fal.ai Flux Kontext." });
      } catch (e2) {
        return NextResponse.json(
          { error: `${msg}\n\nfal.ai тоже не смог: ${String(e2 instanceof Error ? e2.message : e2)}` },
          { status: 502 },
        );
      }
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ---------- Gemini 2.5 Flash Image (Nano Banana): и правка фото, и генерация с нуля ----------
async function renderGemini(body: RenderBody) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !/^[\x21-\x7E]{20,}$/.test(key) || key.includes("PASTE"))
    throw new Error("GEMINI_API_KEY не задан или в .env остался плейсхолдер. Возьми ключ на aistudio.google.com и вставь в .env / Vercel.");
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

  const parts: unknown[] = [];
  if (body.image?.data) {
    parts.push({ inline_data: { mime_type: body.image.media_type || "image/jpeg", data: body.image.data } });
  }
  parts.push({ text: body.prompt });

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    },
  );

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    if (resp.status === 429) {
      throw new Error(
        "Gemini: квота исчерпана. У ключа нет бесплатного лимита на генерацию картинок (free tier limit: 0) — " +
          "модель gemini-2.5-flash-image платная. Что делать: 1) включить биллинг в Google AI Studio → Get API key → Set up Billing " +
          "(оплата по факту, ~$0.04 за картинку); либо 2) взять ключ на fal.ai/dashboard/keys и добавить в Vercel FAL_KEY и IMAGE_PROVIDER=fal.",
      );
    }
    if (resp.status === 400 && detail.includes("API key not valid")) {
      throw new Error("Gemini: ключ недействителен. Проверь GEMINI_API_KEY в переменных Vercel.");
    }
    throw new Error(`Gemini API ${resp.status}: ${detail.slice(0, 300)}`);
  }

  const data = await resp.json();
  const partsOut: Array<{ inlineData?: { data: string; mimeType?: string }; text?: string }> =
    data?.candidates?.[0]?.content?.parts || [];
  const img = partsOut.find((p) => p.inlineData?.data);
  if (!img?.inlineData) {
    const reason = data?.candidates?.[0]?.finishReason || "нет изображения в ответе";
    throw new Error(`Gemini не вернул картинку (${reason}). Попробуй переформулировать ТЗ.`);
  }
  return { image: img.inlineData.data, mediaType: img.inlineData.mimeType || "image/png" };
}

// ---------- fal.ai Flux Kontext (только правка по фото) ----------
async function renderFal(body: RenderBody) {
  const key = process.env.FAL_KEY;
  if (!key || !/^[\x21-\x7E]{10,}$/.test(key)) throw new Error("FAL_KEY не задан для IMAGE_PROVIDER=fal.");
  if (!body.image?.data) {
    throw new Error("Flux Kontext работает только с исходным фото. Загрузи фото места или переключись на IMAGE_PROVIDER=gemini.");
  }

  const resp = await fetch("https://fal.run/fal-ai/flux-pro/kontext", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Key ${key}`,
    },
    body: JSON.stringify({
      prompt: body.prompt,
      image_url: `data:${body.image.media_type || "image/jpeg"};base64,${body.image.data}`,
      guidance_scale: 3.5,
      output_format: "png",
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`fal.ai ${resp.status}: ${detail.slice(0, 400)}`);
  }

  const data = await resp.json();
  const url: string | undefined = data?.images?.[0]?.url;
  if (!url) throw new Error("fal.ai не вернул картинку.");

  const imgResp = await fetch(url);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  return { image: buf.toString("base64"), mediaType: "image/png" };
}
