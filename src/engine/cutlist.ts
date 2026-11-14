import type { CutRow, Part } from './types';

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Groups identical parts into lettered cut-list rows and writes the letter back onto each part.
 * Letters follow the fixed part order (stiles, rails, dividers, louvres, panel, surround).
 */
export function buildCutList(parts: Part[]): CutRow[] {
  const rows: CutRow[] = [];
  const byKey = new Map<string, CutRow>();
  for (const part of parts) {
    const key = [part.type, r1(part.length), r1(part.width), r1(part.thickness), part.note ?? ''].join('|');
    let row = byKey.get(key);
    if (!row) {
      row = {
        code: String.fromCharCode(65 + rows.length),
        type: part.type,
        name: part.name,
        qty: 0,
        length: r1(part.length),
        width: r1(part.width),
        thickness: r1(part.thickness),
        note: part.note ?? '',
        partIds: [],
      };
      byKey.set(key, row);
      rows.push(row);
    }
    row.qty += 1;
    row.partIds.push(part.id);
    part.code = row.code;
  }
  return rows;
}
