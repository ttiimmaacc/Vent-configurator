import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_PARAMS, computeDesign } from '../engine';
import { buildArScene, exportUsdz } from './ar';
import type { ArOptions } from './ar';

const floor = (centreHeight: number, guides = false): ArOptions => ({ mode: 'floor', centreHeight, guides });

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

  it('floor mode stands the vent upright with its centre at the set height', () => {
    const d = computeDesign(DEFAULT_PARAMS);
    const scene = buildArScene(d, floor(450));
    const b = new THREE.Box3().setFromObject(scene);
    expect((b.min.y + b.max.y) / 2).toBeCloseTo(0.45, 6);
    expect(b.max.y - b.min.y).toBeCloseTo(d.overall.h / 1000, 6);
    expect(b.min.z).toBeCloseTo(0, 6);
    expect(b.max.z).toBeCloseTo(d.overall.t / 1000, 6);
    const y = (id: string) => new THREE.Box3().setFromObject(scene.getObjectByName(id)!).getCenter(new THREE.Vector3()).y;
    expect(y('RL-T')).toBeGreaterThan(y('RL-B'));
  });

  it('floor guides reach the floor and never go below it', () => {
    const d = computeDesign(DEFAULT_PARAMS);
    for (const height of [100, 300, 1500]) {
      const b = new THREE.Box3().setFromObject(buildArScene(d, floor(height, true)));
      expect(b.min.y).toBeCloseTo(Math.min(0, (height - d.overall.h / 2 - 120) / 1000), 6);
      if (height >= d.overall.h / 2 + 120) expect(b.min.y).toBeCloseTo(0, 6);
    }
  });

  it('wall guides lie on the wall face and extend past the vent', () => {
    const d = computeDesign(DEFAULT_PARAMS);
    const b = new THREE.Box3().setFromObject(buildArScene(d, { mode: 'wall', centreHeight: 0, guides: true }));
    expect(b.min.y).toBeCloseTo(0, 6);
    expect(b.max.x - b.min.x).toBeCloseTo((d.overall.w + 240) / 1000, 6);
    expect(b.max.z - b.min.z).toBeCloseTo((d.overall.h + 240) / 1000, 6);
  });

  it('anchors floor mode to a horizontal plane', async () => {
    const bytes = await exportUsdz(computeDesign(DEFAULT_PARAMS), floor(300, true));
    expect(new TextDecoder('latin1').decode(bytes)).toContain('preliminary:planeAnchoring:alignment = "horizontal"');
  });
});
