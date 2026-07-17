"use client";

// Подготовка исходников на клиенте: любые фото, PDF (постранично в картинки),
// ZIP (вытаскиваем картинки и PDF изнутри). Всё приводится к JPEG <= 1568px.

export interface SourceItem {
  id: string;
  name: string;
  kind: "photo" | "drawing";
  dataUrl: string; // data:image/jpeg;base64,...
  mediaType: string;
}

const MAX_SIDE = 1568;
const PDFJS_VERSION = "4.8.69";

let uid = 0;
const nextId = () => `src_${Date.now()}_${uid++}`;

export async function prepareFiles(files: File[]): Promise<SourceItem[]> {
  const out: SourceItem[] = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (/\.(png|jpe?g|webp|gif|bmp)$/.test(name) || file.type.startsWith("image/")) {
      out.push(await fromImageBlob(file, file.name, "photo"));
    } else if (name.endsWith(".pdf") || file.type === "application/pdf") {
      out.push(...(await fromPdf(file, file.name)));
    } else if (name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") {
      out.push(...(await fromZip(file)));
    }
  }
  return out;
}

async function fromImageBlob(blob: Blob, name: string, kind: SourceItem["kind"]): Promise<SourceItem> {
  const dataUrl = await downscale(blob);
  return { id: nextId(), name, kind, dataUrl, mediaType: "image/jpeg" };
}

async function fromPdf(blob: Blob, name: string): Promise<SourceItem[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

  const buf = await blob.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages = Math.min(doc.numPages, 10);
  const items: SourceItem[] = [];

  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_SIDE / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    items.push({
      id: nextId(),
      name: `${name} · стр. ${i}`,
      kind: "drawing",
      dataUrl: canvas.toDataURL("image/jpeg", 0.88),
      mediaType: "image/jpeg",
    });
  }
  return items;
}

async function fromZip(blob: Blob): Promise<SourceItem[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(blob);
  const items: SourceItem[] = [];
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  for (const entry of entries.slice(0, 24)) {
    const lower = entry.name.toLowerCase();
    if (/\.(png|jpe?g|webp)$/.test(lower)) {
      const b = await entry.async("blob");
      items.push(await fromImageBlob(b, entry.name.split("/").pop() || entry.name, "photo"));
    } else if (lower.endsWith(".pdf")) {
      const b = await entry.async("blob");
      items.push(...(await fromPdf(b, entry.name.split("/").pop() || entry.name)));
    }
  }
  return items;
}

function downscale(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k));
      const h = Math.max(1, Math.round(img.height * k));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.87));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    img.src = url;
  });
}

export function splitDataUrl(dataUrl: string): { media_type: string; data: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return { media_type: "image/jpeg", data: "" };
  return { media_type: m[1], data: m[2] };
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const resp = await fetch(dataUrl);
  return resp.blob();
}
