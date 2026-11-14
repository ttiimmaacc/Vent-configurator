import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, RULES, allDrawings, buildInstructions, computeDesign, cutListCsv, r1 } from './index';
import type { Design, Params } from './index';

const make = (over: Partial<Params> = {}) => computeDesign({ ...DEFAULT_PARAMS, ...over });
const errors = (d: Design) => d.issues.filter((i) => i.level === 'error');

/** A spread of valid and invalid configurations. Invalid ones must be rejected, valid ones must hold every invariant. */
function grid(): Params[] {
  const out: Params[] = [];
  for (const construction of ['louvred', 'slotted'] as const)
    for (const mounting of ['surface', 'flush'] as const)
      for (const sections of [1, 2, 3])
        for (const sectionDirection of ['stacked', 'side'] as const)
          for (const [openingWidth, openingHeight] of [[150, 300], [400, 120], [250, 250], [90, 600]])
            for (const louvreAngle of [20, 45, 60])
              for (const locatingRebate of [false, true])
                out.push({
                  ...DEFAULT_PARAMS,
                  construction, mounting, sections, sectionDirection, openingWidth, openingHeight, louvreAngle, locatingRebate,
                  joinery: sections === 3 ? 'stub-tenon' : louvreAngle === 60 ? 'mitre' : 'dowel',
                });
  return out;
}

describe('default design', () => {
  const d = make();
  it('is valid', () => {
    expect(errors(d)).toEqual([]);
    expect(d.ok).toBe(true);
  });
  it('derives overall size from opening and overlap', () => {
    expect(d.overall).toEqual({ w: 180, h: 330, t: 19 });
    expect(d.clear).toEqual({ w: 124, h: 274 });
  });
  it('has stable part identifiers', () => {
    const ids = d.parts.map((p) => p.id);
    expect(ids.slice(0, 5)).toEqual(['STL-L', 'STL-R', 'RL-B', 'RL-T', 'DIV-1']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('LV-1-01');
    expect(ids).toContain(`LV-2-${String(d.louvre!.perCell).padStart(2, '0')}`);
  });
  it('is deterministic', () => {
    const again = make();
    expect(again.id).toBe(d.id);
    expect(JSON.stringify(again)).toBe(JSON.stringify(d));
    expect(make({ openingWidth: 151 }).id).not.toBe(d.id);
  });
  it('gives the same result sized by opening or by overall', () => {
    const o = make({ sizeBy: 'overall', overallWidth: 180, overallHeight: 330 });
    expect(o.opening).toEqual(d.opening);
    expect(o.cutList.map((r) => [r.code, r.qty, r.length, r.width])).toEqual(d.cutList.map((r) => [r.code, r.qty, r.length, r.width]));
  });
});

describe('invariants across the configuration grid', () => {
  const designs = grid().map(computeDesign);
  const valid = designs.filter((d) => d.ok);

  it('covers plenty of valid and some rejected designs', () => {
    expect(valid.length).toBeGreaterThan(200);
    expect(designs.length - valid.length).toBeGreaterThan(0);
  });

  it('never returns parts for a rejected design', () => {
    for (const d of designs) if (!d.ok && errors(d).some((e) => e.rule !== 'R11')) expect(d.parts).toEqual([]);
  });

  it('keeps every louvre inside its section and inside the thickness', () => {
    for (const d of valid) {
      if (!d.louvre) continue;
      const p = d.params;
      for (const part of d.parts.filter((x) => x.type === 'louvre')) {
        const cell = d.cells[Number(part.id.split('-')[1]) - 1];
        const pr = part.prisms[0];
        for (const [y, z] of pr.outline) {
          expect(y).toBeGreaterThanOrEqual(cell.y0 + p.endClearance - 1e-6);
          expect(y).toBeLessThanOrEqual(cell.y1 - p.endClearance + 1e-6);
          expect(z).toBeGreaterThanOrEqual(d.grille.z0 + p.faceSetback - 1e-6);
          expect(z).toBeLessThanOrEqual(d.grille.z1 - p.faceSetback + 1e-6);
        }
        // Ends sit inside the housings with the stated float.
        expect(pr.from).toBeCloseTo(cell.x0 - p.housingDepth + RULES.LOUVRE_END_FLOAT, 6);
        expect(pr.to - pr.from).toBeCloseTo(part.length, 6);
      }
      if (d.louvre.perCell > 1) expect(d.louvre.throat).toBeGreaterThanOrEqual(RULES.MIN_THROAT);
    }
  });

  it('keeps every slot inside its section', () => {
    for (const d of valid) {
      if (!d.slot) continue;
      const panel = d.parts.find((x) => x.type === 'panel')!;
      expect(panel.prisms[0].holes!.length).toBe(d.slot.total);
      for (const hole of panel.prisms[0].holes!) {
        const cx = hole.reduce((s, q) => s + q[0], 0) / hole.length;
        const cy = hole.reduce((s, q) => s + q[1], 0) / hole.length;
        const cell = d.cells.find((c) => cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1)!;
        expect(cell).toBeDefined();
        for (const [x, y] of hole) {
          expect(x).toBeGreaterThanOrEqual(cell.x0 - 1e-6);
          expect(x).toBeLessThanOrEqual(cell.x1 + 1e-6);
          expect(y).toBeGreaterThanOrEqual(cell.y0 - 1e-6);
          expect(y).toBeLessThanOrEqual(cell.y1 + 1e-6);
        }
      }
    }
  });

  it('sections and dividers add up to the clear aperture', () => {
    for (const d of valid) {
      const n = d.cells.length;
      const stacked = d.params.sectionDirection === 'stacked' || n === 1;
      const c = d.cells[0];
      const dw = n > 1 ? d.params.dividerWidth : 0;
      if (stacked) expect(n * (c.y1 - c.y0) + (n - 1) * dw).toBeCloseTo(d.clear.h, 6);
      else expect(n * (c.x1 - c.x0) + (n - 1) * dw).toBeCloseTo(d.clear.w, 6);
      expect(d.clear.w).toBeCloseTo(d.grille.w - 2 * d.params.stileWidth, 6);
      expect(d.clear.h).toBeCloseTo(d.grille.h - 2 * d.params.railWidth, 6);
    }
  });

  it('keeps all geometry inside the overall envelope', () => {
    for (const d of valid) {
      const { w, h, t } = d.overall;
      for (const part of d.parts)
        for (const pr of part.prisms) {
          const xs = pr.axis === 'z' ? pr.outline.map((q) => q[0]) : [pr.from, pr.to];
          const ys = pr.axis === 'z' ? pr.outline.map((q) => q[1]) : pr.outline.map((q) => q[0]);
          const zs = pr.axis === 'z' ? [pr.from, pr.to] : pr.outline.map((q) => q[1]);
          expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(w / 2 + 1e-6);
          expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(h / 2 + 1e-6);
          expect(Math.min(...zs)).toBeGreaterThanOrEqual(-1e-6);
          expect(Math.max(...zs)).toBeLessThanOrEqual(t + 1e-6);
        }
    }
  });

  it('flush inserts fit their pocket with the stated clearance and sit flush', () => {
    for (const d of valid) {
      if (!d.surround) continue;
      const c = d.params.insertClearance;
      expect(d.grille.w).toBeCloseTo(d.surround.pocket.w - 2 * c, 6);
      expect(d.grille.h).toBeCloseTo(d.surround.pocket.h - 2 * c, 6);
      expect(d.grille.z1).toBeCloseTo(d.overall.t, 6);
      expect(d.surround.ledgeThickness).toBeGreaterThanOrEqual(RULES.MIN_LEDGE_THICKNESS);
      expect(d.parts.filter((p) => p.type.startsWith('surround')).length).toBe(4);
    }
  });

  it('cut list accounts for every part exactly once', () => {
    for (const d of valid) {
      expect(d.cutList.reduce((s, r) => s + r.qty, 0)).toBe(d.parts.length);
      const listed = d.cutList.flatMap((r) => r.partIds).sort();
      expect(listed).toEqual(d.parts.map((p) => p.id).sort());
      for (const part of d.parts) {
        const row = d.cutList.find((r) => r.code === part.code)!;
        expect(row.length).toBe(r1(part.length));
        expect(row.width).toBe(r1(part.width));
      }
    }
  });

  it('stock layout places every piece once, with kerf, inside the board', () => {
    for (const d of valid) {
      const s = d.stock!;
      const need = new Map<string, number>();
      for (const part of d.parts) for (const it of part.stock) need.set(`${part.code}|${r1(it.length)}`, (need.get(`${part.code}|${r1(it.length)}`) ?? 0) + 1);
      const got = new Map<string, number>();
      for (const b of s.boards) {
        let y = 0;
        for (const rip of b.rips) {
          expect(rip.yOffset).toBeGreaterThanOrEqual(y - 1e-6);
          expect(rip.yOffset + rip.ripWidth).toBeLessThanOrEqual(s.stockWidth + 1e-6);
          y = rip.yOffset + rip.ripWidth + s.kerf;
          let x = s.endTrim;
          for (const c of rip.cuts) {
            expect(c.offset).toBeGreaterThanOrEqual(x - 1e-6);
            expect(c.offset + c.length).toBeLessThanOrEqual(s.stockLength + 1e-6);
            x = c.offset + c.length + s.kerf;
            got.set(`${c.code}|${r1(c.length)}`, (got.get(`${c.code}|${r1(c.length)}`) ?? 0) + 1);
          }
        }
      }
      expect(got).toEqual(need);
      expect(s.yieldPct).toBeGreaterThan(0);
      expect(s.yieldPct).toBeLessThanOrEqual(100);
    }
  });

  it('drawings and instructions quote the engine values', () => {
    for (const d of valid.filter((_, i) => i % 7 === 0)) {
      const [front, section] = allDrawings(d);
      const overallDim = front.dims.find((x) => x.side === 'bottom' && x.level === 2)!;
      expect(overallDim.b - overallDim.a).toBeCloseTo(d.overall.w, 6);
      expect(section.shapes.some((s) => s.style === 'cut')).toBe(true);
      const ins = buildInstructions(d);
      const text = [...ins.machining.steps, ...ins.assembly.steps].map((s) => s.text).join(' ');
      expect(text).toContain(`${r1(d.opening.w)} × ${r1(d.opening.h)} mm`);
      if (d.louvre) expect(text).toContain(`${r1(d.louvre.length)} mm`);
      if (d.slot) expect(text).toContain(`${d.slot.total} through slots`);
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      expect(cutListCsv(d).split('\r\n').length).toBe(d.cutList.length + 2);
    }
  });
});

describe('validation', () => {
  it('rejects mitres with unequal stile and rail widths', () => {
    expect(errors(make({ joinery: 'mitre', railWidth: 35 })).map((e) => e.rule)).toContain('R07');
  });
  it('rejects a louvre that is too wide for the thickness', () => {
    expect(errors(make({ louvreWidthMode: 'manual', louvreWidth: 30 })).map((e) => e.rule)).toContain('R04');
  });
  it('rejects louvres packed too tightly', () => {
    expect(errors(make({ louvreCountMode: 'manual', louvreCount: 40 })).map((e) => e.rule)).toContain('R05');
  });
  it('rejects out-of-range and non-numeric input', () => {
    expect(errors(make({ openingWidth: 5 })).map((e) => e.rule)).toContain('R01');
    expect(errors(make({ thickness: Number.NaN })).map((e) => e.rule)).toContain('R01');
  });
  it('rejects stock that is too short, too narrow or too thin', () => {
    expect(errors(make({ stockLength: 300 })).map((e) => e.rule)).toContain('R11');
    expect(errors(make({ dividerWidth: 120, stockWidth: 90 })).map((e) => e.rule)).toContain('R11');
    expect(errors(make({ stockThickness: 15 })).map((e) => e.rule)).toContain('R11');
  });
  it('rejects a flush insert that leaves no ledge', () => {
    expect(errors(make({ mounting: 'flush', insertThickness: 18 })).map((e) => e.rule)).toContain('R10');
  });
  it('rejects a locating rebate wider than the frame allows', () => {
    expect(errors(make({ locatingRebate: true, overlap: 25 })).map((e) => e.rule)).toContain('R09');
  });
});

describe('louvre layout', () => {
  it('auto width fills the thickness less the setbacks', () => {
    const d = make();
    expect(d.louvre!.depthProj).toBeLessThanOrEqual(19 - 2);
    expect(d.louvre!.depthProj).toBeGreaterThan(19 - 2 - 0.5);
  });
  it('spaces louvres evenly at a pitch close to the target', () => {
    const d = make({ louvrePitch: 14 });
    const c = d.louvre!.centres[0];
    for (let i = 1; i < c.length; i++) expect(c[i] - c[i - 1]).toBeCloseTo(d.louvre!.pitch, 6);
    expect(Math.abs(d.louvre!.pitch - 14)).toBeLessThan(2);
  });
  it('honours a manual count', () => {
    const d = make({ louvreCountMode: 'manual', louvreCount: 6 });
    expect(d.louvre!.perCell).toBe(6);
    expect(d.parts.filter((p) => p.type === 'louvre').length).toBe(12);
  });
  it('reports slot open area exactly', () => {
    const d = make({ construction: 'slotted' });
    const s = d.slot!;
    expect(d.openArea.mm2).toBeCloseTo(s.total * ((s.length - s.width) * s.width + (Math.PI * s.width ** 2) / 4), 6);
  });
});

describe('issue fixes and related inputs', () => {
  const broken: Partial<Params>[] = [
    { joinery: 'mitre', railWidth: 35 },
    { louvreWidthMode: 'manual', louvreWidth: 30 },
    { louvreCountMode: 'manual', louvreCount: 40 },
    { louvrePitch: 5 },
    { openingWidth: 5 },
    { thickness: Number.NaN },
    { stockLength: 300 },
    { dividerWidth: 120, stockWidth: 90 },
    { stockThickness: 15 },
    { mounting: 'flush', insertThickness: 18 },
    { mounting: 'flush', ledgeWidth: 38 },
    { mounting: 'flush', locatingRebate: true, overlap: 40 },
    { mounting: 'flush', locatingRebate: true, rebateDepth: 12, ledgeWidth: 20 },
    { locatingRebate: true, overlap: 25 },
    { locatingRebate: true, overlap: 25, joinery: 'mitre' },
    { locatingRebate: true, rebateDepth: 17 },
    { housingDepth: 14, stileWidth: 16 },
    { sections: 3, sectionDirection: 'side', openingWidth: 400, dividerWidth: 12 },
    { joinery: 'stub-tenon', tenonLength: 30 },
    { dowelDiameter: 12, thickness: 14, stockThickness: 19 },
    { stileWidth: 85 },
    { sections: 6 },
    { sizeBy: 'overall', overallWidth: 100, overallHeight: 100, overlap: 60 },
    { construction: 'slotted', sections: 6, openingHeight: 120 },
    { sections: 2.5 },
  ];

  it('names at least one input for every issue', () => {
    for (const d of [...grid().map(computeDesign), ...broken.map(make)])
      for (const i of d.issues) expect(i.fields.length, i.message).toBeGreaterThan(0);
  });

  it('every offered fix clears the issue it belongs to', () => {
    let fixes = 0;
    for (const over of broken) {
      const d = make(over);
      expect(errors(d).length, JSON.stringify(over)).toBeGreaterThan(0);
      for (const issue of errors(d)) {
        if (!issue.fix) continue;
        fixes += 1;
        const after = computeDesign({ ...d.params, ...issue.fix.patch });
        expect(after.issues.map((i) => i.message), `${issue.fix.label} for ${JSON.stringify(over)}`).not.toContain(issue.message);
      }
    }
    expect(fixes).toBeGreaterThan(20);
  });

  it('repeated fixes always reach a valid design', () => {
    for (const over of broken) {
      let d = make(over);
      for (let step = 0; step < 8 && !d.ok; step++) {
        const next = errors(d).find((i) => i.fix);
        if (!next) break;
        d = computeDesign({ ...d.params, ...next.fix!.patch });
      }
      expect(d.ok, JSON.stringify(over) + ' -> ' + errors(d).map((e) => e.message).join(' | ')).toBe(true);
    }
  });
});
