import type { Cell, Design, Issue, IssueFix, Params, Part, Prism, Pt, Station } from './types';
import { DEFAULT_PARAMS, FIELD_GROUPS, visibleFields } from './params';
import { buildCutList } from './cutlist';
import { planStock } from './stock';

/** Fixed construction rules. Every one is used by the geometry, the validation and the instructions. */
export const RULES = {
  /** Louvres are cut this much short of the housing bottom at each end. */
  LOUVRE_END_FLOAT: 0.5,
  /** Least timber left beside any rebate, housing or ledge. */
  MIN_WALL: 6,
  /** Least air gap between neighbouring louvres, measured square to their faces. */
  MIN_THROAT: 1,
  /** Least ledge thickness left under a flush insert. */
  MIN_LEDGE_THICKNESS: 3,
  /** Least clear aperture inside the frame. */
  MIN_CLEAR: 20,
  /** Extra length on each strip of a glued-up panel blank, trimmed after glue-up. */
  PANEL_LENGTH_ALLOWANCE: 20,
  /** Extra blank width allowed for jointing a glued-up panel. */
  PANEL_WIDTH_ALLOWANCE: 10,
  /** Extra rip thickness on louvre strips for planing the sawn faces. */
  LOUVRE_RIP_ALLOWANCE: 1,
};

export const r1 = (n: number) => Math.round(n * 10) / 10;
const rad = (deg: number) => (deg * Math.PI) / 180;
const floorHalf = (n: number) => Math.floor(n * 2 + 1e-9) / 2;
const ceilHalf = (n: number) => Math.ceil(n * 2 - 1e-9) / 2;
const numberField = (key: keyof Params) => {
  for (const g of FIELD_GROUPS) for (const f of g.fields) if (f.key === key && f.kind === 'number') return f;
  return undefined;
};

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function stadium(cx: number, cy: number, length: number, width: number, seg = 10): Pt[] {
  const r = width / 2;
  const half = Math.max(0, length / 2 - r);
  const pts: Pt[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / seg;
    pts.push([cx + half + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / seg;
    pts.push([cx - half + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function hashId(p: Params): string {
  const s = JSON.stringify(Object.keys(p).sort().map((k) => [k, (p as unknown as Record<string, unknown>)[k]]));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'SV-' + (h >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
}

/** Louvre cross-section as [y, z] points, centred on (cy, cz). Front edge (max z) is the low edge. */
export function louvreSection(cy: number, cz: number, w: number, t: number, angleDeg: number): Pt[] {
  const a = rad(angleDeg);
  const u: Pt = [-Math.sin(a), Math.cos(a)]; // across the width, back to front
  const v: Pt = [Math.cos(a), Math.sin(a)]; // through the thickness
  const c = (su: number, sv: number): Pt => [
    cy + (su * w * u[0]) / 2 + (sv * t * v[0]) / 2,
    cz + (su * w * u[1]) / 2 + (sv * t * v[1]) / 2,
  ];
  return [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
}

export function computeDesign(p: Params): Design {
  const issues: Issue[] = [];
  type K = keyof Params;
  const err = (rule: string, message: string, fields: K[] = [], fix?: IssueFix) => issues.push({ level: 'error', rule, message, fields, fix });
  const warn = (rule: string, message: string, fields: K[] = [], fix?: IssueFix) => issues.push({ level: 'warning', rule, message, fields, fix });
  /** A fix that sets one number, offered only when the new value is inside that input's own range. */
  const setTo = (key: K, value: number, label?: string): IssueFix | undefined => {
    const f = numberField(key);
    if (!f || !Number.isFinite(value) || value < f.min || value > f.max || value === p[key]) return undefined;
    return { label: label ?? `Set ${f.label.toLowerCase()} to ${r1(value)}${f.unit ? ' ' + f.unit : ''}`, patch: { [key]: r1(value) } as Partial<Params> };
  };
  const sizeFields: K[] = p.sizeBy === 'opening' ? ['openingWidth', 'openingHeight', 'overlap'] : ['overallWidth', 'overallHeight'];
  /** The largest smaller section count whose sections are at least needH high and needW wide. */
  const fewerSections = (needH = 8, needW = RULES.MIN_CLEAR): IssueFix | undefined => {
    for (let n = sections - 1; n >= 1; n--) {
      const gaps = (n - 1) * p.dividerWidth;
      const isStacked = p.sectionDirection === 'stacked' || n === 1;
      const h = isStacked ? (clearH - gaps) / n : clearH;
      const w = isStacked ? clearW : (clearW - gaps) / n;
      if (h >= Math.max(8, needH) && w >= Math.max(RULES.MIN_CLEAR, needW)) return { label: `Use ${n} section${n > 1 ? 's' : ''}`, patch: { sections: n } };
    }
    return undefined;
  };

  // R01: every visible input is a finite number inside its range.
  for (const f of visibleFields(p)) {
    if (f.kind !== 'number') continue;
    const v = p[f.key] as number;
    if (typeof v !== 'number' || !Number.isFinite(v)) err('R01', `${f.label} needs a number.`, [f.key], { label: 'Reset to default', patch: { [f.key]: DEFAULT_PARAMS[f.key] } as Partial<Params> });
    else if (v < f.min || v > f.max) err('R01', `${f.label} must be between ${f.min} and ${f.max}${f.unit ? ' ' + f.unit : ''}.`, [f.key], setTo(f.key, Math.min(f.max, Math.max(f.min, v))));
  }
  const sections = Math.max(1, Math.round(p.sections));
  if (p.sections !== sections) err('R01', 'Number of sections must be a whole number.', ['sections'], { label: `Use ${sections} section${sections > 1 ? 's' : ''}`, patch: { sections } });

  const louvred = p.construction === 'louvred';
  const flush = p.mounting === 'flush';
  const T = p.thickness;

  // Overall and opening sizes.
  const W = p.sizeBy === 'opening' ? p.openingWidth + 2 * p.overlap : p.overallWidth;
  const H = p.sizeBy === 'opening' ? p.openingHeight + 2 * p.overlap : p.overallHeight;
  const openW = p.sizeBy === 'opening' ? p.openingWidth : p.overallWidth - 2 * p.overlap;
  const openH = p.sizeBy === 'opening' ? p.openingHeight : p.overallHeight - 2 * p.overlap;
  if (openW <= 0 || openH <= 0) err('R02', 'The overlap is larger than half the overall size, so no wall opening is left.', ['overlap', ...sizeFields], setTo('overlap', Math.max(0, Math.floor(Math.min(W, H) / 2 - 10))));

  // Mounting.
  let Gw = W;
  let Gh = H;
  let Tg = T;
  let gz0 = 0;
  let surround: Design['surround'];
  if (flush) {
    const Ws = p.surroundWidth;
    const aperture = { w: W - 2 * Ws, h: H - 2 * Ws };
    const pocket = { w: aperture.w + 2 * p.ledgeWidth, h: aperture.h + 2 * p.ledgeWidth };
    Gw = pocket.w - 2 * p.insertClearance;
    Gh = pocket.h - 2 * p.insertClearance;
    Tg = p.insertThickness;
    gz0 = T - Tg;
    surround = { width: Ws, aperture, pocket, ledgeWidth: p.ledgeWidth, ledgeThickness: T - Tg };
    if (aperture.w < RULES.MIN_CLEAR || aperture.h < RULES.MIN_CLEAR)
      err('R10', `The surround leaves an aperture under ${RULES.MIN_CLEAR} mm. Reduce the surround width or increase the size.`, ['surroundWidth', ...sizeFields], setTo('surroundWidth', Math.floor((Math.min(W, H) - RULES.MIN_CLEAR) / 2)));
    if (T - Tg < RULES.MIN_LEDGE_THICKNESS)
      err('R10', `Insert thickness must leave a ledge at least ${RULES.MIN_LEDGE_THICKNESS} mm thick: at most ${r1(T - RULES.MIN_LEDGE_THICKNESS)} mm for a ${T} mm surround.`, ['insertThickness', 'thickness'], setTo('insertThickness', floorHalf(T - RULES.MIN_LEDGE_THICKNESS)));
    if (p.ledgeWidth > Ws - RULES.MIN_WALL)
      err('R10', `Ledge width must leave ${RULES.MIN_WALL} mm of surround beside it: at most ${r1(Ws - RULES.MIN_WALL)} mm.`, ['ledgeWidth', 'surroundWidth'], setTo('ledgeWidth', floorHalf(Ws - RULES.MIN_WALL)));
  }
  const gz1 = gz0 + Tg;

  // Frame and sections.
  const sw = p.stileWidth;
  const rw = p.railWidth;
  const dw = sections > 1 ? p.dividerWidth : 0;
  const clearW = Gw - 2 * sw;
  const clearH = Gh - 2 * rw;
  const narrowFrame = (): IssueFix | undefined => {
    const patch: Partial<Params> = {};
    const maxStile = Math.floor((Gw - RULES.MIN_CLEAR) / 2);
    const maxRail = Math.floor((Gh - RULES.MIN_CLEAR) / 2);
    if (sw > maxStile) patch.stileWidth = maxStile;
    if (rw > maxRail) patch.railWidth = maxRail;
    const lo = numberField('stileWidth')!.min;
    if (!Object.keys(patch).length || Object.values(patch).some((v) => (v as number) < lo)) return undefined;
    return { label: `Narrow the frame to ${Object.values(patch).join(' and ')} mm`, patch };
  };
  const widenFrame = (rebW: number, housing: number): IssueFix | undefined => {
    let stile = Math.max(sw, Math.ceil(rebW + housing + RULES.MIN_WALL));
    let rail = Math.max(rw, Math.ceil(rebW + RULES.MIN_WALL));
    if (p.construction === 'louvred' && p.joinery === 'mitre') stile = rail = Math.max(stile, rail);
    if (stile > numberField('stileWidth')!.max) return undefined;
    return { label: `Widen stiles to ${stile} mm and rails to ${rail} mm`, patch: { stileWidth: stile, railWidth: rail } };
  };
  /** Fewest-change spacing that keeps the minimum gap between louvres. */
  const spacingFix = (span: number, t: number, a: number): IssueFix | undefined => {
    const minPitch = (t + RULES.MIN_THROAT) / Math.cos(a);
    const most = Math.floor(span / minPitch + 1e-9) + 1;
    if (most < 2) return { label: 'Use 1 louvre per section', patch: { louvreCountMode: 'manual', louvreCount: 1 } };
    if (p.louvreCountMode === 'manual') return { label: `Use ${most} louvres per section`, patch: { louvreCount: most } };
    return setTo('louvrePitch', ceilHalf(span / (most - 1)));
  };
  if (clearW < RULES.MIN_CLEAR || clearH < RULES.MIN_CLEAR)
    err('R02', `The frame leaves a clear aperture under ${RULES.MIN_CLEAR} mm (${r1(clearW)} × ${r1(clearH)} mm). Narrow the frame or increase the size.`, ['stileWidth', 'railWidth', ...sizeFields], narrowFrame());

  const stacked = p.sectionDirection === 'stacked' || sections === 1;
  const cellW = stacked ? clearW : (clearW - (sections - 1) * dw) / sections;
  const cellH = stacked ? (clearH - (sections - 1) * dw) / sections : clearH;
  const cells: Cell[] = [];
  for (let i = 0; i < sections; i++) {
    const x0 = stacked ? -clearW / 2 : -clearW / 2 + i * (cellW + dw);
    const y0 = stacked ? -clearH / 2 + i * (cellH + dw) : -clearH / 2;
    cells.push({ index: i, x0, x1: x0 + cellW, y0, y1: y0 + cellH });
  }
  if (cellW < RULES.MIN_CLEAR || cellH < 8)
    err('R03', `Each section works out to ${r1(cellW)} × ${r1(cellH)} mm, which is too small. Use fewer sections or narrower dividers.`, ['sections', 'dividerWidth'], fewerSections());

  // Locating rebate.
  let rebate: Design['rebate'];
  if (p.locatingRebate) {
    rebate = { width: p.overlap + p.fitClearance, depth: p.rebateDepth };
    if (rebate.depth > T - 4) err('R09', `Rebate depth must leave 4 mm of thickness: at most ${r1(T - 4)} mm.`, ['rebateDepth', 'thickness'], setTo('rebateDepth', floorHalf(T - 4)));
    if (flush) {
      if (rebate.width > p.surroundWidth - RULES.MIN_WALL)
        err('R09', `The locating rebate (${r1(rebate.width)} mm) is too wide for the surround. Reduce the overlap or widen the surround.`, ['overlap', 'fitClearance', 'surroundWidth'], setTo('surroundWidth', Math.ceil(rebate.width + RULES.MIN_WALL)));
      if (rebate.depth > T - Tg && p.surroundWidth - rebate.width - p.ledgeWidth < RULES.MIN_WALL)
        err('R09', 'The locating rebate and the insert ledge would meet inside the surround. Reduce the rebate depth, the overlap or the ledge width.', ['rebateDepth', 'ledgeWidth', 'overlap', 'insertThickness'], setTo('rebateDepth', floorHalf(T - Tg)));
    } else {
      const hd = louvred ? p.housingDepth : 0;
      if (rebate.width > sw - hd - RULES.MIN_WALL || rebate.width > rw - RULES.MIN_WALL)
        err('R09', `The locating rebate (${r1(rebate.width)} mm) is too wide for the frame. Reduce the overlap or widen the stiles and rails.`, ['overlap', 'fitClearance', 'stileWidth', 'railWidth'], widenFrame(rebate.width, hd));
    }
  }

  // Louvres.
  let louvre: Design['louvre'];
  if (louvred) {
    const t = p.louvreThickness;
    const a = rad(p.louvreAngle);
    const room = Tg - 2 * p.faceSetback;
    const w = p.louvreWidthMode === 'auto' ? floorHalf((room - t * Math.sin(a)) / Math.cos(a)) : p.louvreWidth;
    const depthProj = w * Math.cos(a) + t * Math.sin(a);
    const heightProj = w * Math.sin(a) + t * Math.cos(a);
    if (w < t) err('R04', `There is not enough thickness for a louvre at this angle (width works out to ${r1(w)} mm). Increase the thickness or reduce the louvre thickness.`, [flush ? 'insertThickness' : 'thickness', 'louvreThickness', 'louvreAngle', 'faceSetback']);
    else if (depthProj > room + 1e-6)
      err('R04', `A ${r1(w)} mm louvre at ${p.louvreAngle}° needs ${r1(depthProj)} mm of depth but only ${r1(room)} mm is available inside the ${r1(Tg)} mm thickness. Reduce the louvre width or use auto width.`, ['louvreWidth', 'louvreAngle', flush ? 'insertThickness' : 'thickness', 'faceSetback'], { label: 'Use auto louvre width', patch: { louvreWidthMode: 'auto' } });

    const margin = heightProj / 2 + p.endClearance;
    const span = cellH - 2 * margin;
    let n = 1;
    if (span < 0) err('R03', `A section ${r1(cellH)} mm high cannot hold a louvre that stands ${r1(heightProj)} mm tall. Use fewer sections or a flatter louvre.`, ['sections', 'dividerWidth', 'louvreAngle', 'railWidth'], fewerSections(heightProj + 2 * p.endClearance));
    else if (p.louvreCountMode === 'auto') n = Math.max(1, Math.round(span / p.louvrePitch) + 1);
    else n = Math.max(1, Math.round(p.louvreCount));
    const pitch = n > 1 ? span / (n - 1) : 0;
    const throat = n > 1 ? pitch * Math.cos(a) - t : 0;
    if (n > 1 && throat < RULES.MIN_THROAT)
      err('R05', `Louvres are too close: the gap between them is ${r1(throat)} mm. Use fewer louvres, a wider spacing or thinner louvres.`, [p.louvreCountMode === 'auto' ? 'louvrePitch' : 'louvreCount', 'louvreThickness', 'louvreAngle'], spacingFix(span, t, a));
    else if (n > 1 && throat < 3) warn('R05', `The gap between louvres is only ${r1(throat)} mm.`, [p.louvreCountMode === 'auto' ? 'louvrePitch' : 'louvreCount', 'louvreThickness']);

    if (p.housingDepth > sw - RULES.MIN_WALL)
      err('R06', `Housing depth must leave ${RULES.MIN_WALL} mm of stile: at most ${r1(sw - RULES.MIN_WALL)} mm.`, ['housingDepth', 'stileWidth'], setTo('housingDepth', floorHalf(sw - RULES.MIN_WALL)));
    if (!stacked && dw < 2 * p.housingDepth + RULES.MIN_WALL)
      err('R06', `Mullions are housed from both sides and need to be at least ${r1(2 * p.housingDepth + RULES.MIN_WALL)} mm wide.`, ['dividerWidth', 'housingDepth'], setTo('dividerWidth', Math.ceil(2 * p.housingDepth + RULES.MIN_WALL)));
    if (p.joinery === 'mitre' && sw !== rw) err('R07', 'Mitred corners need stiles and rails of the same width.', ['stileWidth', 'railWidth', 'joinery'], setTo('railWidth', sw, `Match rail width to the stiles (${sw} mm)`));
    if (p.joinery === 'stub-tenon' && p.tenonLength > sw - RULES.MIN_WALL)
      err('R08', `Tenon length must leave ${RULES.MIN_WALL} mm of stile: at most ${r1(sw - RULES.MIN_WALL)} mm.`, ['tenonLength', 'stileWidth'], setTo('tenonLength', Math.floor(sw - RULES.MIN_WALL)));
    if (p.joinery !== 'stub-tenon' && p.dowelDiameter > Tg - RULES.MIN_WALL)
      err('R08', `A ${p.dowelDiameter} mm dowel is too large for ${r1(Tg)} mm thick parts.`, ['dowelDiameter', flush ? 'insertThickness' : 'thickness'], setTo('dowelDiameter', Math.floor(Tg - RULES.MIN_WALL)));

    const length = cellW + 2 * (p.housingDepth - RULES.LOUVRE_END_FLOAT);
    if (cellW > 50 * t)
      warn('R12', `Louvres span ${r1(cellW)} mm, more than 50× their thickness. As a rule of thumb, check they are stiff enough or split the vent into side-by-side sections.`, ['louvreThickness', 'sections', 'sectionDirection']);

    const centres = cells.map((c) =>
      Array.from({ length: n }, (_, j) => (n > 1 ? c.y0 + margin + j * pitch : (c.y0 + c.y1) / 2)),
    );
    louvre = { width: w, thickness: t, angle: p.louvreAngle, length, depthProj, heightProj, pitch, perCell: n, total: n * sections, throat, sightGap: Math.max(0, pitch - heightProj), centres };
  }

  // Slots.
  let slot: Design['slot'];
  if (!louvred) {
    const pitch = p.slotWidth + p.slotWeb;
    const n = Math.floor((cellH + p.slotWeb + 1e-6) / pitch);
    if (n < 1) err('R03', `A section ${r1(cellH)} mm high cannot hold a ${p.slotWidth} mm slot.`, ['slotWidth', 'sections', 'dividerWidth'], fewerSections(p.slotWidth));
    if (cellW < p.slotWidth) err('R03', 'Sections are narrower than the slot width.', ['slotWidth', 'sections', 'stileWidth'], fewerSections(p.slotWidth, p.slotWidth));
    if (p.slotWeb < 4) warn('R05', `Only ${p.slotWeb} mm of timber is left between slots.`, ['slotWeb']);
    const used = n * p.slotWidth + (n - 1) * p.slotWeb;
    const centres = cells.map((c) =>
      Array.from({ length: Math.max(0, n) }, (_, j) => c.y0 + (cellH - used) / 2 + p.slotWidth / 2 + j * pitch),
    );
    slot = { width: p.slotWidth, web: p.slotWeb, length: cellW, pitch, perCell: Math.max(0, n), total: Math.max(0, n) * sections, centres };
  }

  if (Tg > p.stockThickness || T > p.stockThickness)
    err('R11', `Board thickness (${p.stockThickness} mm) is less than the finished thickness (${r1(Math.max(T, Tg))} mm).`, ['stockThickness', 'thickness'], setTo('stockThickness', ceilHalf(Math.max(T, Tg))));

  if (clearW > openW + 0.01 || clearH > openH + 0.01)
    warn('R13', `The grille's clear area (${r1(clearW)} × ${r1(clearH)} mm) is larger than the wall opening (${r1(openW)} × ${r1(openH)} mm), so part of it sits over solid wall.`, ['overlap', 'stileWidth', 'railWidth']);

  // Dowels: two per joint when the rail is at least four dowel diameters wide, otherwise one.
  const dowelled = louvred && p.joinery !== 'stub-tenon';
  const cornerJoints = louvred && p.joinery === 'dowel' ? 4 : 0;
  const dividerJoints = dowelled ? 2 * (sections - 1) : 0;
  const perJoint = Math.min(rw, sections > 1 ? dw : rw) >= 4 * p.dowelDiameter ? 2 : 1;
  const dowels = { perJoint, joints: cornerJoints + dividerJoints, total: (cornerJoints + dividerJoints) * perJoint, diameter: p.dowelDiameter };

  const base: Design = {
    id: hashId(p),
    params: p,
    issues,
    ok: false,
    overall: { w: W, h: H, t: T },
    opening: { w: openW, h: openH },
    grille: { w: Gw, h: Gh, t: Tg, z0: gz0, z1: gz1 },
    clear: { w: clearW, h: clearH },
    cells,
    louvre,
    slot,
    surround,
    rebate,
    dowels,
    stations: [],
    openArea: { mm2: 0, pctOfFace: 0, basis: '' },
    parts: [],
    cutList: [],
    stock: null,
  };
  if (issues.some((i) => i.level === 'error')) return base;

  // ---------------------------------------------------------------- geometry
  const parts: Part[] = [];
  const zOut: [number, number, number] = flush ? [0, 0, 1.3] : [0, 0, 0];
  const gRebate = !flush ? rebate : undefined;
  const layers: { from: number; to: number; inset: number }[] = gRebate
    ? [
        { from: gz0, to: gz0 + gRebate.depth, inset: gRebate.width },
        { from: gz0 + gRebate.depth, to: gz1, inset: 0 },
      ]
    : [{ from: gz0, to: gz1, inset: 0 }];
  const cy0 = -clearH / 2;
  const cy1 = clearH / 2;
  const hd = louvred ? p.housingDepth : 0;
  const mitre = louvred && p.joinery === 'mitre';
  const tenon = louvred && p.joinery === 'stub-tenon' ? p.tenonLength : 0;
  const gcz = (gz0 + gz1) / 2;

  if (louvred && louvre) {
    const L = louvre;
    const holesFor = (cellIdx: number[]) =>
      cellIdx.flatMap((ci) => L.centres[ci].map((cy) => louvreSection(cy, gcz, L.width, L.thickness, L.angle)));
    const allCells = cells.map((c) => c.index);

    // Stiles.
    for (const side of [-1, 1] as const) {
      const xo = (side * Gw) / 2;
      const xi = side * (Gw / 2 - sw);
      const xh = side * (Gw / 2 - sw + hd); // bottom of the housings
      const prisms: Prism[] = layers.map((l) => {
        const xoL = side * (Gw / 2 - l.inset);
        const yb = -Gh / 2 + l.inset;
        const yt = Gh / 2 - l.inset;
        const outline: Pt[] = mitre
          ? [[xoL, yb], [xi, cy0], [xh, cy0], [xh, cy1], [xi, cy1], [xoL, yt]]
          : [[xoL, yb], [xi, yb], [xi, cy0], [xh, cy0], [xh, cy1], [xi, cy1], [xi, yt], [xoL, yt]];
        return { axis: 'z', outline, from: l.from, to: l.to };
      });
      prisms.push({
        axis: 'x',
        outline: [[cy0, gz0], [cy1, gz0], [cy1, gz1], [cy0, gz1]],
        holes: holesFor(stacked ? allCells : [side < 0 ? 0 : sections - 1]),
        from: Math.min(xi, xh),
        to: Math.max(xi, xh),
      });
      const front: Pt[] = mitre
        ? [[xo, -Gh / 2], [xi, cy0], [xi, cy1], [xo, Gh / 2]]
        : rect(Math.min(xo, xi), -Gh / 2, Math.max(xo, xi), Gh / 2);
      parts.push({
        id: side < 0 ? 'STL-L' : 'STL-R',
        code: '',
        type: 'stile',
        name: 'Stile',
        length: Gh,
        width: sw,
        thickness: Tg,
        note: mitre ? 'Mitre both ends at 45°, length is long point' : '',
        prisms,
        front: [{ outline: front }],
        explode: [side + zOut[0], 0, zOut[2]],
        stock: [{ length: Gh, ripWidth: sw }],
      });
    }

    // Rails.
    for (const side of [-1, 1] as const) {
      const prisms: Prism[] = layers.map((l) => {
        const yo = side * (Gh / 2 - l.inset);
        const yi = side * (Gh / 2 - rw);
        const outline: Pt[] = mitre
          ? [[-Gw / 2 + l.inset, yo], [Gw / 2 - l.inset, yo], [Gw / 2 - sw, yi], [-Gw / 2 + sw, yi]]
          : rect(-clearW / 2, Math.min(yo, yi), clearW / 2, Math.max(yo, yi));
        return { axis: 'z', outline, from: l.from, to: l.to };
      });
      const yo = (side * Gh) / 2;
      const yi = side * (Gh / 2 - rw);
      const front: Pt[] = mitre
        ? [[-Gw / 2, yo], [Gw / 2, yo], [Gw / 2 - sw, yi], [-Gw / 2 + sw, yi]]
        : rect(-clearW / 2, Math.min(yo, yi), clearW / 2, Math.max(yo, yi));
      const length = mitre ? Gw : clearW + 2 * tenon;
      parts.push({
        id: side > 0 ? 'RL-T' : 'RL-B',
        code: '',
        type: 'rail',
        name: 'Rail',
        length,
        width: rw,
        thickness: Tg,
        note: mitre ? 'Mitre both ends at 45°, length is long point' : tenon ? `Includes a ${tenon} mm tenon each end` : '',
        prisms,
        front: [{ outline: front }],
        explode: [0, side, zOut[2]],
        stock: [{ length, ripWidth: rw }],
      });
    }

    // Dividers.
    for (let i = 1; i < sections; i++) {
      const frac = (i - sections / 2) / Math.max(1, sections / 2);
      if (stacked) {
        const y0 = cells[i - 1].y1;
        const outline = rect(-clearW / 2, y0, clearW / 2, y0 + dw);
        parts.push({
          id: `DIV-${i}`,
          code: '',
          type: 'divider',
          name: 'Mid rail',
          length: clearW + 2 * tenon,
          width: dw,
          thickness: Tg,
          note: tenon ? `Includes a ${tenon} mm tenon each end` : '',
          prisms: [{ axis: 'z', outline, from: gz0, to: gz1 }],
          front: [{ outline }],
          explode: [0, frac * 0.4, zOut[2]],
          stock: [{ length: clearW + 2 * tenon, ripWidth: dw }],
        });
      } else {
        const x0 = cells[i - 1].x1;
        const strip: Pt[] = [[cy0, gz0], [cy1, gz0], [cy1, gz1], [cy0, gz1]];
        parts.push({
          id: `DIV-${i}`,
          code: '',
          type: 'divider',
          name: 'Mullion',
          length: clearH + 2 * tenon,
          width: dw,
          thickness: Tg,
          note: tenon ? `Includes a ${tenon} mm tenon each end. Housed on both edges` : 'Housed on both edges',
          prisms: [
            { axis: 'z', outline: rect(x0 + hd, cy0, x0 + dw - hd, cy1), from: gz0, to: gz1 },
            { axis: 'x', outline: strip, holes: holesFor([i - 1]), from: x0, to: x0 + hd },
            { axis: 'x', outline: strip, holes: holesFor([i]), from: x0 + dw - hd, to: x0 + dw },
          ],
          front: [{ outline: rect(x0, cy0, x0 + dw, cy1) }],
          explode: [frac * 0.4, 0, zOut[2]],
          stock: [{ length: clearH + 2 * tenon, ripWidth: dw }],
        });
      }
    }

    // Louvres. Ripped on edge when the louvre width fits inside the board thickness.
    const onEdge = L.width <= p.stockThickness;
    const ripWidth = onEdge ? L.thickness + RULES.LOUVRE_RIP_ALLOWANCE : L.width;
    const stockNote = onEdge
      ? `Rip ${r1(ripWidth)} mm strips off the board edge, then plane to ${r1(L.width)} × ${r1(L.thickness)} mm`
      : `Rip to ${r1(L.width)} mm wide, then resaw and plane to ${r1(L.thickness)} mm thick`;
    const a = rad(L.angle);
    for (const c of cells) {
      const cxFrac = clearW > 0 ? ((c.x0 + c.x1) / 2 / (clearW / 2)) * 0.6 : 0;
      L.centres[c.index].forEach((cy, j) => {
        const edgeY = cy - (L.width / 2) * Math.sin(a) + (L.thickness / 2) * Math.cos(a);
        parts.push({
          id: `LV-${c.index + 1}-${String(j + 1).padStart(2, '0')}`,
          code: '',
          type: 'louvre',
          name: 'Louvre',
          length: L.length,
          width: L.width,
          thickness: L.thickness,
          note: stockNote,
          prisms: [
            {
              axis: 'x',
              outline: louvreSection(cy, gcz, L.width, L.thickness, L.angle),
              from: c.x0 - hd + RULES.LOUVRE_END_FLOAT,
              to: c.x1 + hd - RULES.LOUVRE_END_FLOAT,
            },
          ],
          front: [
            {
              outline: rect(c.x0, cy - L.heightProj / 2, c.x1, cy + L.heightProj / 2),
              lines: [[[c.x0, edgeY], [c.x1, edgeY]]],
            },
          ],
          explode: [cxFrac, 0, zOut[2]],
          stock: [{ length: L.length, ripWidth, note: stockNote }],
        });
      });
    }
  }

  if (!louvred && slot) {
    const S = slot;
    const holes = cells.flatMap((c) => S.centres[c.index].map((cy) => stadium((c.x0 + c.x1) / 2, cy, S.length, S.width)));
    const strips = Gh <= p.stockWidth ? 1 : Math.ceil((Gh + RULES.PANEL_WIDTH_ALLOWANCE) / p.stockWidth);
    const stock =
      strips === 1
        ? [{ length: Gw, ripWidth: Gh }]
        : Array.from({ length: strips }, () => ({
            length: Gw + RULES.PANEL_LENGTH_ALLOWANCE,
            ripWidth: p.stockWidth,
            note: 'Panel blank strip, full board width',
          }));
    parts.push({
      id: 'PNL',
      code: '',
      type: 'panel',
      name: 'Slotted panel',
      length: Gw,
      width: Gh,
      thickness: Tg,
      note:
        strips === 1
          ? 'Grain runs along the slots'
          : `Glue up from ${strips} strips, grain along the slots, then trim to size`,
      prisms: layers.map((l) => ({
        axis: 'z' as const,
        outline: rect(-Gw / 2 + l.inset, -Gh / 2 + l.inset, Gw / 2 - l.inset, Gh / 2 - l.inset),
        holes,
        from: l.from,
        to: l.to,
      })),
      front: [{ outline: rect(-Gw / 2, -Gh / 2, Gw / 2, Gh / 2), holes }],
      explode: zOut,
      stock,
    });
  }

  if (flush && surround) {
    const A = surround.aperture;
    const P = surround.pocket;
    const cuts = Array.from(new Set([0, rebate ? rebate.depth : 0, T - Tg, T])).sort((x, y) => x - y);
    const sLayers = [] as { from: number; to: number; o: number; iw: number; ih: number }[];
    for (let i = 0; i < cuts.length - 1; i++) {
      const zm = (cuts[i] + cuts[i + 1]) / 2;
      const o = rebate && zm < rebate.depth ? rebate.width : 0;
      const inner = zm > T - Tg ? P : A;
      sLayers.push({ from: cuts[i], to: cuts[i + 1], o, iw: inner.w, ih: inner.h });
    }
    const member = (id: string, type: 'surroundH' | 'surroundV', sx: number, sy: number) => {
      const poly = (o: number, iw: number, ih: number): Pt[] => {
        const ox = W / 2 - o;
        const oy = H / 2 - o;
        const ix = iw / 2;
        const iy = ih / 2;
        return sy !== 0
          ? [[-ox, sy * oy], [ox, sy * oy], [ix, sy * iy], [-ix, sy * iy]]
          : [[sx * ox, -oy], [sx * ix, -iy], [sx * ix, iy], [sx * ox, oy]];
      };
      const length = sy !== 0 ? W : H;
      parts.push({
        id,
        code: '',
        type,
        name: sy !== 0 ? 'Surround, top and bottom' : 'Surround, side',
        length,
        width: surround!.width,
        thickness: T,
        note: 'Mitre both ends at 45°, length is long point',
        prisms: sLayers.map((l) => ({ axis: 'z' as const, outline: poly(l.o, l.iw, l.ih), from: l.from, to: l.to })),
        front: [{ outline: poly(0, A.w, A.h) }, { outline: poly(0, P.w, P.h) }],
        explode: [sx * 0.7, sy * 0.7, 0],
        stock: [{ length, ripWidth: surround!.width }],
      });
    };
    member('SUR-T', 'surroundH', 0, 1);
    member('SUR-B', 'surroundH', 0, -1);
    member('SUR-L', 'surroundV', -1, 0);
    member('SUR-R', 'surroundV', 1, 0);
  }

  // Housing stations, measured along the member from its bottom end.
  const stations: Station[] = [];
  if (louvre) {
    const L = louvre;
    if (stacked) stations.push({ member: 'Stile', from: 'bottom end', values: L.centres.flat().map((y) => r1(y + Gh / 2)) });
    else {
      stations.push({ member: 'Stile', from: 'bottom end', values: L.centres[0].map((y) => r1(y + Gh / 2)) });
      stations.push({ member: 'Mullion', from: 'bottom shoulder', values: L.centres[0].map((y) => r1(y - cy0)) });
    }
  }
  if (slot) stations.push({ member: 'Panel', from: 'bottom edge', values: (stacked ? slot.centres.flat() : slot.centres[0] ?? []).map((y) => r1(y + Gh / 2)) });

  // Geometric open area only. No airflow figure is derived from it.
  let mm2 = 0;
  let basis = '';
  if (louvre) {
    mm2 = sections * cellW * (Math.max(0, louvre.perCell - 1) * louvre.throat + 2 * p.endClearance);
    basis = 'Sum of the gaps between louvres, measured square to the louvre faces, times the louvre clear length';
  } else if (slot) {
    const w = slot.width;
    mm2 = slot.total * ((slot.length - w) * w + (Math.PI * w * w) / 4);
    basis = 'Sum of the slot areas';
  }

  const cutList = buildCutList(parts);
  const stockResult = planStock(parts, p);
  issues.push(...stockResult.issues);

  return {
    ...base,
    ok: !issues.some((i) => i.level === 'error'),
    parts,
    stations,
    cutList,
    stock: stockResult.plan,
    openArea: { mm2, pctOfFace: (mm2 / (W * H)) * 100, basis },
  };
}
