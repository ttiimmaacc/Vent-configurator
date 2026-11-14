import type { Design } from './types';
import { r1 } from './design';
import { speciesOf } from './params';

type Cell = string | number;

export function toCsv(rows: Cell[][]): string {
  const esc = (c: Cell) => {
    const s = String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function cutListCsv(d: Design): string {
  const sp = speciesOf(d.params.species).name;
  return toCsv([
    ['Design', 'Code', 'Part', 'Qty', 'Length mm', 'Width mm', 'Thickness mm', 'Timber', 'Note', 'Part IDs'],
    ...d.cutList.map((r) => [d.id, r.code, r.name, r.qty, r.length, r.width, r.thickness, sp, r.note, r.partIds.join(' ')]),
  ]);
}

export function partsCsv(d: Design): string {
  return toCsv([
    ['Design', 'Part ID', 'Code', 'Part', 'Length mm', 'Width mm', 'Thickness mm', 'Note'],
    ...d.parts.map((p) => [d.id, p.id, p.code, p.name, r1(p.length), r1(p.width), r1(p.thickness), p.note ?? '']),
  ]);
}

export function stockCsv(d: Design): string {
  const rows: Cell[][] = [['Design', 'Board', 'Rip', 'Rip width mm', 'Rip offset mm', 'Cut', 'Code', 'Start mm', 'Length mm']];
  for (const b of d.stock?.boards ?? [])
    b.rips.forEach((rip, ri) =>
      rip.cuts.forEach((c, ci) => rows.push([d.id, b.index, ri + 1, rip.ripWidth, r1(rip.yOffset), ci + 1, c.code, r1(c.offset), r1(c.length)])),
    );
  return toCsv(rows);
}

export function materialsCsv(d: Design): string {
  const s = d.stock;
  const sp = speciesOf(d.params.species).name;
  const rows: Cell[][] = [['Design', 'Item', 'Qty', 'Unit', 'Detail']];
  if (s) {
    rows.push([d.id, `${sp} board`, s.boards.length, 'boards', `${s.stockThickness} × ${s.stockWidth} × ${s.stockLength} mm`]);
    rows.push([d.id, `${sp} total length`, r1(s.linearMetres), 'm', `${s.stockThickness} × ${s.stockWidth} mm`]);
    rows.push([d.id, 'Stock volume', Math.round(s.stockVolumeM3 * 1e5) / 1e5, 'm3', '']);
    rows.push([d.id, 'Yield', r1(s.yieldPct), '%', `kerf ${s.kerf} mm, end trim ${s.endTrim} mm`]);
  }
  if (d.dowels.total) rows.push([d.id, 'Dowels', d.dowels.total, 'pcs', `ø${d.dowels.diameter} mm`]);
  for (const st of d.stations) rows.push([d.id, `${st.member} stations from ${st.from}`, st.values.length, 'centres', st.values.join(' ')]);
  return toCsv(rows);
}
