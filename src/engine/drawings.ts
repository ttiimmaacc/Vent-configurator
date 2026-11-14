import type { Design, Pt } from './types';
import { r1 } from './design';

export interface DShape {
  pts: Pt[];
  holes?: Pt[][];
  style: 'solid' | 'cut' | 'thin' | 'dashed';
  closed: boolean;
}
export interface DDim {
  a: number;
  b: number;
  side: 'bottom' | 'top' | 'left' | 'right';
  level: number;
  text?: string;
}
export interface Drawing {
  key: string;
  title: string;
  subtitle: string;
  bounds: { x0: number; y0: number; x1: number; y1: number };
  shapes: DShape[];
  dims: DDim[];
}

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Intervals of y covered by a polygon along the vertical line x = xc. */
function sliceAtX(poly: Pt[], xc: number): [number, number][] {
  const ys: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((x1 - xc) * (x2 - xc) < 0) ys.push(y1 + ((xc - x1) / (x2 - x1)) * (y2 - y1));
  }
  ys.sort((p, q) => p - q);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ys.length; i += 2) out.push([ys[i], ys[i + 1]]);
  return out;
}

function subtract(base: [number, number][], cuts: [number, number][]): [number, number][] {
  let out = base;
  for (const [c0, c1] of cuts) {
    out = out.flatMap(([a, b]): [number, number][] => {
      if (c1 <= a || c0 >= b) return [[a, b]];
      const parts: [number, number][] = [];
      if (c0 > a) parts.push([a, c0]);
      if (c1 < b) parts.push([c1, b]);
      return parts;
    });
  }
  return out;
}

const chain = (values: number[], side: DDim['side'], level: number): DDim[] =>
  values.slice(1).map((v, i) => ({ a: values[i], b: v, side, level }));

export function frontDrawing(d: Design): Drawing {
  const { w: W, h: H } = d.overall;
  const G = d.grille;
  const p = d.params;
  const shapes: DShape[] = [];
  const ordered = [...d.parts.filter((x) => x.type === 'louvre'), ...d.parts.filter((x) => x.type !== 'louvre')];
  for (const part of ordered)
    for (const f of part.front) {
      shapes.push({ pts: f.outline, holes: f.holes, style: 'solid', closed: true });
      for (const l of f.lines ?? []) shapes.push({ pts: [l[0], l[1]], style: 'thin', closed: false });
    }
  shapes.push({ pts: box(-d.opening.w / 2, -d.opening.h / 2, d.opening.w / 2, d.opening.h / 2), style: 'dashed', closed: true });

  const dims: DDim[] = [];
  const flush = !!d.surround;
  const xs = flush
    ? [-W / 2, -d.surround!.pocket.w / 2, d.surround!.pocket.w / 2, W / 2]
    : [-W / 2, -d.clear.w / 2, d.clear.w / 2, W / 2];
  dims.push(...chain(xs, 'bottom', 1));
  dims.push({ a: -W / 2, b: W / 2, side: 'bottom', level: 2 });
  const ys = flush
    ? [-H / 2, -d.surround!.pocket.h / 2, d.surround!.pocket.h / 2, H / 2]
    : Array.from(new Set([-H / 2, ...d.cells.flatMap((c) => [c.y0, c.y1]), H / 2])).sort((a, b) => a - b);
  dims.push(...chain(ys, 'left', 1));
  dims.push({ a: -H / 2, b: H / 2, side: 'left', level: 2 });
  dims.push({ a: -d.opening.w / 2, b: d.opening.w / 2, side: 'top', level: 1, text: `opening ${r1(d.opening.w)}` });
  dims.push({ a: -d.opening.h / 2, b: d.opening.h / 2, side: 'right', level: 1, text: `opening ${r1(d.opening.h)}` });

  return {
    key: 'front',
    title: 'Front elevation',
    subtitle: flush
      ? `Surround ${r1(W)} × ${r1(H)} · insert ${r1(G.w)} × ${r1(G.h)} · opening dashed`
      : `${r1(W)} × ${r1(H)} overall · opening dashed`,
    bounds: { x0: -W / 2, y0: -H / 2, x1: W / 2, y1: H / 2 },
    shapes,
    dims,
  };
}

/** Section shapes in [z, y] coordinates, cut on the vertical plane through the first section. */
function sectionShapes(d: Design): DShape[] {
  const c0 = d.cells[0];
  const xc = (c0.x0 + c0.x1) / 2 + 0.0137;
  const G = d.grille;
  const { h: H, t: T } = d.overall;
  const shapes: DShape[] = [];
  if (d.surround) shapes.push({ pts: box(0, -H / 2, T, H / 2), style: 'thin', closed: true });
  shapes.push({ pts: box(G.z0, -G.h / 2, G.z1, G.h / 2), style: 'thin', closed: true });
  for (const part of d.parts)
    for (const pr of part.prisms) {
      if (pr.axis === 'z') {
        let iv = sliceAtX(pr.outline, xc);
        for (const h of pr.holes ?? []) iv = subtract(iv, sliceAtX(h, xc));
        for (const [a, b] of iv) shapes.push({ pts: box(pr.from, a, pr.to, b), style: 'cut', closed: true });
      } else if (pr.from <= xc && xc <= pr.to) {
        shapes.push({ pts: pr.outline.map(([y, z]) => [z, y] as Pt), style: 'cut', closed: true });
      }
    }
  // Wall, shown dashed.
  const wz = d.rebate ? d.rebate.depth : 0;
  const oh = d.opening.h / 2;
  for (const s of [-1, 1]) {
    shapes.push({ pts: [[-25, s * oh], [wz, s * oh], [wz, s * (H / 2 + 12)]], style: 'dashed', closed: false });
  }
  return shapes;
}

export function sectionDrawing(d: Design): Drawing {
  const { h: H, t: T } = d.overall;
  const G = d.grille;
  const dims: DDim[] = [{ a: 0, b: T, side: 'bottom', level: 1 }];
  if (d.surround) dims.push({ a: G.z0, b: G.z1, side: 'top', level: 1, text: `insert ${r1(G.t)}` });
  else if (d.rebate) dims.push({ a: 0, b: d.rebate.depth, side: 'top', level: 1 });
  dims.push({ a: -H / 2, b: H / 2, side: 'right', level: 1 });
  const L = d.louvre;
  return {
    key: 'section',
    title: 'Vertical section',
    subtitle: L
      ? `Louvre ${r1(L.width)} × ${r1(L.thickness)} at ${L.angle}° · wall dashed, room side right`
      : `Slots ${r1(d.slot!.width)} wide · wall dashed, room side right`,
    bounds: { x0: -25, y0: -H / 2 - 12, x1: T, y1: H / 2 + 12 },
    shapes: sectionShapes(d),
    dims,
  };
}

export function detailDrawing(d: Design): Drawing {
  const G = d.grille;
  const centres = (d.louvre ?? d.slot)!.centres[0];
  const reach = d.louvre ? d.louvre.heightProj : d.slot!.width * 1.5;
  const top = centres[Math.min(2, centres.length - 1)] + reach;
  const dims: DDim[] = [{ a: G.z0, b: G.z1, side: 'bottom', level: 1 }];
  dims.push({ a: -G.h / 2, b: centres[0], side: 'left', level: 1 });
  if (centres.length > 1) dims.push({ a: centres[0], b: centres[1], side: 'right', level: 1, text: `${r1(centres[1] - centres[0])} pitch` });
  const L = d.louvre;
  return {
    key: 'detail',
    title: L ? 'Louvre detail' : 'Slot detail',
    subtitle: L
      ? `Gap between louvres ${r1(L.throat)} · housing ${r1(d.params.housingDepth)} deep`
      : `Slot ${r1(d.slot!.width)} · timber between ${r1(d.slot!.web)}`,
    bounds: { x0: G.z0 - 4, y0: -G.h / 2 - 3, x1: G.z1 + 4, y1: Math.min(top, G.h / 2) },
    shapes: sectionShapes(d),
    dims,
  };
}

export const allDrawings = (d: Design): Drawing[] => [frontDrawing(d), sectionDrawing(d), detailDrawing(d)];
