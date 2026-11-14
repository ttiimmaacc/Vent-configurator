import { useId } from 'react';
import type { DDim, Drawing, Pt } from '../engine';
import { r1 } from '../engine';

const LEVEL = 24;
const PAD = 12;
const FONT = 9;

/** Renders an engine drawing to SVG. Geometry is scaled to fit; text and dimension lines keep a fixed size. */
export function DrawingSvg({ drawing, width = 520, height = 520, maxHeight }: { drawing: Drawing; width?: number; height?: number; maxHeight?: string }) {
  const clipId = useId();
  const { bounds: b, dims } = drawing;
  const lv = (side: DDim['side']) => Math.max(0, ...dims.filter((d) => d.side === side).map((d) => d.level));
  const m = {
    left: PAD + lv('left') * LEVEL,
    right: PAD + lv('right') * LEVEL,
    top: PAD + lv('top') * LEVEL,
    bottom: PAD + lv('bottom') * LEVEL,
  };
  const bw = b.x1 - b.x0;
  const bh = b.y1 - b.y0;
  const s = Math.min((width - m.left - m.right) / bw, (height - m.top - m.bottom) / bh);
  const vw = m.left + bw * s + m.right;
  const vh = m.top + bh * s + m.bottom;
  const tx = (x: number) => m.left + (x - b.x0) * s;
  const ty = (y: number) => m.top + (b.y1 - y) * s;
  const path = (pts: Pt[], closed: boolean) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${tx(x).toFixed(2)} ${ty(y).toFixed(2)}`).join(' ') + (closed ? ' Z' : '');

  const style = {
    solid: { fill: '#fff', stroke: '#000', strokeWidth: 0.9 },
    cut: { fill: '#dcdcdc', stroke: '#000', strokeWidth: 0.9 },
    thin: { fill: 'none', stroke: '#8a8a8a', strokeWidth: 0.6 },
    dashed: { fill: 'none', stroke: '#555', strokeWidth: 0.7, strokeDasharray: '4 3' },
  } as const;

  const tick = (x: number, y: number, key: string) => <line key={key} x1={x - 2.5} y1={y + 2.5} x2={x + 2.5} y2={y - 2.5} stroke="#000" strokeWidth={0.9} />;

  const dimEls = dims.map((d, i) => {
    const text = d.text ?? String(r1(Math.abs(d.b - d.a)));
    const estW = text.length * FONT * 0.52 + 4;
    if (d.side === 'bottom' || d.side === 'top') {
      const sign = d.side === 'bottom' ? 1 : -1;
      const edge = d.side === 'bottom' ? ty(b.y0) : ty(b.y1);
      const y = edge + sign * (10 + (d.level - 1) * LEVEL);
      const xa = tx(d.a);
      const xb = tx(d.b);
      const small = Math.abs(xb - xa) < estW;
      const textY = small ? y + sign * 9 + (sign > 0 ? 2 : 0) : y - 3;
      return (
        <g key={i}>
          <line x1={xa} y1={edge + sign * 3} x2={xa} y2={y + sign * 4} stroke="#8a8a8a" strokeWidth={0.5} />
          <line x1={xb} y1={edge + sign * 3} x2={xb} y2={y + sign * 4} stroke="#8a8a8a" strokeWidth={0.5} />
          <line x1={xa} y1={y} x2={xb} y2={y} stroke="#000" strokeWidth={0.5} />
          {tick(xa, y, 'a')}
          {tick(xb, y, 'b')}
          <text x={(xa + xb) / 2} y={textY} fontSize={FONT} textAnchor="middle" fill="#000">
            {text}
          </text>
        </g>
      );
    }
    const sign = d.side === 'right' ? 1 : -1;
    const edge = d.side === 'right' ? tx(b.x1) : tx(b.x0);
    const x = edge + sign * (10 + (d.level - 1) * LEVEL);
    const ya = ty(d.a);
    const yb = ty(d.b);
    const small = Math.abs(yb - ya) < estW;
    // Rotated text sits to the left of its baseline, so right-hand dimensions need a full line of offset.
    const textX = sign > 0 ? x + (small ? 20 : 11) : x - (small ? 9 : 3);
    const cy = (ya + yb) / 2;
    return (
      <g key={i}>
        <line x1={edge + sign * 3} y1={ya} x2={x + sign * 4} y2={ya} stroke="#8a8a8a" strokeWidth={0.5} />
        <line x1={edge + sign * 3} y1={yb} x2={x + sign * 4} y2={yb} stroke="#8a8a8a" strokeWidth={0.5} />
        <line x1={x} y1={ya} x2={x} y2={yb} stroke="#000" strokeWidth={0.5} />
        {tick(x, ya, 'a')}
        {tick(x, yb, 'b')}
        <text x={textX} y={cy} fontSize={FONT} textAnchor="middle" fill="#000" transform={`rotate(-90 ${textX} ${cy})`}>
          {text}
        </text>
      </g>
    );
  });

  return (
    <svg
      viewBox={`0 0 ${vw.toFixed(1)} ${vh.toFixed(1)}`}
      style={{ display: 'block', maxWidth: '100%', width: 'auto', height: 'auto', maxHeight: maxHeight ?? 'none', aspectRatio: `${vw} / ${vh}` }}
      width={vw}
      height={vh}
      role="img"
      aria-label={drawing.title}
    >
      <clipPath id={clipId}>
        <rect x={tx(b.x0) - 0.5} y={ty(b.y1) - 0.5} width={bw * s + 1} height={bh * s + 1} />
      </clipPath>
      <g clipPath={`url(#${clipId})`} strokeLinejoin="round">
        {drawing.shapes.map((sh, i) => (
          <path key={i} d={[path(sh.pts, sh.closed), ...(sh.holes ?? []).map((h) => path(h, true))].join(' ')} fillRule="evenodd" {...style[sh.style]} fill={sh.closed ? style[sh.style].fill : 'none'} />
        ))}
      </g>
      {dimEls}
    </svg>
  );
}
