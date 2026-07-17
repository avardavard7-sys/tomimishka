// ============================================================
// ЭСКИЗ AI — параметрическая модель изделия.
// Все размеры в мм. План: ось X вправо, ось Z вниз (к зрителю), Y — высота.
// runs[i].from / to задают ВНЕШНЮЮ (фасадную) линию прямого участка.
// Фасад автоматически смотрит наружу от центра изделия.
// ============================================================

export type MaterialKind = "marble" | "solid" | "wood" | "metal";

export interface MaterialDef {
  kind: MaterialKind;
  label?: string; // русское название для клиента («Мрамор Bianco»)
  color: string; // hex
  veinColor?: string; // для мрамора
  roughness?: number; // 0..1
}

export type RunTier = "work" | "bar" | "panel";
export type RunFront = "panels" | "vitrine" | "open";

export interface RunSpec {
  id: string;
  from: [number, number]; // [x, z] мм — внешняя линия
  to: [number, number];
  depth: number; // глубина корпуса, мм (600); для tier=panel — ТОЛЩИНА полотна (20–80)
  tier: RunTier; // work=рабочая 900, bar=фронт 1200 + внутренняя 900, panel=плоское полотно без столешницы и цоколя
  height: number; // высота внешнего фронта (900 или 1200)
  counterThickness: number; // толщина столешницы (40 work / 32 bar)
  counterOverhang: number; // выступ столешницы наружу (50)
  barTopDepth?: number; // ширина верхней барной полки (250) — только tier=bar
  counterMaterial: string; // ключ из materials
  claddingMaterial: string; // ключ из materials
  front: RunFront;
  plinth: { height: number; inset: number; led: boolean };
  topLed: boolean;
  elevation?: number; // высота установки от пола, мм (только tier=panel)
  modules?: number[]; // ширины модулей (дверцы) с внутренней стороны, мм
}

export interface ColumnSpec {
  x: number; z: number; w: number; d: number; h: number;
  material: string;
}

export interface EquipmentSpec {
  x: number; z: number; w: number; d: number; h: number;
  y?: number; // высота установки (по умолчанию 900 — на столешнице)
  label?: string;
}

// ---------- комната (режим интерьера) ----------

export type WallSide = "north" | "south" | "east" | "west";

export interface RoomSpec {
  width: number;  // мм по X
  depth: number;  // мм по Z
  height: number; // мм до потолка
  floorMaterial: string;
  ceilingMaterial: string;
  walls: Record<WallSide, string>; // north=z0, south=z=depth, west=x0, east=x=width
  cove: boolean;    // карниз с LED по периметру потолка
  skirting: number; // плинтус, мм (0 = нет)
  skirtingMaterial: string;
}

export type FurnitureType =
  | "bed" | "nightstand" | "wardrobe" | "sofa" | "armchair" | "chair"
  | "table" | "coffee_table" | "desk" | "tv" | "tv_unit" | "shelf"
  | "rug" | "artwork" | "mirror" | "pendant" | "floor_lamp" | "plant"
  | "door" | "window" | "box";

export interface FurnitureSpec {
  type: FurnitureType;
  x: number; z: number;             // центр пятна в плане, мм
  w: number; d: number; h: number;  // габариты, мм
  rot: number;                      // градусы вокруг Y: 0 = спинкой к стене z=0
  y?: number;                       // высота установки от пола (tv/artwork/pendant/window)
  material?: string;
  accent?: string;
  label?: string;
}

export interface DesignSpec {
  title: string;
  ledColor: string;
  materials: Record<string, MaterialDef>;
  room?: RoomSpec;
  furniture: FurnitureSpec[];
  runs: RunSpec[];
  columns: ColumnSpec[];
  equipment: EquipmentSpec[];
  notes?: string;
}

const FURNITURE_TYPES: FurnitureType[] = [
  "bed", "nightstand", "wardrobe", "sofa", "armchair", "chair",
  "table", "coffee_table", "desk", "tv", "tv_unit", "shelf",
  "rug", "artwork", "mirror", "pendant", "floor_lamp", "plant",
  "door", "window", "box",
];

// разумные габариты по умолчанию, если ИИ их не дал (мм)
const FURN_DEFAULTS: Record<string, [number, number, number]> = {
  bed: [1800, 2100, 1100], nightstand: [450, 400, 550], wardrobe: [2000, 600, 2400],
  sofa: [2200, 950, 850], armchair: [900, 900, 850], chair: [460, 480, 900],
  table: [1600, 900, 750], coffee_table: [1100, 600, 400], desk: [1400, 700, 750],
  tv: [1400, 70, 800], tv_unit: [1800, 450, 400], shelf: [1200, 350, 1800],
  rug: [2400, 1700, 20], artwork: [700, 60, 900], mirror: [700, 60, 1400],
  pendant: [400, 400, 300], floor_lamp: [420, 420, 1600], plant: [700, 700, 1300],
  door: [900, 60, 2100], window: [1600, 120, 1400], box: [600, 600, 600],
};

// ---------- Нормализация: спек от ИИ никогда не должен уронить рендер ----------

const num = (v: unknown, def: number, min = 1, max = 30000): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const hex = (v: unknown, def: string): string =>
  typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : def;

const pair = (v: unknown, def: [number, number]): [number, number] => {
  if (Array.isArray(v) && v.length >= 2) {
    return [num(v[0], def[0], -30000), num(v[1], def[1], -30000)];
  }
  return def;
};

export function normalizeSpec(raw: unknown): DesignSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // материалы
  const materials: Record<string, MaterialDef> = {};
  const rawMats = (r.materials && typeof r.materials === "object" ? r.materials : {}) as Record<string, Record<string, unknown>>;
  for (const [key, m] of Object.entries(rawMats)) {
    if (!m || typeof m !== "object") continue;
    const kind = (["marble", "solid", "wood", "metal"] as const).includes(m.kind as MaterialKind)
      ? (m.kind as MaterialKind) : "solid";
    materials[key] = {
      kind,
      label: typeof m.label === "string" && m.label.trim() ? m.label.trim().slice(0, 60) : undefined,
      color: hex(m.color, "#ECEAE4"),
      veinColor: m.veinColor ? hex(m.veinColor, "#9B9B9B") : undefined,
      roughness: typeof m.roughness === "number" ? Math.min(1, Math.max(0, m.roughness)) : 0.45,
    };
  }
  const ensureMat = (key: string, fallback: MaterialDef): string => {
    if (!materials[key]) {
      const k = key || "auto";
      materials[k] = fallback;
      return k;
    }
    return key;
  };
  if (!materials["marble"]) materials["marble"] = { kind: "marble", color: "#F2F1EE", veinColor: "#98948C", roughness: 0.35 };
  if (!materials["top"]) materials["top"] = { kind: "solid", color: "#ECEAE6", roughness: 0.4 };

  const ledColor = hex(r.ledColor, "#FFB020");

  // участки
  const rawRuns = Array.isArray(r.runs) ? r.runs : [];
  const runs: RunSpec[] = [];
  rawRuns.slice(0, 10).forEach((rr: Record<string, unknown>, i: number) => {
    if (!rr || typeof rr !== "object") return;
    const tier: RunTier = rr.tier === "bar" ? "bar" : rr.tier === "panel" ? "panel" : "work";
    const from = pair(rr.from, [0, 0]);
    const to = pair(rr.to, [1000, 0]);
    if (from[0] === to[0] && from[1] === to[1]) return; // нулевая длина
    const plinthRaw = (rr.plinth && typeof rr.plinth === "object" ? rr.plinth : {}) as Record<string, unknown>;
    runs.push({
      id: typeof rr.id === "string" && rr.id ? rr.id : `run_${i + 1}`,
      from, to,
      depth: tier === "panel" ? num(rr.depth, 40, 8, 600) : num(rr.depth, 600, 200, 1500),
      tier,
      height: tier === "panel" ? num(rr.height, 2400, 100, 4000) : num(rr.height, tier === "bar" ? 1200 : 900, 300, 2500),
      counterThickness: num(rr.counterThickness, tier === "bar" ? 32 : 40, 10, 120),
      counterOverhang: num(rr.counterOverhang, 50, 0, 300),
      barTopDepth: tier === "bar" ? num(rr.barTopDepth, 250, 100, 800) : undefined,
      counterMaterial: ensureMat(String(rr.counterMaterial || "top"), { kind: "solid", color: "#ECEAE6", roughness: 0.4 }),
      claddingMaterial: ensureMat(String(rr.claddingMaterial || "marble"), { kind: "marble", color: "#F2F1EE", veinColor: "#98948C", roughness: 0.35 }),
      front: rr.front === "vitrine" || rr.front === "open" ? (rr.front as RunFront) : "panels",
      plinth: {
        height: num(plinthRaw.height, 100, 0, 400),
        inset: num(plinthRaw.inset, 50, 0, 300),
        led: plinthRaw.led !== false,
      },
      topLed: rr.topLed !== false,
      elevation: tier === "panel" ? num(rr.elevation, 0, 0, 3000) : undefined,
      modules: Array.isArray(rr.modules)
        ? rr.modules.slice(0, 12).map((w) => num(w, 500, 150, 2000))
        : undefined,
    });
  });

  // ---- комната ----
  let room: RoomSpec | undefined;
  const rawRoom = (r.room && typeof r.room === "object" ? r.room : null) as Record<string, unknown> | null;
  if (rawRoom) {
    const defWall = ensureMat(String(rawRoom.wallMaterial || "wall"), { kind: "solid", label: "Стены", color: "#EFEDE8", roughness: 0.75 });
    const wallsRaw = (rawRoom.walls && typeof rawRoom.walls === "object" ? rawRoom.walls : {}) as Record<string, unknown>;
    const walls = {} as Record<WallSide, string>;
    (["north", "south", "east", "west"] as WallSide[]).forEach((side) => {
      const key = wallsRaw[side];
      walls[side] = typeof key === "string" && key
        ? ensureMat(key, { kind: "solid", label: "Стены", color: "#EFEDE8", roughness: 0.75 })
        : defWall;
    });
    room = {
      width: num(rawRoom.width, 4000, 1200, 30000),
      depth: num(rawRoom.depth, 4000, 1200, 30000),
      height: num(rawRoom.height, 2800, 2000, 8000),
      floorMaterial: ensureMat(String(rawRoom.floorMaterial || "floor"), { kind: "wood", label: "Паркет дуб", color: "#B98D5B", roughness: 0.5 }),
      ceilingMaterial: ensureMat(String(rawRoom.ceilingMaterial || "ceiling"), { kind: "solid", label: "Потолок", color: "#F8F7F4", roughness: 0.9 }),
      walls,
      cove: rawRoom.cove !== false,
      skirting: num(rawRoom.skirting, 80, 0, 400),
      skirtingMaterial: ensureMat(String(rawRoom.skirtingMaterial || "skirting"), { kind: "solid", label: "Плинтус", color: "#F4F3F0", roughness: 0.6 }),
    };
  }

  // ---- мебель ----
  const furniture: FurnitureSpec[] = [];
  for (const raw of (Array.isArray(r.furniture) ? r.furniture : []).slice(0, 30)) {
    if (!raw || typeof raw !== "object") continue;
    const fr = raw as Record<string, unknown>;
    const type = (FURNITURE_TYPES.includes(fr.type as FurnitureType) ? fr.type : "box") as FurnitureType;
    const [dw, dd, dh] = FURN_DEFAULTS[type] || [600, 600, 600];
    furniture.push({
      type,
      x: num(fr.x, room ? room.width / 2 : 0, -30000),
      z: num(fr.z, room ? room.depth / 2 : 0, -30000),
      w: num(fr.w, dw, 20, 20000),
      d: num(fr.d, dd, 20, 20000),
      h: num(fr.h, dh, 10, 8000),
      rot: ((num(fr.rot, 0, -3600, 3600) % 360) + 360) % 360,
      y: fr.y !== undefined ? num(fr.y, 0, 0, 8000) : undefined,
      material: typeof fr.material === "string" && fr.material
        ? ensureMat(fr.material, { kind: "wood", label: "Корпус", color: "#9C7A55", roughness: 0.55 }) : undefined,
      accent: typeof fr.accent === "string" && fr.accent
        ? ensureMat(fr.accent, { kind: "solid", label: "Текстиль", color: "#D9D5CD", roughness: 0.85 }) : undefined,
      label: typeof fr.label === "string" ? fr.label.slice(0, 60) : undefined,
    });
  }

  // колонны
  const columns: ColumnSpec[] = (Array.isArray(r.columns) ? r.columns : [])
    .slice(0, 6)
    .filter((c: unknown) => c && typeof c === "object")
    .map((c: Record<string, unknown>) => ({
      x: num(c.x, 0, -30000), z: num(c.z, 0, -30000),
      w: num(c.w, 600, 100, 3000), d: num(c.d, 600, 100, 3000),
      h: num(c.h, 3000, 500, 8000),
      material: ensureMat(String(c.material || "marble"), materials["marble"]),
    }));

  // оборудование
  const equipment: EquipmentSpec[] = (Array.isArray(r.equipment) ? r.equipment : [])
    .slice(0, 16)
    .filter((e: unknown) => e && typeof e === "object")
    .map((e: Record<string, unknown>) => ({
      x: num(e.x, 0, -30000), z: num(e.z, 0, -30000),
      w: num(e.w, 500, 50, 3000), d: num(e.d, 500, 50, 3000), h: num(e.h, 400, 50, 3000),
      y: e.y !== undefined ? num(e.y, 900, 0, 3000) : undefined,
      label: typeof e.label === "string" ? e.label.slice(0, 60) : undefined,
    }));

  const spec: DesignSpec = {
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 120) : "Изделие",
    ledColor,
    materials,
    room,
    furniture,
    runs,
    columns,
    equipment,
    notes: typeof r.notes === "string" ? r.notes.slice(0, 2000) : undefined,
  };

  // если ИИ не дал ни одного участка — подставляем базовый прямой модуль,
  // чтобы вьювер никогда не был пустым. Для комнаты этого не нужно: там есть стены.
  if (spec.runs.length === 0 && !spec.room && spec.furniture.length === 0) {
    spec.runs.push({
      id: "run_1", from: [0, 0], to: [2400, 0], depth: 600, tier: "work",
      height: 900, counterThickness: 40, counterOverhang: 50,
      counterMaterial: "top", claddingMaterial: "marble", front: "panels",
      plinth: { height: 100, inset: 50, led: true }, topLed: true,
    });
  }

  return spec;
}

// ---------- Габариты ----------

// центр изделия в плане — та же математика, что и в buildScene
export function planCentroid(spec: DesignSpec): [number, number] {
  let cx = 0, cz = 0, n = 0;
  for (const r of spec.runs) {
    cx += (r.from[0] + r.to[0]) / 2;
    cz += (r.from[1] + r.to[1]) / 2;
    n++;
  }
  return n > 0 ? [cx / n, cz / n] : [0, 0];
}

// наружная нормаль участка (в сторону от центра изделия)
export function outwardNormal(run: RunSpec, cx: number, cz: number): [number, number] {
  const dx = run.to[0] - run.from[0], dz = run.to[1] - run.from[1];
  const len = Math.hypot(dx, dz) || 1;
  let ox = -dz / len, oz = dx / len;
  const mx = (run.from[0] + run.to[0]) / 2, mz = (run.from[1] + run.to[1]) / 2;
  if ((mx - cx) * ox + (mz - cz) * oz < 0) { ox = -ox; oz = -oz; }
  return [ox, oz];
}

export function runLength(r: RunSpec): number {
  return Math.round(Math.hypot(r.to[0] - r.from[0], r.to[1] - r.from[1]));
}

export function specBounds(spec: DesignSpec) {
  // у комнаты габарит — это сама комната, а не мебель внутри
  if (spec.room) {
    return {
      minX: 0, maxX: spec.room.width, minZ: 0, maxZ: spec.room.depth,
      maxH: spec.room.height, width: spec.room.width, depth: spec.room.depth,
    };
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxH = 0;
  const eat = (x: number, z: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  };
  const [ccx, ccz] = planCentroid(spec);
  for (const run of spec.runs) {
    eat(run.from[0], run.from[1]);
    eat(run.to[0], run.to[1]);
    // корпус уходит ВНУТРЬ от линии фасада на run.depth
    const [ox, oz] = outwardNormal(run, ccx, ccz);
    eat(run.from[0] - ox * run.depth, run.from[1] - oz * run.depth);
    eat(run.to[0] - ox * run.depth, run.to[1] - oz * run.depth);
    maxH = Math.max(maxH, (run.elevation || 0) + run.height);
  }
  for (const f of spec.furniture) {
    const rx = Math.max(f.w, f.d) / 2;
    eat(f.x - rx, f.z - rx);
    eat(f.x + rx, f.z + rx);
    maxH = Math.max(maxH, (f.y || 0) + f.h);
  }
  for (const c of spec.columns) {
    eat(c.x - c.w / 2, c.z - c.d / 2);
    eat(c.x + c.w / 2, c.z + c.d / 2);
  }
  if (!isFinite(minX)) { minX = 0; maxX = 1000; minZ = 0; maxZ = 600; }
  return { minX, maxX, minZ, maxZ, maxH, width: Math.round(maxX - minX), depth: Math.round(maxZ - minZ) };
}

export function dimsSummary(spec: DesignSpec): string {
  const b = specBounds(spec);
  const heights = Array.from(new Set(spec.runs.map((r) => r.height))).sort((a, b2) => a - b2);
  if (spec.room) {
    return `${b.width} × ${b.depth} мм · потолок ${b.maxH} мм · ${(b.width * b.depth / 1e6).toFixed(1)} м²`;
  }
  if (b.depth < 300 && spec.runs.length) return `${b.width} × ${b.maxH} мм · толщина ${b.depth} мм`;
  if (!heights.length) return `${b.width} × ${b.depth} мм · высота ${b.maxH} мм`;
  return `${b.width} × ${b.depth} мм · высоты: ${heights.join(" / ")} мм`;
}

// ---------- Образец: стойка из эскиза 3800×3800 ----------

export const SAMPLE_SPEC: DesignSpec = normalizeSpec({
  title: "Барная стойка 3800 × 3800",
  ledColor: "#FFB020",
  materials: {
    marble: { kind: "marble", label: "Мрамор Bianco", color: "#F2F1EE", veinColor: "#98948C", roughness: 0.35 },
    top: { kind: "solid", label: "Кварц светлый", color: "#ECEAE6", roughness: 0.4 },
    top_bar: { kind: "solid", label: "Кварц барный", color: "#F3F1EC", roughness: 0.35 },
  },
  runs: [
    {
      id: "back", from: [0, 0], to: [3800, 0], depth: 600, tier: "bar", height: 1200,
      counterThickness: 32, counterOverhang: 50, barTopDepth: 250,
      counterMaterial: "top_bar", claddingMaterial: "marble", front: "panels",
      plinth: { height: 100, inset: 50, led: true }, topLed: true,
      modules: [1000, 1000, 500],
    },
    {
      id: "right", from: [3800, 0], to: [3800, 3800], depth: 600, tier: "bar", height: 1200,
      counterThickness: 32, counterOverhang: 50, barTopDepth: 250,
      counterMaterial: "top_bar", claddingMaterial: "marble", front: "panels",
      plinth: { height: 100, inset: 50, led: true }, topLed: true,
      modules: [550, 550, 984],
    },
    {
      id: "front_vitrine", from: [3800, 3800], to: [2300, 3800], depth: 600, tier: "work", height: 900,
      counterThickness: 40, counterOverhang: 50,
      counterMaterial: "top", claddingMaterial: "marble", front: "vitrine",
      plinth: { height: 100, inset: 50, led: true }, topLed: true,
    },
    {
      id: "front", from: [2300, 3800], to: [0, 3800], depth: 600, tier: "work", height: 900,
      counterThickness: 40, counterOverhang: 50,
      counterMaterial: "top", claddingMaterial: "marble", front: "panels",
      plinth: { height: 100, inset: 50, led: true }, topLed: true,
      modules: [500, 550, 550],
    },
    {
      id: "left", from: [0, 3800], to: [0, 0], depth: 600, tier: "work", height: 900,
      counterThickness: 40, counterOverhang: 50,
      counterMaterial: "top", claddingMaterial: "marble", front: "panels",
      plinth: { height: 100, inset: 50, led: true }, topLed: true,
      modules: [1000, 1000, 500],
    },
  ],
  columns: [{ x: 1900, z: 1650, w: 600, d: 600, h: 3200, material: "marble" }],
  equipment: [
    { x: 900, z: 350, w: 700, d: 450, h: 450, label: "кофемашина" },
    { x: 1550, z: 320, w: 300, d: 300, h: 620, label: "гриндер" },
    { x: 3450, z: 900, w: 450, d: 400, h: 350, label: "касса" },
    { x: 700, z: 3480, w: 500, d: 400, h: 300, label: "витринный блок" },
  ],
  notes: "Мрамор Bianco, LED-подсветка янтарная по цоколю и под столешницами, витрина справа.",
});


// ---------- Витрина данных для клиента: размеры и материалы ----------

const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y).join(" / ");

export function dimsDetail(spec: DesignSpec): string[] {
  const b = specBounds(spec);
  if (spec.room) {
    const out = [
      `Комната ${b.width} × ${b.depth} мм`,
      `Высота потолка ${b.maxH} мм`,
      `Площадь ${(b.width * b.depth / 1e6).toFixed(1)} м²`,
    ];
    if (spec.room.skirting > 0) out.push(`Плинтус ${spec.room.skirting} мм`);
    if (spec.room.cove) out.push(`Карниз с LED по периметру`);
    if (spec.furniture.length) out.push(`Мебель: ${spec.furniture.length} предметов`);
    return out;
  }
  const panels = spec.runs.filter((r) => r.tier === "panel");
  const solid = spec.runs.filter((r) => r.tier !== "panel");
  const lines: string[] = [];

  if (panels.length && !solid.length) {
    lines.push(`Габарит ${b.width} × ${b.maxH} мм`);
    lines.push(`Толщина полотна ${uniq(panels.map((r) => r.depth))} мм`);
    lines.push(`Высота полотна ${uniq(panels.map((r) => r.height))} мм`);
    const elev = panels.filter((r) => (r.elevation || 0) > 0);
    if (elev.length) lines.push(`Установка от пола ${uniq(elev.map((r) => r.elevation || 0))} мм`);
    if (panels.length > 1) lines.push(`Секции ${panels.map((r) => runLength(r)).join(" / ")} мм`);
    return lines;
  }

  lines.push(`Габарит ${b.width} × ${b.depth} мм`);
  if (!spec.runs.length) lines.push(`Высота ${b.maxH} мм`);
  if (spec.furniture.length) lines.push(`Мебель: ${spec.furniture.length} предметов`);
  if (solid.length) {
    lines.push(`Высоты фронтов ${uniq(solid.map((r) => r.height))} мм`);
    lines.push(`Столешницы ${uniq(solid.map((r) => r.counterThickness))} мм · выступ ${uniq(solid.map((r) => r.counterOverhang))} мм`);
    const bars = solid.filter((r) => r.tier === "bar" && r.barTopDepth);
    if (bars.length) lines.push(`Барная полка ${uniq(bars.map((r) => r.barTopDepth!))} мм`);
    lines.push(`Цоколь ${uniq(solid.map((r) => r.plinth.height))} мм · отступ ${uniq(solid.map((r) => r.plinth.inset))} мм`);
  }
  if (panels.length) {
    lines.push(`Панели ${uniq(panels.map((r) => r.depth))} мм · высота ${uniq(panels.map((r) => r.height))} мм`);
  }
  return lines;
}

export interface MaterialUsage {
  key: string;
  label: string;
  color: string;
  hex: string;
  kindRus: string;
  usedFor: string[];
}

export const FURN_RUS: Record<string, string> = {
  bed: "кровать", nightstand: "тумба", wardrobe: "шкаф", sofa: "диван", armchair: "кресло",
  chair: "стул", table: "стол", coffee_table: "журн. стол", desk: "рабочий стол", tv: "телевизор",
  tv_unit: "ТВ-тумба", shelf: "стеллаж", rug: "ковёр", artwork: "картина", mirror: "зеркало",
  pendant: "светильник", floor_lamp: "торшер", plant: "растение", door: "дверь", window: "окно", box: "объём",
};

const KIND_RUS: Record<MaterialKind, string> = {
  marble: "Мрамор",
  solid: "Камень",
  wood: "Дерево",
  metal: "Металл",
};

export function materialUsage(spec: DesignSpec): MaterialUsage[] {
  const use = new Map<string, Set<string>>();
  const add = (k: string, u: string) => {
    if (!use.has(k)) use.set(k, new Set());
    use.get(k)!.add(u);
  };
  if (spec.room) {
    add(spec.room.floorMaterial, "пол");
    add(spec.room.ceilingMaterial, "потолок");
    const bySide: Record<string, string[]> = {};
    const rus: Record<string, string> = { north: "сев. стена", south: "юж. стена", west: "зап. стена", east: "вост. стена" };
    for (const [side, key] of Object.entries(spec.room.walls)) {
      (bySide[key] = bySide[key] || []).push(rus[side] || side);
    }
    for (const [key, sides] of Object.entries(bySide)) {
      add(key, sides.length === 4 ? "все стены" : sides.join(", "));
    }
    if (spec.room.skirting > 0) add(spec.room.skirtingMaterial, "плинтус");
  }
  for (const f of spec.furniture) {
    const name = f.label || FURN_RUS[f.type] || f.type;
    if (f.material) add(f.material, name);
    if (f.accent) add(f.accent, name);
  }
  for (const run of spec.runs) {
    if (run.tier === "panel") {
      add(run.claddingMaterial, "полотно");
      continue;
    }
    add(run.claddingMaterial, "фасады");
    add(run.counterMaterial, "столешницы");
  }
  for (const c of spec.columns) add(c.material, "колонна");

  const out: MaterialUsage[] = [];
  for (const [key, mat] of Object.entries(spec.materials)) {
    const u = use.get(key);
    if (!u) continue;
    out.push({
      key,
      label: mat.label || KIND_RUS[mat.kind],
      color: mat.color,
      hex: mat.color.toUpperCase(),
      kindRus: KIND_RUS[mat.kind],
      usedFor: [...u],
    });
  }
  if (spec.runs.some((r) => r.front === "vitrine")) {
    out.push({ key: "__glass", label: "Стекло витрины", color: "#D8E2E4", hex: "#D8E2E4", kindRus: "Стекло", usedFor: ["витрина"] });
  }
  out.push({
    key: "__led",
    label: "LED-подсветка",
    color: spec.ledColor,
    hex: spec.ledColor.toUpperCase(),
    kindRus: "Свет",
    usedFor: spec.room
      ? (spec.room.cove ? ["карниз потолка"] : ["подсветка"])
      : spec.runs.some((r) => r.tier !== "panel")
        ? ["цоколь", "под столешницами"]
        : ["контур панели"],
  });
  return out;
}


// Пример интерьера — чтобы движок можно было проверить без ключей API
export const SAMPLE_ROOM: DesignSpec = normalizeSpec({
  "title": "Спальня — мраморные панели",
  "ledColor": "#FFCE8A",
  "materials": {
    "marble": {
      "kind": "marble",
      "label": "Мрамор Calacatta",
      "color": "#F1EFE9",
      "veinColor": "#B39A6B",
      "roughness": 0.28
    },
    "dark": {
      "kind": "marble",
      "label": "Мрамор Emperador",
      "color": "#3E2E24",
      "veinColor": "#8A6B4A",
      "roughness": 0.3
    },
    "gold": {
      "kind": "metal",
      "label": "Латунь брашированная",
      "color": "#C9A15A",
      "roughness": 0.28
    },
    "oak": {
      "kind": "wood",
      "label": "Паркет дуб",
      "color": "#B98D5B",
      "roughness": 0.5
    },
    "ceil": {
      "kind": "solid",
      "label": "Потолок матовый белый",
      "color": "#F8F7F4",
      "roughness": 0.9
    },
    "linen": {
      "kind": "solid",
      "label": "Лён графитовый",
      "color": "#6E6A64",
      "roughness": 0.9
    },
    "cream": {
      "kind": "solid",
      "label": "Текстиль кремовый",
      "color": "#E4DED2",
      "roughness": 0.9
    }
  },
  "room": {
    "width": 3600,
    "depth": 4200,
    "height": 2800,
    "floorMaterial": "oak",
    "ceilingMaterial": "ceil",
    "walls": {
      "north": "marble",
      "south": "marble",
      "west": "marble",
      "east": "dark"
    },
    "cove": true,
    "skirting": 80,
    "skirtingMaterial": "cream"
  },
  "furniture": [
    {
      "type": "bed",
      "x": 1800,
      "z": 1100,
      "w": 1800,
      "d": 2100,
      "h": 1100,
      "rot": 0,
      "material": "linen",
      "accent": "cream",
      "label": "кровать"
    },
    {
      "type": "nightstand",
      "x": 700,
      "z": 250,
      "w": 450,
      "d": 400,
      "h": 550,
      "rot": 0,
      "material": "oak",
      "accent": "gold"
    },
    {
      "type": "nightstand",
      "x": 2900,
      "z": 250,
      "w": 450,
      "d": 400,
      "h": 550,
      "rot": 0,
      "material": "oak",
      "accent": "gold"
    },
    {
      "type": "pendant",
      "x": 700,
      "z": 250,
      "w": 260,
      "d": 260,
      "h": 300,
      "rot": 0,
      "y": 1700
    },
    {
      "type": "pendant",
      "x": 2900,
      "z": 250,
      "w": 260,
      "d": 260,
      "h": 300,
      "rot": 0,
      "y": 1700
    },
    {
      "type": "rug",
      "x": 1800,
      "z": 2000,
      "w": 2600,
      "d": 2000,
      "h": 20,
      "rot": 0,
      "accent": "cream"
    },
    {
      "type": "tv_unit",
      "x": 1800,
      "z": 3990,
      "w": 1800,
      "d": 400,
      "h": 450,
      "rot": 180,
      "material": "oak"
    },
    {
      "type": "tv",
      "x": 1800,
      "z": 4080,
      "w": 1400,
      "d": 70,
      "h": 800,
      "rot": 180,
      "y": 1150
    },
    {
      "type": "artwork",
      "x": 60,
      "z": 1700,
      "w": 800,
      "d": 60,
      "h": 1000,
      "rot": 90,
      "y": 1500,
      "material": "gold",
      "accent": "cream"
    },
    {
      "type": "plant",
      "x": 3300,
      "z": 3700,
      "w": 700,
      "d": 700,
      "h": 1400,
      "rot": 0,
      "material": "cream"
    },
    {
      "type": "floor_lamp",
      "x": 300,
      "z": 3700,
      "w": 420,
      "d": 420,
      "h": 1600,
      "rot": 0
    }
  ],
  "runs": [],
  "columns": [],
  "equipment": [],
  "notes": "Карнизная LED-подсветка тёплого янтарного тона по периметру потолка"
});
