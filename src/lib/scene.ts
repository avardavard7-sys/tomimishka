// ============================================================
// Детерминированный построитель геометрии: DesignSpec -> примитивы.
// Никакой генерации "на глаз": каждый миллиметр из спека попадает
// в модель и в размерные линии как есть.
// Вход — мм, выход — метры (для three.js).
// ============================================================

import { DesignSpec, RunSpec, RoomSpec, FurnitureSpec, specBounds } from "./spec";
import { buildFurniture } from "./furniture";

export interface SceneNode {
  shape: "box" | "glass" | "plane";
  size: [number, number, number]; // метры: box [вдоль, высота, поперёк], plane [ширина, высота, 0]
  pos: [number, number, number];
  rot: [number, number, number]; // Euler, порядок YXZ
  mat: string; // ключ материала или служебный: __led __inner __equipment __cove __screen ...
  uv?: [number, number]; // повтор текстуры (крупные поверхности не должны быть размазаны)
}

export interface DimLine {
  a: [number, number, number];
  b: [number, number, number];
  label: string;
}

export interface TextLabel {
  pos: [number, number, number];
  text: string;
}

export interface BuiltScene {
  nodes: SceneNode[];
  dims: DimLine[];
  labels: TextLabel[];
  center: [number, number, number];
  radius: number;
  room?: { w: number; d: number; h: number }; // метры — вьювер ставит внутренний свет и камеру
}

const M = (mm: number) => mm / 1000;

export function buildScene(spec: DesignSpec): BuiltScene {
  const nodes: SceneNode[] = [];
  const dims: DimLine[] = [];
  const labels: TextLabel[] = [];

  // центр изделия в плане — для автоопределения "наружу"
  let cx = 0, cz = 0, cn = 0;
  for (const r of spec.runs) {
    cx += (r.from[0] + r.to[0]) / 2;
    cz += (r.from[1] + r.to[1]) / 2;
    cn++;
  }
  if (cn > 0) { cx /= cn; cz /= cn; }

  if (spec.room) buildRoom(spec.room, spec, nodes);
  for (const f of spec.furniture) placeFurniture(f, spec, nodes);

  const globalMaxH = Math.max(...spec.runs.map((r) => r.height), 900);

  for (const run of spec.runs) {
    buildRun(run, { cx, cz, globalMaxH }, nodes, labels);
  }

  // колонны
  for (const c of spec.columns) {
    nodes.push({
      shape: "box",
      size: [M(c.w), M(c.h), M(c.d)],
      pos: [M(c.x), M(c.h / 2), M(c.z)],
      rot: [0, 0, 0],
      mat: c.material,
    });
  }

  // оборудование
  for (const e of spec.equipment) {
    const y = e.y ?? 900;
    nodes.push({
      shape: "box",
      size: [M(e.w), M(e.h), M(e.d)],
      pos: [M(e.x), M(y + e.h / 2), M(e.z)],
      rot: [0, 0, 0],
      mat: "__equipment",
    });
  }

  // ---- размерные линии (габариты) ----
  const b = specBounds(spec);
  const off = 380;
  if (b.width >= 100) {
    dims.push({
      a: [M(b.minX), M(30), M(b.maxZ + off)],
      b: [M(b.maxX), M(30), M(b.maxZ + off)],
      label: `${b.width}`,
    });
  }
  if (b.depth >= 100) {
    dims.push({
      a: [M(b.maxX + off), M(30), M(b.minZ)],
      b: [M(b.maxX + off), M(30), M(b.maxZ)],
      label: `${b.depth}`,
    });
  }
  dims.push({
    a: [M(b.maxX + 240), 0, M(b.maxZ + 240)],
    b: [M(b.maxX + 240), M(b.maxH), M(b.maxZ + 240)],
    label: `${b.maxH}`,
  });
  // вторая высота (если есть, напр. 900 при максимуме 1200)
  const other = spec.runs.find((r) => (r.elevation || 0) + r.height !== b.maxH);
  if (other) {
    const mid = midOuter(other, cx, cz, 200);
    dims.push({
      a: [M(mid[0]), 0, M(mid[1])],
      b: [M(mid[0]), M(other.height), M(mid[1])],
      label: `${other.height}`,
    });
  }

  const center: [number, number, number] = spec.room
    ? [M(spec.room.width / 2), M(Math.min(1600, spec.room.height * 0.55)), M(spec.room.depth / 2)]
    : [M((b.minX + b.maxX) / 2), M(b.maxH / 2), M((b.minZ + b.maxZ) / 2)];
  const radius = M(Math.max(b.width, b.depth, b.maxH)) || 2;

  return {
    nodes, dims, labels, center, radius,
    room: spec.room ? { w: M(spec.room.width), d: M(spec.room.depth), h: M(spec.room.height) } : undefined,
  };
}

// внешняя точка на середине участка, отстоящая на dist наружу
function midOuter(run: RunSpec, cx: number, cz: number, dist: number): [number, number] {
  const [fx, fz] = run.from;
  const [tx, tz] = run.to;
  const dx = tx - fx, dz = tz - fz;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  let ox = -uz, oz = ux;
  const mx = (fx + tx) / 2, mz = (fz + tz) / 2;
  if ((mx - cx) * ox + (mz - cz) * oz < 0) { ox = -ox; oz = -oz; }
  return [mx + ox * dist, mz + oz * dist];
}

function buildRun(
  run: RunSpec,
  ctx: { cx: number; cz: number; globalMaxH: number },
  nodes: SceneNode[],
  labels: TextLabel[],
) {
  const [fx, fz] = run.from;
  const [tx, tz] = run.to;
  const dx = tx - fx, dz = tz - fz;
  const len = Math.hypot(dx, dz);
  if (len < 1) return;
  const ux = dx / len, uz = dz / len;

  // наружная нормаль (в сторону от центра изделия)
  let ox = -uz, oz = ux;
  const mx = (fx + tx) / 2, mz = (fz + tz) / 2;
  if ((mx - ctx.cx) * ox + (mz - ctx.cz) * oz < 0) { ox = -ox; oz = -oz; }

  // поворот бокса: локальная +X вдоль участка
  const rotY = Math.atan2(-uz, ux);
  // куда смотрит локальная +Z после поворота (наружу или внутрь)
  const zwx = Math.sin(rotY), zwz = Math.cos(rotY);
  const s2 = Math.sign(zwx * ox + zwz * oz) || 1; // +1: локальная +Z = наружу

  // t — вдоль участка от run.from (центр), s — поперёк (плюс = наружу), y — центр по высоте
  const box = (
    t: number, s: number, y: number,
    L: number, H: number, W: number,
    mat: string, shape: SceneNode["shape"] = "box",
    rotX = 0,
  ) => {
    nodes.push({
      shape,
      size: [M(L), M(H), M(W)],
      pos: [M(fx + ux * t + ox * s), M(y), M(fz + uz * t + oz * s)],
      rot: [rotX, rotY, 0],
      mat,
    });
  };

  const D = run.depth;
  const H = run.height;
  const th = run.counterThickness;
  const ov = run.counterOverhang;
  const ph = run.plinth.height;
  const pi = run.plinth.inset;

  // ---- плоская декоративная панель: только полотно, без столешницы/цоколя/тумб ----
  if (run.tier === "panel") {
    const y0 = run.elevation ?? 0;
    box(len / 2, -D / 2, y0 + H / 2, len, H, D, run.claddingMaterial);
    if (run.topLed) {
      const w = Math.max(len - 60, 20);
      box(len / 2, -(D + 8), y0 + H - 25, w, 14, 14, "__led");
      box(len / 2, -(D + 8), y0 + 25, w, 14, 14, "__led");
    }
    labels.push(lenLabel(fx, fz, ux, uz, ox, oz, len, y0 + H, ov));
    return;
  }

  // ---- цоколь (с подсветкой) ----
  box(len / 2, -(pi + (D - pi) / 2), ph / 2, len, ph, D - pi, run.plinth.led ? "__led" : "__inner");

  if (run.tier === "bar") {
    // высокий фронт 1200: стенка + узкая барная полка + внутренняя рабочая 900
    const wallW = 60;
    const btd = run.barTopDepth ?? 250;
    const wallH = H - ph - th;
    box(len / 2, -wallW / 2, ph + wallH / 2, len, wallH, wallW, run.claddingMaterial);
    // барная полка сверху (выступ наружу ov)
    box(len / 2, ov - btd / 2, H - th / 2, len, th, btd, run.counterMaterial);
    // внутренняя столешница 900
    const innerD = Math.max(D - wallW, 100);
    box(len / 2, -(wallW + innerD / 2), 900 - 20, len, 40, innerD, run.counterMaterial);
    // внутренние тумбы
    const cabH = 860 - ph;
    box(len / 2, -(wallW + innerD / 2), ph + cabH / 2, len, cabH, innerD, "__inner");
    // LED под барной полкой
    if (run.topLed) box(len / 2, ov - 12, H - th - 6, Math.max(len - 20, 20), 10, 10, "__led");
    // дверцы модулей с внутренней стороны
    if (run.modules?.length) doors(run.modules, len, D, ph, 860, box);
    labels.push(lenLabel(fx, fz, ux, uz, ox, oz, len, H, ov));
    return;
  }

  if (run.front === "vitrine") {
    // витрина: низкий подиум + наклонное стекло + задняя тумба со столешницей
    const vd = Math.min(450, Math.round(D * 0.75));
    const baseTop = 500;
    box(len / 2, -vd / 2, ph + (baseTop - ph) / 2, len, baseTop - ph, vd, run.claddingMaterial);
    box(len / 2, -vd / 2, baseTop + 10, len, 20, vd, "__vitrineFloor");
    // стекло: от передней кромки (y=520) к задней верхней точке (y=glassTop)
    const glassTop = Math.max(ctx.globalMaxH, H + 250);
    const rise = glassTop - 520;
    const span = vd;
    const slab = Math.hypot(rise, span);
    const alpha = Math.atan2(-s2 * span, rise);
    box(len / 2, -span / 2, (520 + glassTop) / 2, len - 30, slab, 12, "__glass", "glass", alpha);
    // задняя тумба
    const backD = D - vd;
    if (backD > 60) {
      box(len / 2, -(vd + backD / 2), ph + (H - ph - th) / 2, len, H - ph - th, backD, run.claddingMaterial);
      box(len / 2, -(vd + backD / 2), H - th / 2, len, th, backD + 30, run.counterMaterial);
    }
    labels.push(lenLabel(fx, fz, ux, uz, ox, oz, len, H, ov));
    return;
  }

  // ---- обычный рабочий участок 900 ----
  const bodyH = H - ph - th;
  box(len / 2, -D / 2, ph + bodyH / 2, len, bodyH, D, run.claddingMaterial);
  // столешница с выступом наружу
  box(len / 2, -(D - ov) / 2, H - th / 2, len, th, D + ov, run.counterMaterial);
  // LED под кромкой столешницы
  if (run.topLed) box(len / 2, ov - 12, H - th - 6, Math.max(len - 20, 20), 10, 10, "__led");
  // внутренняя белая обшивка
  box(len / 2, -(D + 3), ph + bodyH / 2, len, bodyH, 6, "__inner");
  // дверцы модулей
  if (run.modules?.length) doors(run.modules, len, D, ph, H - th, box);

  labels.push(lenLabel(fx, fz, ux, uz, ox, oz, len, H, ov));
}

function doors(
  modules: number[], len: number, D: number, ph: number, topY: number,
  box: (t: number, s: number, y: number, L: number, H: number, W: number, mat: string) => void,
) {
  const total = modules.reduce((a, b) => a + b, 0);
  let cursor = Math.max(20, (len - total) / 2);
  const Hd = topY - ph - 14;
  for (const w of modules) {
    if (cursor + w > len - 10) break;
    box(cursor + w / 2, -(D + 13), ph + 7 + Hd / 2, w - 6, Hd, 16, "__inner");
    cursor += w;
  }
}

function lenLabel(
  fx: number, fz: number, ux: number, uz: number,
  ox: number, oz: number, len: number, H: number, ov: number,
): TextLabel {
  const t = len / 2, s = ov + 60;
  return {
    pos: [M(fx + ux * t + ox * s), M(H + 140), M(fz + uz * t + oz * s)],
    text: `${Math.round(len)}`,
  };
}


// ============================================================
// Комната: оболочка интерьера
// ============================================================

// Крупные поверхности нельзя красить одной растянутой текстурой —
// считаем честный повтор от физического размера.
function uvFor(spec: DesignSpec, matKey: string, wM: number, hM: number): [number, number] | undefined {
  const def = spec.materials[matKey];
  if (!def) return undefined;
  const tile = def.kind === "marble" ? 1.6 : def.kind === "wood" ? 1.1 : 0;
  if (!tile) return undefined;
  const r = (v: number) => Math.max(1, Math.round((v / tile) * 2) / 2);
  return [r(wM), r(hM)];
}

function buildRoom(room: RoomSpec, spec: DesignSpec, nodes: SceneNode[]) {
  const W = room.width, D = room.depth, H = room.height;

  const plane = (w: number, h: number, pos: [number, number, number], rot: [number, number, number], mat: string) => {
    nodes.push({
      shape: "plane",
      size: [M(w), M(h), 0],
      pos: [M(pos[0]), M(pos[1]), M(pos[2])],
      rot, mat,
      uv: uvFor(spec, mat, M(w), M(h)),
    });
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: string) => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    nodes.push({
      shape: "box",
      size: [M(w), M(h), M(d)],
      pos: [M(x), M(y), M(z)],
      rot: [0, 0, 0], mat,
      uv: uvFor(spec, mat, M(w), M(h)),
    });
  };

  // пол (нормаль вверх) и потолок (нормаль вниз)
  plane(W, D, [W / 2, 0, D / 2], [-Math.PI / 2, 0, 0], room.floorMaterial);
  plane(W, D, [W / 2, H, D / 2], [Math.PI / 2, 0, 0], room.ceilingMaterial);

  // стены — нормалью ВНУТРЬ комнаты. Снаружи они отсекаются backface-culling,
  // поэтому интерьер виден и снаружи («кукольный домик»), а изнутри — стены на месте.
  plane(W, H, [W / 2, H / 2, 0], [0, 0, 0], room.walls.north);
  plane(W, H, [W / 2, H / 2, D], [0, Math.PI, 0], room.walls.south);
  plane(D, H, [0, H / 2, D / 2], [0, Math.PI / 2, 0], room.walls.west);
  plane(D, H, [W, H / 2, D / 2], [0, -Math.PI / 2, 0], room.walls.east);

  // плинтус
  if (room.skirting > 0) {
    const t = 22, sh = room.skirting;
    box(W / 2, sh / 2, t / 2, W, sh, t, room.skirtingMaterial);
    box(W / 2, sh / 2, D - t / 2, W, sh, t, room.skirtingMaterial);
    box(t / 2, sh / 2, D / 2, t, sh, D - 2 * t, room.skirtingMaterial);
    box(W - t / 2, sh / 2, D / 2, t, sh, D - 2 * t, room.skirtingMaterial);
  }

  // карниз по периметру потолка + светящаяся щель (LED заливает потолок)
  if (room.cove) {
    const inset = Math.min(300, Math.min(W, D) * 0.12);
    const drop = 130, t = 60;
    box(W / 2, H - drop / 2, inset / 2, W, drop, inset, room.ceilingMaterial);
    box(W / 2, H - drop / 2, D - inset / 2, W, drop, inset, room.ceilingMaterial);
    box(inset / 2, H - drop / 2, D / 2, inset, drop, D - 2 * inset, room.ceilingMaterial);
    box(W - inset / 2, H - drop / 2, D / 2, inset, drop, D - 2 * inset, room.ceilingMaterial);
    const gy = H - drop + 32;
    box(W / 2, gy, inset - t / 2, W - 2 * inset, 26, t, "__cove");
    box(W / 2, gy, D - inset + t / 2, W - 2 * inset, 26, t, "__cove");
    box(inset - t / 2, gy, D / 2, t, 26, D - 2 * inset, "__cove");
    box(W - inset + t / 2, gy, D / 2, t, 26, D - 2 * inset, "__cove");
  }
}

// Ставит предмет мебели в мировые координаты с поворотом вокруг Y.
function placeFurniture(f: FurnitureSpec, spec: DesignSpec, nodes: SceneNode[]) {
  const rot = (f.rot * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  for (const p of buildFurniture(f, spec)) {
    const [lx, ly, lz] = p.pos;
    nodes.push({
      shape: p.shape,
      size: [M(p.size[0]), M(p.size[1]), M(p.size[2])],
      pos: [M(f.x + lx * cos + lz * sin), M(ly), M(f.z - lx * sin + lz * cos)],
      rot: [0, rot, 0],
      mat: p.mat,
      uv: uvFor(spec, p.mat, M(p.size[0]), M(p.size[1])),
    });
  }
}
