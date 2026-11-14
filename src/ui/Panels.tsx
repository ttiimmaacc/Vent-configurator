import { useMemo } from 'react';
import type { Design } from '../engine';
import { RULES, allDrawings, buildInstructions, r1, speciesOf } from '../engine';
import { DrawingSvg } from './DrawingSvg';

export function DrawingsPanel({ d }: { d: Design }) {
  const drawings = useMemo(() => allDrawings(d), [d]);
  return (
    <div className="panel drawings-panel">
      {drawings.map((dr) => (
        <figure key={dr.key} className="drawing-card">
          <figcaption>
            <strong>{dr.title}</strong>
            <span>{dr.subtitle}</span>
          </figcaption>
          <DrawingSvg drawing={dr} width={dr.key === 'front' ? 520 : 380} height={dr.key === 'detail' ? 360 : 560} maxHeight="68vh" />
        </figure>
      ))}
      <p className="muted small">All dimensions in millimetres. Drawings are generated from the same parts as the 3D model and the cut list.</p>
    </div>
  );
}

export function CutListPanel({ d }: { d: Design }) {
  const sp = speciesOf(d.params.species);
  return (
    <div className="panel">
      <h2>Cut list</h2>
      <p className="muted">
        {d.parts.length} parts in {d.cutList.length} groups · {sp.name} · finished sizes, grain along the length
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Part</th>
              <th className="n">Qty</th>
              <th className="n">Length</th>
              <th className="n">Width</th>
              <th className="n">Thick</th>
              <th>Note</th>
              <th>Part IDs</th>
            </tr>
          </thead>
          <tbody>
            {d.cutList.map((r) => (
              <tr key={r.code}>
                <td>
                  <b>{r.code}</b>
                </td>
                <td>{r.name}</td>
                <td className="n">{r.qty}</td>
                <td className="n">{r.length}</td>
                <td className="n">{r.width}</td>
                <td className="n">{r.thickness}</td>
                <td className="muted">{r.note}</td>
                <td className="mono small">{r.partIds.length > 4 ? `${r.partIds[0]} … ${r.partIds[r.partIds.length - 1]}` : r.partIds.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Summary</h2>
      <dl className="facts">
        <div>
          <dt>Overall</dt>
          <dd>
            {r1(d.overall.w)} × {r1(d.overall.h)} × {r1(d.overall.t)} mm
          </dd>
        </div>
        <div>
          <dt>Wall opening</dt>
          <dd>
            {r1(d.opening.w)} × {r1(d.opening.h)} mm
          </dd>
        </div>
        {d.surround && (
          <div>
            <dt>Insert</dt>
            <dd>
              {r1(d.grille.w)} × {r1(d.grille.h)} × {r1(d.grille.t)} mm
            </dd>
          </div>
        )}
        {d.louvre && (
          <div>
            <dt>Louvres</dt>
            <dd>
              {d.louvre.total} at {r1(d.louvre.width)} × {r1(d.louvre.thickness)} mm, {d.louvre.angle}°, {r1(d.louvre.pitch)} mm pitch, {r1(d.louvre.throat)} mm gap
            </dd>
          </div>
        )}
        {d.slot && (
          <div>
            <dt>Slots</dt>
            <dd>
              {d.slot.total} at {r1(d.slot.length)} × {r1(d.slot.width)} mm, {r1(d.slot.pitch)} mm pitch
            </dd>
          </div>
        )}
        <div>
          <dt>Geometric open area</dt>
          <dd>
            {Math.round(d.openArea.mm2).toLocaleString('en')} mm² · {r1(d.openArea.pctOfFace)}% of the face
            <span className="muted small block">{d.openArea.basis}. This is geometry only, not an airflow rating.</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function StockPanel({ d }: { d: Design }) {
  const s = d.stock;
  if (!s) return <div className="panel">No stock layout.</div>;
  const sp = speciesOf(d.params.species);
  const VW = 1000;
  const sx = VW / s.stockLength;
  const sy = Math.min(1.6, 150 / s.stockWidth);
  return (
    <div className="panel">
      <h2>Timber</h2>
      <dl className="facts">
        <div>
          <dt>Boards</dt>
          <dd>
            {s.boards.length} × {sp.name} {s.stockThickness} × {s.stockWidth} × {s.stockLength} mm
          </dd>
        </div>
        <div>
          <dt>Total length</dt>
          <dd>{r1(s.linearMetres)} m</dd>
        </div>
        <div>
          <dt>Volume</dt>
          <dd>{(s.stockVolumeM3 * 1000).toFixed(2)} litres ({s.stockVolumeM3.toFixed(4)} m³)</dd>
        </div>
        <div>
          <dt>Yield</dt>
          <dd>
            {r1(s.yieldPct)}% of the board area becomes parts
            <span className="muted small block">
              Saw kerf {s.kerf} mm on every cut and rip, {s.endTrim} mm trimmed from the start of each board.
            </span>
          </dd>
        </div>
      </dl>
      <h2>Stock layout</h2>
      <p className="muted">Rip to width first, then crosscut to length. Board width is drawn enlarged so narrow rips stay readable.</p>
      {s.boards.map((b) => (
        <div key={b.index} className="board">
          <div className="board-title">Board {b.index}</div>
          <svg viewBox={`0 0 ${VW} ${s.stockWidth * sy}`} className="board-svg" role="img" aria-label={`Board ${b.index} layout`}>
            <rect x={0} y={0} width={VW} height={s.stockWidth * sy} fill="#f6f4ef" stroke="#8b8478" strokeWidth={1} />
            {s.endTrim > 0 && <rect x={0} y={0} width={s.endTrim * sx} height={s.stockWidth * sy} fill="#cfc9bd" />}
            {b.rips.map((rip, ri) =>
              rip.cuts.map((c, ci) => {
                const w = c.length * sx;
                const h = rip.ripWidth * sy;
                return (
                  <g key={`${ri}-${ci}`}>
                    <rect x={c.offset * sx} y={rip.yOffset * sy} width={w} height={h} fill="#e3c9a0" stroke="#5a4a36" strokeWidth={0.7} />
                    {w > 16 && h > 9 && (
                      <text x={c.offset * sx + w / 2} y={rip.yOffset * sy + h / 2 + 3.5} fontSize={Math.min(11, h - 1)} textAnchor="middle" fill="#2a2118">
                        {c.code}
                        {w > 60 ? ` ${r1(c.length)}` : ''}
                      </text>
                    )}
                  </g>
                );
              }),
            )}
          </svg>
          <ul className="rips">
            {b.rips.map((rip, ri) => {
              const groups = new Map<string, number>();
              for (const c of rip.cuts) groups.set(`${c.code} ${r1(c.length)}`, (groups.get(`${c.code} ${r1(c.length)}`) ?? 0) + 1);
              return (
                <li key={ri}>
                  <span className="mono">Rip {ri + 1}</span> {rip.ripWidth} mm wide ·{' '}
                  {Array.from(groups, ([k, n]) => `${k}${n > 1 ? ` ×${n}` : ''}`).join(' · ')} <span className="muted">· offcut {rip.offcut} mm</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function InstructionsPanel({ d }: { d: Design }) {
  const ins = useMemo(() => buildInstructions(d), [d]);
  let n = 0;
  return (
    <div className="panel instructions">
      <h2>Tools and jigs</h2>
      <p>{ins.tools.join(' · ')}</p>
      <h2>Hardware</h2>
      <ul className="plain">
        {ins.hardware.map((h) => (
          <li key={h.name}>
            {h.qty && <b>{h.qty} × </b>}
            {h.name} <span className="muted">· {h.note}</span>
          </li>
        ))}
      </ul>
      {[ins.machining, ins.assembly].map((set) => (
        <section key={set.title}>
          <h2>{set.title}</h2>
          <ol className="steps">
            {set.steps.map((s) => {
              n += 1;
              return (
                <li key={n} value={n}>
                  <span>{s.text}</span>
                  {s.ref && <em className="pill">{s.ref}</em>}
                </li>
              );
            })}
          </ol>
          <p className="check">
            <em className="pill">Check</em> {set.check}
          </p>
        </section>
      ))}
      {d.stations.map((st) => (
        <section key={st.member}>
          <h2>
            {st.member} stations
          </h2>
          <p className="muted">
            Centre of each {d.louvre ? 'housing' : 'slot'}, in mm from the {st.from}.
          </p>
          <p className="stations mono">{st.values.join(' · ')}</p>
        </section>
      ))}
      <section>
        <h2>Construction rules used</h2>
        <ul className="plain small">
          <li>Louvres are cut {RULES.LOUVRE_END_FLOAT} mm short of the housing bottom at each end.</li>
          <li>At least {RULES.MIN_WALL} mm of timber is kept beside every housing, rebate and ledge.</li>
          <li>Neighbouring louvres keep at least {RULES.MIN_THROAT} mm of gap, measured square to their faces.</li>
          <li>A flush insert leaves a ledge at least {RULES.MIN_LEDGE_THICKNESS} mm thick.</li>
          <li>Louvre strips are ripped {RULES.LOUVRE_RIP_ALLOWANCE} mm over thickness for planing.</li>
          <li>
            Glued-up panel blanks get {RULES.PANEL_LENGTH_ALLOWANCE} mm extra length and {RULES.PANEL_WIDTH_ALLOWANCE} mm extra width for trimming.
          </li>
          <li>Two dowels per joint when the rail is at least four dowel diameters wide, otherwise one.</li>
        </ul>
      </section>
    </div>
  );
}
