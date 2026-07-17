// ============================================================
// Параметрическая мебель: тип + габариты -> набор примитивов.
// Никакой генерации: каждый предмет собирается математикой из w/d/h,
// поэтому масштаб в комнате всегда честный.
// ============================================================

import { FurnitureSpec, DesignSpec } from "./spec";

export interface Prim {
  shape: "box" | "glass";
  size: [number, number, number]; // мм [ширина, высота, глубина] в локальной системе
  pos: [number, number, number]; // мм, центр в локальной системе (x поперёк, y вверх, z вглубь)
  mat: string;
}

// Локальная система предмета: +X — вправо (ширина w), +Z — вперёд (глубина d),
// начало — центр пятна в плане, y=0 — пол. rot=0 => спинка/изголовье смотрит в -Z.
export function buildFurniture(f: FurnitureSpec, spec: DesignSpec): Prim[] {
  const p: Prim[] = [];
  const put = (x: number, y: number, z: number, w: number, h: number, d: number, mat: string, shape: Prim["shape"] = "box") => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    p.push({ shape, size: [w, h, d], pos: [x, y, z], mat });
  };

  const W = f.w, D = f.d, H = f.h;
  const body = f.material || "__inner";
  const acc = f.accent || body;
  const ceilH = spec.room?.height ?? 2800;

  switch (f.type) {
    case "bed": {
      // H — высота изголовья
      const baseH = 300, matH = 250;
      put(0, baseH / 2, 0, W, baseH, D, body); // основание
      put(0, baseH + matH / 2, 0, W - 60, matH, D - 60, acc); // матрас
      put(0, baseH + matH + 35, D * 0.12, W - 30, 70, D * 0.6, acc); // одеяло
      put(0, H / 2, -D / 2 - 45, W + 180, H, 90, body); // изголовье
      const pw = Math.min(620, W / 2 - 70);
      if (pw > 100) {
        put(-(pw / 2 + 40), baseH + matH + 80, -D / 2 + 300, pw, 150, 400, acc);
        put(+(pw / 2 + 40), baseH + matH + 80, -D / 2 + 300, pw, 150, 400, acc);
      }
      break;
    }

    case "nightstand":
    case "tv_unit":
    case "shelf": {
      put(0, H / 2, 0, W, H, D, body);
      const n = f.type === "shelf" ? 0 : Math.max(1, Math.round(W / 500));
      for (let i = 0; i < n; i++) {
        const dw = W / n;
        put(-W / 2 + dw * (i + 0.5), H * 0.6, D / 2 + 9, dw - 60, H * 0.28, 18, acc);
      }
      break;
    }

    case "wardrobe": {
      put(0, H / 2, 0, W, H, D, body);
      const n = Math.max(1, Math.round(W / 600));
      const dw = W / n;
      for (let i = 0; i < n; i++) {
        put(-W / 2 + dw * (i + 0.5), H / 2 + 30, D / 2 + 10, dw - 14, H - 90, 20, acc);
        put(-W / 2 + dw * (i + 0.5) + dw / 2 - 40, H / 2, D / 2 + 22, 14, 220, 14, "__metal");
      }
      break;
    }

    case "sofa":
    case "armchair": {
      const seatH = Math.min(430, H * 0.55);
      const armW = Math.min(140, W * 0.14);
      put(0, seatH / 2, 0, W, seatH, D, body);
      put(0, H / 2, -D / 2 + 100, W, H, 200, body); // спинка
      put(-W / 2 + armW / 2, H * 0.52, 0, armW, H * 0.5, D, body);
      put(+W / 2 - armW / 2, H * 0.52, 0, armW, H * 0.5, D, body);
      put(0, seatH + 75, 70, W - armW * 2 - 40, 150, D - 260, acc); // сиденье
      break;
    }

    case "table":
    case "coffee_table":
    case "desk": {
      const tt = f.type === "coffee_table" ? 30 : 40;
      put(0, H - tt / 2, 0, W, tt, D, body);
      const lx = W / 2 - 70, lz = D / 2 - 70;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        put(sx * lx, (H - tt) / 2, sz * lz, 60, H - tt, 60, body);
      }
      break;
    }

    case "chair": {
      const seatH = Math.min(460, H * 0.5), tt = 40;
      put(0, seatH - tt / 2, 0, W, tt, D, body);
      put(0, seatH + (H - seatH) / 2, -D / 2 + 25, W, H - seatH, 45, body);
      const lx = W / 2 - 45, lz = D / 2 - 45;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        put(sx * lx, (seatH - tt) / 2, sz * lz, 40, seatH - tt, 40, body);
      }
      break;
    }

    case "tv": {
      const y = f.y ?? 1100;
      put(0, y + H / 2, 0, W, H, Math.max(D, 40), "__screen");
      put(0, y + H / 2, Math.max(D, 40) / 2 + 6, W - 40, H - 40, 8, "__screen_face");
      break;
    }

    case "rug": {
      put(0, 8, 0, W, 16, D, acc);
      break;
    }

    case "artwork":
    case "mirror": {
      const y = f.y ?? 1500;
      put(0, y, 0, W, H, 35, body); // рама
      put(0, y, 20, W - 90, H - 90, 10, f.type === "mirror" ? "__mirror" : acc);
      break;
    }

    case "pendant": {
      const y = f.y ?? Math.max(900, ceilH - 1100);
      put(0, (y + H / 2 + ceilH) / 2, 0, 18, ceilH - y - H / 2, 18, "__metal");
      put(0, y, 0, W, H, D, "__lamp");
      break;
    }

    case "floor_lamp": {
      const shadeH = Math.min(320, H * 0.25);
      put(0, (H - shadeH) / 2, 0, 40, H - shadeH, 40, "__metal");
      put(0, 15, 0, Math.max(W, 260), 30, Math.max(D, 260), "__metal");
      put(0, H - shadeH / 2, 0, W, shadeH, D, "__lamp");
      break;
    }

    case "plant": {
      const potH = Math.min(380, H * 0.32);
      put(0, potH / 2, 0, W * 0.55, potH, D * 0.55, body);
      put(0, potH + (H - potH) / 2, 0, W, H - potH, D, "__plant");
      break;
    }

    case "door": {
      const y = f.y ?? 0;
      put(0, y + H / 2, 0, W, H, Math.max(D, 50), body);
      put(W / 2 - 90, y + 1050, Math.max(D, 50) / 2 + 15, 90, 30, 30, "__metal");
      break;
    }

    case "window": {
      const y = f.y ?? 800;
      put(0, y + H / 2, 0, W, H, Math.max(D, 40), body); // рама
      put(0, y + H / 2, 0, W - 100, H - 100, Math.max(D, 40) + 10, "__glass_pane", "glass");
      break;
    }

    default:
      put(0, H / 2, 0, W, H, D, body);
  }

  return p;
}
