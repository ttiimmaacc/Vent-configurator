import * as THREE from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import type { Design } from '../engine';
import { speciesOf } from '../engine';
import { prismGeometry, tint } from './geometry';

export interface ArOptions {
  /**
   * 'wall': the vent sticks to a wall the phone detects.
   * 'floor': the vent stands upright above the floor at a set height. Floors are found much faster than walls.
   */
  mode: 'wall' | 'floor';
  /** Floor mode only: height of the vent's centre above the floor, in mm. */
  centreHeight: number;
  /** Adds bright alignment marks around the vent. */
  guides: boolean;
}

export const DEFAULT_AR: ArOptions = { mode: 'floor', centreHeight: 300, guides: true };

const GUIDE_COLOUR = '#e5332a';
/** How far the centre lines reach past the vent, and the size of the guide strips, in mm. */
const GUIDE = { reach: 120, width: 3, thick: 1 };

function strip(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.name = 'guide';
  return m;
}

/**
 * The vent as a scene for AR Quick Look, in metres.
 *
 * Quick Look puts a model's y = 0 plane on the detected surface with +Y pointing away from it.
 * Wall mode: the vent lies on its back. Width X stays X, depth Z becomes Y (out of the wall),
 * height Y becomes -Z (up the wall). The wall face lands on y = 0.
 * Floor mode: the vent stays upright with its centre at centreHeight above y = 0 and its wall face on z = 0.
 */
export function buildArScene(d: Design, opts: ArOptions = { ...DEFAULT_AR, mode: 'wall', guides: false }): THREE.Scene {
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
  const { w, h } = d.overall;
  const wallZ = d.rebate ? d.rebate.depth : 0;

  if (opts.guides) {
    // Centre lines on the wall face, reaching past the vent so they can be lined up with a pencil mark.
    const red = new THREE.MeshStandardMaterial({ color: GUIDE_COLOUR, roughness: 1, metalness: 0 });
    const z = wallZ + GUIDE.thick / 2;
    for (const s of [-1, 1]) {
      vent.add(strip(GUIDE.reach, GUIDE.width, GUIDE.thick, s * (w / 2 + GUIDE.reach / 2), 0, z, red));
      vent.add(strip(GUIDE.width, GUIDE.reach, GUIDE.thick, 0, s * (h / 2 + GUIDE.reach / 2), z, red));
    }
    if (opts.mode === 'floor') {
      // A line on the floor marking where the wall face is, and a post showing the set height.
      const floorY = -opts.centreHeight;
      vent.add(strip(w + 2 * GUIDE.reach, GUIDE.thick, GUIDE.width, 0, floorY + GUIDE.thick / 2, wallZ + GUIDE.width / 2, red));
      const post = opts.centreHeight - h / 2 - GUIDE.reach;
      if (post > 0) vent.add(strip(GUIDE.width, post, GUIDE.thick, 0, floorY + post / 2, z, red));
    }
  }

  vent.position.z = -wallZ;
  const placed = new THREE.Group();
  placed.add(vent);
  if (opts.mode === 'wall') placed.rotation.x = -Math.PI / 2;
  else placed.position.y = opts.centreHeight / 1000;
  placed.scale.setScalar(0.001);
  scene.add(placed);
  scene.updateMatrixWorld(true);
  return scene;
}

export async function exportUsdz(d: Design, opts: ArOptions = { ...DEFAULT_AR, mode: 'wall', guides: false }): Promise<Uint8Array> {
  const scene = buildArScene(d, opts);
  try {
    return await new USDZExporter().parseAsync(scene, {
      ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: opts.mode === 'wall' ? 'vertical' : 'horizontal' } },
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
export async function viewInAr(d: Design, opts: ArOptions): Promise<'ar' | 'download'> {
  const bytes = await exportUsdz(d, opts);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'model/vnd.usdz+zip' }));
  const a = document.createElement('a');
  const ar = arSupported();
  // The fragment tells Quick Look to lock the model at real size, so a pinch cannot rescale it.
  a.href = ar ? `${url}#allowsContentScaling=0` : url;
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
