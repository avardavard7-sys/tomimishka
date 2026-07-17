"use client";

import type { ViewerApi } from "@/components/Viewer3D";

// A4 landscape @ ~150dpi
const PAGE_W = 1754;
const PAGE_H = 1240;

interface View { name: string; az: number; el: number; dist?: number }

const VIEWS: View[] = [
  { name: "Общий вид · изометрия", az: 38, el: 22 },
  { name: "Обратная изометрия", az: 218, el: 22 },
  { name: "Вид сверху", az: 30, el: 82 },
  { name: "Фронтальный вид", az: 0, el: 6 },
];

// для интерьера листы другие: обзор, два вида изнутри и план
const ROOM_VIEWS: View[] = [
  { name: "Общий вид помещения", az: 38, el: 16 },
  { name: "Вид изнутри", az: 20, el: 2, dist: 1.4 },
  { name: "Вид изнутри · встречный", az: 200, el: 2, dist: 1.4 },
  { name: "План помещения", az: 0, el: 86 },
];

export async function exportSketchPdf(opts: {
  api: ViewerApi;
  title: string;
  dims: string;
  notes?: string;
  isRoom?: boolean;
}): Promise<void> {
  const { api, title, dims, notes, isRoom } = opts;
  const views = isRoom ? ROOM_VIEWS : VIEWS;
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [PAGE_W, PAGE_H] });

  const date = new Date().toLocaleDateString("ru-RU");

  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const shot = await opts.api.capture(view.az, view.el, view.dist);
    const page = await composePage({
      shot,
      title,
      subtitle: view.name,
      dims,
      date,
      pageNum: `${i + 1} / ${views.length}`,
      notes: i === 0 ? notes : undefined,
    });
    if (i > 0) pdf.addPage([PAGE_W, PAGE_H], "landscape");
    pdf.addImage(page, "JPEG", 0, 0, PAGE_W, PAGE_H);
  }

  // восстановить стандартный ракурс
  api.setView(38, isRoom ? 16 : 22);

  pdf.save(`${sanitize(title)} — эскиз.pdf`);
}

async function composePage(p: {
  shot: string;
  title: string;
  subtitle: string;
  dims: string;
  date: string;
  pageNum: string;
  notes?: string;
}): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const pad = 56;

  // шапка
  ctx.fillStyle = "#16150F";
  ctx.font = "600 34px 'Space Grotesk', 'Inter', sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`ЭСКИЗ · ${p.title}`, pad, pad + 26);

  ctx.font = "400 22px 'Inter', sans-serif";
  ctx.fillStyle = "#6B6960";
  ctx.fillText(p.subtitle, pad, pad + 62);

  ctx.textAlign = "right";
  ctx.font = "500 20px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#C43D2F";
  ctx.fillText(p.dims, PAGE_W - pad, pad + 26);
  ctx.fillStyle = "#6B6960";
  ctx.font = "400 18px 'Inter', sans-serif";
  ctx.fillText(`${p.date} · лист ${p.pageNum} · размеры в мм`, PAGE_W - pad, pad + 58);
  ctx.textAlign = "left";

  // янтарная линия — сигнатура
  ctx.fillStyle = "#E8930C";
  ctx.fillRect(pad, pad + 84, PAGE_W - pad * 2, 3);

  // изображение вида (contain)
  const img = await loadImage(p.shot);
  const areaX = pad, areaY = pad + 110;
  const areaW = PAGE_W - pad * 2;
  const areaH = PAGE_H - areaY - 96;
  const k = Math.min(areaW / img.width, areaH / img.height);
  const w = img.width * k, h = img.height * k;
  ctx.drawImage(img, areaX + (areaW - w) / 2, areaY + (areaH - h) / 2, w, h);

  // примечания на первом листе
  if (p.notes) {
    ctx.fillStyle = "#6B6960";
    ctx.font = "400 19px 'Inter', sans-serif";
    wrapText(ctx, `Примечания: ${p.notes}`, pad, PAGE_H - 92, PAGE_W - pad * 2, 24);
  }

  // подвал
  ctx.strokeStyle = "#E3E1DA";
  ctx.beginPath();
  ctx.moveTo(pad, PAGE_H - 52);
  ctx.lineTo(PAGE_W - pad, PAGE_H - 52);
  ctx.stroke();
  ctx.fillStyle = "#9B988E";
  ctx.font = "400 17px 'Inter', sans-serif";
  ctx.fillText("Сгенерировано в ЭСКИЗ AI · параметрическая модель, размеры соответствуют спецификации", pad, PAGE_H - 24);

  return canvas.toDataURL("image/jpeg", 0.92);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number, lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
      if (yy > y + lineHeight) { // максимум 2 строки
        ctx.fillText(line + "…", x, yy);
        return;
      }
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "эскиз";
}
