import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { Design, Part, Prism } from '../engine';
import { r1, speciesOf } from '../engine';
import { prismGeometry, tint } from './geometry';
import { ArSheet } from './ArSheet';

export type ViewName = 'front' | 'rear' | 'iso';

function PartMesh({ part, color, offset, selected, onSelect }: { part: Part; color: string; offset: [number, number, number]; selected: boolean; onSelect: (id: string) => void }) {
  const geoms = useMemo(() => part.prisms.map(prismGeometry), [part]);
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms]);
  const c = tint(color, part.id, selected);
  return (
    <group position={offset}>
      {geoms.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = '';
          }}
        >
          <meshStandardMaterial color={c} roughness={0.85} metalness={0} />
          {/* The housed strip of a stile is part of the same board, so it gets no outline of its own. */}
          {(part.type === 'louvre' || part.prisms[i].axis === 'z') && <Edges threshold={25} color={selected ? '#17408f' : '#4a3a2a'} />}
        </mesh>
      ))}
    </group>
  );
}

function Wall({ d }: { d: Design }) {
  const geom = useMemo(() => {
    const m = 130;
    const { w, h } = d.overall;
    const s = new THREE.Shape([
      new THREE.Vector2(-w / 2 - m, -h / 2 - m),
      new THREE.Vector2(w / 2 + m, -h / 2 - m),
      new THREE.Vector2(w / 2 + m, h / 2 + m),
      new THREE.Vector2(-w / 2 - m, h / 2 + m),
    ]);
    const ow = d.opening.w / 2;
    const oh = d.opening.h / 2;
    s.holes.push(new THREE.Path([new THREE.Vector2(-ow, -oh), new THREE.Vector2(ow, -oh), new THREE.Vector2(ow, oh), new THREE.Vector2(-ow, oh)]));
    const g = new THREE.ExtrudeGeometry(s, { depth: 30, bevelEnabled: false });
    g.translate(0, 0, (d.rebate ? d.rebate.depth : 0) - 30.2);
    return g;
  }, [d]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} raycast={() => null}>
      <meshStandardMaterial color="#9a9488" transparent opacity={0.55} roughness={1} depthWrite={false} />
      <Edges threshold={25} color="#7d776b" />
    </mesh>
  );
}

function CameraRig({ view, w, h }: { view: { name: ViewName; n: number }; w: number; h: number }) {
  const { camera, controls, size } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null; size: { width: number; height: number } };
  const fit = useRef({ w, h, aspect: 1 });
  fit.current = { w, h, aspect: size.width / Math.max(1, size.height) };
  useEffect(() => {
    // Far enough back that the vent fits the canvas both ways, whatever the pane's shape.
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const f = fit.current;
    const dist = 1.5 * Math.max(f.h / 2 / t, f.w / 2 / (t * f.aspect)) + 60;
    const dir = view.name === 'front' ? [0, 0, 1] : view.name === 'rear' ? [0, 0, -1] : [0.62, 0.42, 0.9];
    const v = new THREE.Vector3(...(dir as [number, number, number])).normalize().multiplyScalar(dist);
    camera.position.copy(v);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [view, camera, controls]);
  return null;
}

export function Viewer3D({ design, stale }: { design: Design; stale: boolean }) {
  const [view, setView] = useState<{ name: ViewName; n: number }>({ name: 'iso', n: 0 });
  const [explode, setExplode] = useState(0);
  const [wall, setWall] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [arOpen, setArOpen] = useState(false);
  const color = speciesOf(design.params.species).color;
  const size = Math.max(design.overall.w, design.overall.h);
  const base = size * 0.3 + 20;
  const sel = design.parts.find((p) => p.id === selected);
  const row = sel && design.cutList.find((r) => r.code === sel.code);

  return (
    <div className="viewer">
      <Canvas camera={{ fov: 32, near: 1, far: 40000, position: [300, 200, 500] }} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
        <color attach="background" args={['#eceae5']} />
        <ambientLight intensity={0.95} />
        <directionalLight position={[400, 600, 800]} intensity={1.5} />
        <directionalLight position={[-500, 200, -700]} intensity={0.9} />
        <group position={[0, 0, -design.overall.t / 2]}>
          {design.parts.map((part) => (
            <PartMesh
              key={part.id}
              part={part}
              color={color}
              selected={part.id === selected}
              onSelect={setSelected}
              offset={[part.explode[0] * explode * base, part.explode[1] * explode * base, part.explode[2] * explode * base]}
            />
          ))}
          {wall && <Wall d={design} />}
        </group>
        <OrbitControls makeDefault enableDamping={false} minDistance={40} maxDistance={12000} />
        <CameraRig view={view} w={design.overall.w} h={design.overall.h} />
      </Canvas>

      <div className="viewer-bar">
        <div className="seg" role="group" aria-label="View">
          {(['iso', 'front', 'rear'] as ViewName[]).map((v) => (
            <button key={v} className={view.name === v ? 'on' : ''} onClick={() => setView({ name: v, n: view.n + 1 })}>
              {v === 'iso' ? '3D' : v === 'front' ? 'Front' : 'Rear'}
            </button>
          ))}
        </div>
        <label className="slider-inline">
          Explode
          <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} />
        </label>
        <label className="check-inline">
          <input type="checkbox" checked={wall} onChange={(e) => setWall(e.target.checked)} /> Wall
        </label>
        <button className="ar-btn" onClick={() => setArOpen(true)}>
          View in your space
        </button>
      </div>

      {arOpen && <ArSheet design={design} onClose={() => setArOpen(false)} />}
      {stale && <div className="viewer-stale">Showing the last valid design. Fix the issues listed on the left to update it.</div>}

      <div className="viewer-info">
        {sel ? (
          <>
            <strong>
              {sel.code} · {sel.name}
            </strong>
            <span className="mono">{sel.id}</span>
            <span>
              {r1(sel.length)} × {r1(sel.width)} × {r1(sel.thickness)} mm
            </span>
            {row && <span>{row.qty} of this part in the cut list</span>}
            {sel.note && <span className="muted">{sel.note}</span>}
          </>
        ) : (
          <span className="muted">Drag to orbit, scroll to zoom, click a part to inspect it.</span>
        )}
      </div>
    </div>
  );
}
