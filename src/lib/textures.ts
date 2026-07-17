"use client";

import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

// Простая, но убедительная процедурная текстура мрамора: базовый тон + прожилки.
export function marbleTexture(base: string, vein: string): THREE.CanvasTexture {
  const key = `${base}|${vein}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // мягкие облака
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 60 + Math.random() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(vein, 0.05));
    g.addColorStop(1, hexA(vein, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  // прожилки — случайное блуждание
  for (let i = 0; i < 24; i++) {
    let x = Math.random() * S, y = Math.random() * S;
    let ang = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 40 + Math.floor(Math.random() * 50);
    for (let sIdx = 0; sIdx < steps; sIdx++) {
      ang += (Math.random() - 0.5) * 0.9;
      x += Math.cos(ang) * (4 + Math.random() * 7);
      y += Math.sin(ang) * (4 + Math.random() * 7);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = hexA(vein, 0.06 + Math.random() * 0.12);
    ctx.lineWidth = 0.6 + Math.random() * 1.8;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

// Процедурное дерево: доски + волокна. Без этого пол и корпуса выглядят как заливка.
export function woodTexture(base: string): THREE.CanvasTexture {
  const key = `wood|${base}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  const planks = 4;
  const ph = S / planks;
  for (let i = 0; i < planks; i++) {
    const y0 = i * ph;
    ctx.fillStyle = shade(base, (Math.random() - 0.5) * 0.14, 1);
    ctx.fillRect(0, y0, S, ph);
    for (let g = 0; g < 24; g++) {
      let yy = y0 + Math.random() * ph;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      for (let x = 0; x <= S; x += 16) {
        yy += (Math.random() - 0.5) * 3;
        ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = shade(base, -0.3, 0.08 + Math.random() * 0.14);
      ctx.lineWidth = 0.5 + Math.random() * 1.5;
      ctx.stroke();
    }
    ctx.strokeStyle = shade(base, -0.5, 0.55);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(S, y0);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

// осветлить (d>0) или затемнить (d<0) hex-цвет, вернуть rgba-строку
function shade(hex: string, d: number, a: number): string {
  const h = hex.replace("#", "");
  const mix = (v: number) => Math.max(0, Math.min(255, Math.round(d >= 0 ? v + (255 - v) * d : v * (1 + d))));
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `rgba(${r},${g},${b},${a})`;
}

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Спрайт-подпись (размеры на чертеже) — рисуем в canvas, чтобы текст
// попадал в захват PDF (DOM-оверлеи в снимок не попадают).
const labelCache = new Map<string, THREE.Texture>();

export function labelTexture(text: string, color = "#C43D2F"): { tex: THREE.Texture; aspect: number } {
  const key = `${text}|${color}`;
  const hitTex = labelCache.get(key);
  const S = 64;
  const font = `600 ${S * 0.72}px 'JetBrains Mono', ui-monospace, monospace`;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 24;
  const h = S + 12;
  if (hitTex) return { tex: hitTex, aspect: w / h };

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.fillStyle = "rgba(245,244,240,0.85)";
  roundRect(ctx, 0, 0, w, h, 10);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, tex);
  return { tex, aspect: w / h };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
