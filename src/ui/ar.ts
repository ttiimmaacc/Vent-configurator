import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import type { Design } from '../engine';
import { speciesOf } from '../engine';
import { prismGeometry, tint } from './geometry';

/**
 * The vent as a scene for AR Quick Look: metres, lying on its back.
 *
 * Quick Look places a model's y = 0 plane on the detected surface with +Y pointing away from it.
 * For a wall, the model's -Z then points up the wall. So the engine's axes map as:
 * width X stays X, depth Z becomes Y (out of the wall), height Y becomes -Z (up the wall).
 * The wall face (z = 0, or the rebate depth when a spigot sits inside the opening) lands on y = 0.
 */
export function buildArScene(d: Design): THREE.Scene {
  const scene = new THREE.Scene();
  const vent = new THREE.Group();
  const color = speciesOf(d.params.species).color;
  for (const part of d.parts) {
    const material = new THREE.MeshStandardMaterial({ color: tint(color, part.id), roughness: 0.85, metalness: 0 });
    for (const pr of part.prisms) {
      const mesh = new THREE.Mesh(prismGeometry(pr), material);
      mesh.name = part.id;
      vent.add(mesh);
    }
  }
  const wallZ = d.rebate ? d.rebate.depth : 0;
  vent.position.z = -wallZ;
  const upright = new THREE.Group();
  upright.add(vent);
  upright.rotation.x = -Math.PI / 2;
  upright.scale.setScalar(0.001);
  scene.add(upright);
  scene.updateMatrixWorld(true);
  return scene;
}

export async function exportUsdz(d: Design): Promise<Uint8Array> {
  const scene = buildArScene(d);
  try {
    return await new USDZExporter().parseAsync(scene, {
      ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'vertical' } },
      includeAnchoringProperties: true,
      quickLookCompatible: true,
    });
  } finally {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}

/** True in Safari on iPhone and iPad, where a rel="ar" link opens AR Quick Look. */
export const arSupported = (): boolean => typeof document !== 'undefined' && document.createElement('a').relList.supports('ar');

/** Opens the vent in AR Quick Look where supported. Elsewhere it downloads the USDZ file instead. */
export async function viewInAr(d: Design): Promise<'ar' | 'download'> {
  const bytes = await exportUsdz(d);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/vnd.usdz+zip' }));
  const a = document.createElement('a');
  a.href = url;
  const ar = arSupported();
  if (ar) {
    a.rel = 'ar';
    // Quick Look only takes over the link when its first child is an image.
    a.appendChild(document.createElement('img'));
  } else {
    a.download = `sauna-vent-${d.id}.usdz`;
  }
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return ar ? 'ar' : 'download';
}
