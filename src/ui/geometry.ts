import * as THREE from 'three';
import type { Prism } from '../engine';

const X_BASIS = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));

/** Mesh geometry for one engine prism, in millimetres and engine axes. Shared by the 3D view and the AR export. */
export function prismGeometry(pr: Prism): THREE.BufferGeometry {
  const shape = new THREE.Shape(pr.outline.map(([a, b]) => new THREE.Vector2(a, b)));
  for (const h of pr.holes ?? []) shape.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: pr.to - pr.from, bevelEnabled: false });
  g.translate(0, 0, pr.from);
  if (pr.axis === 'x') g.applyMatrix4(X_BASIS);
  return g;
}

/** Species colour with a small per-part lightness shift so neighbouring parts read as separate boards. */
export function tint(hex: string, id: string, selected = false): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, ((Math.abs(h) % 9) - 4) * 0.008);
  if (selected) c.lerp(new THREE.Color('#2f6fde'), 0.55);
  return '#' + c.getHexString();
}
