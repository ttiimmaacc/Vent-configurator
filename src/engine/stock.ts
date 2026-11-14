import type { Issue, Params, Part, StockBoard, StockPlan, StockRip } from './types';

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Two-stage guillotine layout.
 * 1. Parts of the same rip width are packed end to end into full-length rips
 *    (first-fit decreasing). Each part costs its length plus one kerf.
 * 2. Rips are packed across the board width (first-fit decreasing). Each rip
 *    costs its width plus one kerf.
 * The end trim is taken once from the start of every board.
 */
export function planStock(parts: Part[], p: Params): { plan: StockPlan | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const usable = p.stockLength - p.endTrim;
  const items = parts.flatMap((part) => part.stock.map((s) => ({ code: part.code, length: s.length, ripWidth: r1(s.ripWidth) })));

  for (const it of items) {
    if (it.ripWidth > p.stockWidth + 1e-6) {
      issues.push({ level: 'error', rule: 'R11', message: `Part ${it.code} needs a ${it.ripWidth} mm wide rip but the board is ${p.stockWidth} mm wide.`, fields: ['stockWidth'], fix: { label: `Set board width to ${Math.ceil(it.ripWidth)} mm`, patch: { stockWidth: Math.ceil(it.ripWidth) } } });
      return { plan: null, issues };
    }
    if (it.length > usable + 1e-6) {
      issues.push({ level: 'error', rule: 'R11', message: `Part ${it.code} is ${r1(it.length)} mm long but only ${r1(usable)} mm of each board is usable.`, fields: ['stockLength', 'endTrim'], fix: { label: `Set board length to ${Math.ceil((it.length + p.endTrim) / 50) * 50} mm`, patch: { stockLength: Math.ceil((it.length + p.endTrim) / 50) * 50 } } });
      return { plan: null, issues };
    }
  }

  // Stage 1: lengths into rips.
  const widths = Array.from(new Set(items.map((i) => i.ripWidth))).sort((a, b) => b - a);
  const rips: StockRip[] = [];
  for (const w of widths) {
    const group = items.filter((i) => i.ripWidth === w).sort((a, b) => b.length - a.length || a.code.localeCompare(b.code));
    const open: { rip: StockRip; used: number }[] = [];
    for (const it of group) {
      let slot = open.find((o) => o.used + it.length <= usable + 1e-6);
      if (!slot) {
        slot = { rip: { ripWidth: w, yOffset: 0, cuts: [], offcut: 0 }, used: 0 };
        open.push(slot);
      }
      slot.rip.cuts.push({ code: it.code, offset: p.endTrim + slot.used, length: it.length });
      slot.used += it.length + p.kerf;
    }
    for (const o of open) {
      o.rip.offcut = Math.max(0, r1(usable - o.used));
      rips.push(o.rip);
    }
  }

  // Stage 2: rips across boards.
  const boards: (StockBoard & { used: number })[] = [];
  for (const rip of rips) {
    let board = boards.find((b) => b.used + rip.ripWidth <= p.stockWidth + 1e-6);
    if (!board) {
      board = { index: boards.length + 1, rips: [], widthOffcut: 0, used: 0 };
      boards.push(board);
    }
    rip.yOffset = board.used;
    board.rips.push(rip);
    board.used += rip.ripWidth + p.kerf;
  }
  for (const b of boards) b.widthOffcut = Math.max(0, r1(p.stockWidth - b.used));

  const partsAreaMm2 = items.reduce((s, i) => s + i.length * i.ripWidth, 0);
  const boardArea = boards.length * p.stockLength * p.stockWidth;
  return {
    plan: {
      boards: boards.map(({ used: _used, ...b }) => b),
      stockThickness: p.stockThickness,
      stockWidth: p.stockWidth,
      stockLength: p.stockLength,
      kerf: p.kerf,
      endTrim: p.endTrim,
      linearMetres: (boards.length * p.stockLength) / 1000,
      stockVolumeM3: (boardArea * p.stockThickness) / 1e9,
      partsAreaMm2,
      yieldPct: boardArea > 0 ? (partsAreaMm2 / boardArea) * 100 : 0,
    },
    issues,
  };
}
