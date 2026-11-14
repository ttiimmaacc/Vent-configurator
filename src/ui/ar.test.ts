import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_PARAMS, computeDesign } from '../engine';
import { buildArScene, exportUsdz } from './ar';

const box = (over = {}) => {
  const d = computeDesign({ ...DEFAULT_PARAMS, ...over });
  return { d, b: new THREE.Box3().setFromObject(buildArScene(d)) };
};

describe('AR export', () => {
  it('is real size in metres, back face on the wall plane, height running along -Z', () => {
    const { d, b } = box();
    const size = b.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(d.overall.w / 1000, 6);
    expect(size.y).toBeCloseTo(d.overall.t / 1000, 6);
    expect(size.z).toBeCloseTo(d.overall.h / 1000, 6);
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.min.z).toBeCloseTo(-d.overall.h / 2000, 6);
  });

  it('puts the top rail up the wall and the front face away from it', () => {
    const { d } = box();
    const scene = buildArScene(d);
    const centre = (id: string) => new THREE.Box3().setFromObject(scene.getObjectByName(id)!).getCenter(new THREE.Vector3());
    expect(centre('RL-T').z).toBeLessThan(centre('RL-B').z);
    expect(centre('STL-R').x).toBeGreaterThan(centre('STL-L').x);
  });

  it('sinks a locating spigot into the wall by the rebate depth', () => {
    const { d, b } = box({ locatingRebate: true });
    expect(b.min.y).toBeCloseTo(-d.rebate!.depth / 1000, 6);
    expect(b.max.y).toBeCloseTo((d.overall.t - d.rebate!.depth) / 1000, 6);
  });

  it('writes a USDZ archive anchored to a vertical plane', async () => {
    for (const over of [{}, { construction: 'slotted', mounting: 'flush' }] as const) {
      const bytes = await exportUsdz(computeDesign({ ...DEFAULT_PARAMS, ...over }));
      expect(bytes.length).toBeGreaterThan(5000);
      expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK');
      const text = new TextDecoder('latin1').decode(bytes);
      expect(text).toContain('preliminary:planeAnchoring:alignment = "vertical"');
      expect(text).toContain('metersPerUnit = 1');
    }
  });
});
