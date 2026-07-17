"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Line, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, ToneMapping, Vignette, N8AO } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DesignSpec } from "@/lib/spec";
import { buildScene, BuiltScene, DimLine as DimLineData, SceneNode } from "@/lib/scene";
import { marbleTexture, woodTexture, labelTexture } from "@/lib/textures";

export interface ViewerApi {
  /** dist в метрах; не задан — авторасчёт по габаритам */
  capture: (azimuthDeg: number, elevationDeg: number, dist?: number) => Promise<string>;
  setView: (azimuthDeg: number, elevationDeg: number, dist?: number) => void;
  /** снимок ТЕКУЩЕГО ракурса, камеру не двигает */
  snapshot: () => Promise<string>;
  exportGLB: (filename: string) => Promise<void>;
}

interface Props {
  spec: DesignSpec;
  showDims: boolean;
  onApi?: (api: ViewerApi) => void;
}

export default function Viewer3D({ spec, showDims, onApi }: Props) {
  const isRoom = !!spec.room;
  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      dpr={[1, 2]}
      camera={{ fov: isRoom ? 55 : 35, near: 0.03, far: 300, position: [5, 4, 6] }}
    >
      <color attach="background" args={[isRoom ? "#0E0E14" : "#F1F0EB"]} />
      <EnvLight />
      <Contents spec={spec} showDims={showDims} onApi={onApi} />
      <EffectComposer multisampling={4}>
        <N8AO aoRadius={0.5} intensity={2.4} distanceFalloff={0.8} halfRes />
        <Bloom intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.35} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Vignette offset={0.32} darkness={0.38} />
      </EffectComposer>
    </Canvas>
  );
}

// Отражения окружения — именно они отличают «серый кубик» от рендера.
// RoomEnvironment входит в three, никакой сети и внешних HDRI не нужно.
function EnvLight() {
  const { gl, scene } = useThree();
  useEffect(() => {
    let rt: THREE.WebGLRenderTarget | null = null;
    let killed = false;
    const pmrem = new THREE.PMREMGenerator(gl);
    import("three/examples/jsm/environments/RoomEnvironment.js")
      .then(({ RoomEnvironment }) => {
        if (killed) return;
        const env = new RoomEnvironment();
        rt = pmrem.fromScene(env, 0.04);
        scene.environment = rt.texture;
        env.dispose();
      })
      .catch(() => {});
    return () => {
      killed = true;
      scene.environment = null;
      rt?.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Contents({ spec, showDims, onApi }: Props) {
  const built = useMemo<BuiltScene>(() => buildScene(spec), [spec]);
  const matFor = useMaterials(spec);
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, gl } = useThree();

  const autoDist = built.radius * 2.35 + 0.6;

  const place = (azDeg: number, elDeg: number, dist?: number) => {
    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    const d = dist ?? autoDist;
    const [cx, cy, cz] = built.center;
    camera.position.set(
      cx + d * Math.cos(el) * Math.sin(az),
      cy + d * Math.sin(el),
      cz + d * Math.cos(el) * Math.cos(az),
    );
    const ctl = controlsRef.current;
    if (ctl) {
      ctl.target.set(cx, cy, cz);
      ctl.update();
    } else {
      camera.lookAt(cx, cy, cz);
    }
  };

  // стартовый ракурс при смене спека
  useEffect(() => {
    place(38, built.room ? 16 : 22);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  // API наружу: захват видов для PDF и экспорт GLB
  useEffect(() => {
    if (!onApi) return;
    const api: ViewerApi = {
      setView: place,
      snapshot: () =>
        new Promise<string>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(gl.domElement.toDataURL("image/png"))),
            ),
          );
        }),
      capture: (az, el, dist) =>
        new Promise<string>((resolve) => {
          place(az, el, dist);
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(gl.domElement.toDataURL("image/png"))),
            ),
          );
        }),
      exportGLB: async (filename: string) => {
        const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
        const exporter = new GLTFExporter();
        const group = groupRef.current;
        if (!group) return;
        await new Promise<void>((resolve, reject) => {
          exporter.parse(
            group,
            (result) => {
              const blob =
                result instanceof ArrayBuffer
                  ? new Blob([result], { type: "model/gltf-binary" })
                  : new Blob([JSON.stringify(result)], { type: "model/gltf+json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = filename;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 4000);
              resolve();
            },
            (err) => reject(err),
            { binary: true },
          );
        });
      },
    };
    onApi(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, onApi]);

  return (
    <>
      <Lights built={built} spec={spec} />

      <group ref={groupRef}>
        {built.nodes.map((n, i) => (
          <Node key={i} n={n} material={matFor(n.mat, n.uv)} />
        ))}
      </group>

      {showDims && (
        <group>
          {built.dims.map((d, i) => (
            <Dim key={i} data={d} />
          ))}
          {built.labels.map((l, i) => (
            <Label key={i} pos={l.pos} text={l.text} />
          ))}
        </group>
      )}

      {!built.room && (
        <ContactShadows
          position={[built.center[0], 0, built.center[2]]}
          opacity={0.32}
          scale={built.radius * 4}
          blur={2.4}
          far={1.6}
          resolution={512}
          frames={1}
        />
      )}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI * 0.92}
        minDistance={0.2}
        maxDistance={built.radius * 8}
      />
    </>
  );
}

function Node({ n, material }: { n: SceneNode; material: THREE.Material }) {
  const rot = useMemo(() => new THREE.Euler(n.rot[0], n.rot[1], n.rot[2], "YXZ"), [n]);
  return (
    <mesh position={n.pos} rotation={rot} material={material}>
      {n.shape === "plane" ? (
        <planeGeometry args={[n.size[0], n.size[1]]} />
      ) : (
        <boxGeometry args={n.size} />
      )}
    </mesh>
  );
}

// ---------- свет ----------

function Lights({ built, spec }: { built: BuiltScene; spec: DesignSpec }) {
  if (!built.room) {
    return (
      <>
        <ambientLight intensity={0.45} />
        <hemisphereLight args={["#ffffff", "#c9c4b9", 0.3]} />
        <directionalLight position={[5, 9, 4]} intensity={1.6} />
        <directionalLight position={[-6, 5, -5]} intensity={0.5} />
      </>
    );
  }
  // Интерьер: стены смотрят нормалью внутрь, поэтому наружный свет их не осветит —
  // ставим источники ВНУТРИ комнаты.
  const { w, d, h } = built.room;
  return (
    <>
      <ambientLight intensity={0.28} />
      <pointLight position={[w / 2, h - 0.3, d * 0.28]} intensity={16} decay={2} color="#FFF1DC" />
      <pointLight position={[w / 2, h - 0.3, d * 0.72]} intensity={16} decay={2} color="#FFF1DC" />
      <pointLight position={[w / 2, h - 0.16, d / 2]} intensity={9} decay={2} color={spec.ledColor} />
      <pointLight position={[w / 2, h * 0.35, d / 2]} intensity={4} decay={2} color="#FFFFFF" />
    </>
  );
}

// ---------- материалы ----------

type MatFor = (key: string, uv?: [number, number]) => THREE.Material;

function useMaterials(spec: DesignSpec): MatFor {
  const { base, cache } = useMemo(() => {
    const m = new Map<string, THREE.Material>();
    for (const [key, def] of Object.entries(spec.materials)) {
      if (def.kind === "marble") {
        // полированный камень: лаковый слой даёт блик и отражение, как на рендере
        m.set(key, new THREE.MeshPhysicalMaterial({
          map: marbleTexture(def.color, def.veinColor || "#98948C"),
          color: "#ffffff",
          roughness: def.roughness ?? 0.22,
          metalness: 0.0,
          clearcoat: 0.55,
          clearcoatRoughness: 0.12,
          envMapIntensity: 1.15,
        }));
      } else if (def.kind === "wood") {
        m.set(key, new THREE.MeshStandardMaterial({
          map: woodTexture(def.color),
          color: "#ffffff",
          roughness: def.roughness ?? 0.5,
          metalness: 0.02,
          envMapIntensity: 0.7,
        }));
      } else if (def.kind === "metal") {
        m.set(key, new THREE.MeshStandardMaterial({
          color: def.color, roughness: def.roughness ?? 0.28, metalness: 0.9, envMapIntensity: 1.5,
        }));
      } else {
        m.set(key, new THREE.MeshStandardMaterial({
          color: def.color, roughness: def.roughness ?? 0.55, metalness: 0.02, envMapIntensity: 0.6,
        }));
      }
    }
    // служебные
    const led = (c: string, i: number) =>
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, toneMapped: false });
    m.set("__led", led(spec.ledColor, 1.6));
    m.set("__cove", led(spec.ledColor, 2.2));
    m.set("__lamp", led("#FFE9BE", 1.9));
    m.set("__inner", new THREE.MeshStandardMaterial({ color: "#F6F5F2", roughness: 0.6, metalness: 0.02 }));
    m.set("__vitrineFloor", new THREE.MeshStandardMaterial({ color: "#E9E7E1", roughness: 0.5 }));
    m.set("__equipment", new THREE.MeshStandardMaterial({ color: "#4A4A4C", roughness: 0.55, metalness: 0.15 }));
    m.set("__screen", new THREE.MeshStandardMaterial({ color: "#17171B", roughness: 0.4, metalness: 0.3 }));
    m.set("__screen_face", new THREE.MeshStandardMaterial({ color: "#0A0C11", roughness: 0.05, metalness: 0.6, envMapIntensity: 1.4 }));
    m.set("__mirror", new THREE.MeshStandardMaterial({ color: "#DCE6EA", roughness: 0.02, metalness: 1, envMapIntensity: 2.4 }));
    m.set("__plant", new THREE.MeshStandardMaterial({ color: "#4C7A45", roughness: 0.85 }));
    m.set("__metal", new THREE.MeshStandardMaterial({ color: "#9A9AA0", roughness: 0.28, metalness: 0.9, envMapIntensity: 1.5 }));
    m.set("__glass_pane", new THREE.MeshStandardMaterial({
      color: "#CBDDE4", transparent: true, opacity: 0.2, roughness: 0.05,
      metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
    }));
    m.set("__glass", new THREE.MeshStandardMaterial({
      color: "#D8E2E4", transparent: true, opacity: 0.3, roughness: 0.08,
      metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
    }));
    return { base: m, cache: new Map<string, THREE.Material>() };
  }, [spec]);

  useEffect(() => {
    return () => {
      base.forEach((mt) => mt.dispose());
      cache.forEach((mt) => mt.dispose());
      cache.clear();
    };
  }, [base, cache]);

  return (key: string, uv?: [number, number]): THREE.Material => {
    const src = base.get(key) || base.get("__inner")!;
    if (!uv) return src;
    const ck = `${key}|${uv[0]}x${uv[1]}`;
    const hit = cache.get(ck);
    if (hit) return hit;
    const std = src as THREE.MeshStandardMaterial;
    if (!std.map) return src; // тайлить нечего
    const clone = std.clone();
    const tex = std.map.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(uv[0], uv[1]);
    clone.map = tex;
    cache.set(ck, clone);
    return clone;
  };
}

// ---------- размерные линии ----------

function Dim({ data }: { data: DimLineData }) {
  const a = new THREE.Vector3(...data.a);
  const b = new THREE.Vector3(...data.b);
  const dir = b.clone().sub(a).normalize();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const vertical = Math.abs(dir.y) > 0.7;
  const labelOffset: [number, number, number] = vertical ? [0.16, 0, 0.16] : [0, 0.12, 0];

  const qB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const qA = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());

  return (
    <group>
      <Line points={[data.a, data.b]} color="#C43D2F" lineWidth={1.4} />
      <mesh position={data.b} quaternion={qB}>
        <coneGeometry args={[0.02, 0.075, 10]} />
        <meshBasicMaterial color="#C43D2F" />
      </mesh>
      <mesh position={data.a} quaternion={qA}>
        <coneGeometry args={[0.02, 0.075, 10]} />
        <meshBasicMaterial color="#C43D2F" />
      </mesh>
      <Label pos={[mid.x + labelOffset[0], mid.y + labelOffset[1], mid.z + labelOffset[2]]} text={data.label} />
    </group>
  );
}

function Label({ pos, text }: { pos: [number, number, number]; text: string }) {
  const { tex, aspect } = useMemo(() => labelTexture(text), [text]);
  const h = 0.17;
  return (
    <sprite position={pos} scale={[h * aspect, h, 1]}>
      <spriteMaterial map={tex} depthTest={false} transparent />
    </sprite>
  );
}
