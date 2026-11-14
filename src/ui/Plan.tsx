import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Design } from '../engine';
import { allDrawings, buildInstructions, r1, speciesOf } from '../engine';
import type { InstructionSet } from '../engine';
import { DrawingSvg } from './DrawingSvg';
import './plan.css';

const MAX_RIP_ROWS = 16;

function Page({ d, section, page, date, cover, children }: { d: Design; section: string; page: number; date: string; cover?: boolean; children: ReactNode }) {
  const sp = speciesOf(d.params.species);
  const kind = d.params.construction === 'louvred' ? 'louvred frame' : 'slotted panel';
  return (
    <section className={'page' + (cover ? ' cover' : '')}>
      <div className="run">
        <span>
          Sauna vent {d.id} · {section}
        </span>
        <span>
          {sp.short} · {kind} · {date}
        </span>
      </div>
      {children}
      <div className="foot">
        <span>
          Sauna vent {d.id} · {section}
        </span>
        <span className="ink">{page}</span>
      </div>
    </section>
  );
}

const Meta = ({ items }: { items: [string, string][] }) => (
  <div className="meta">
    {items.map(([k, v]) => (
      <div key={k}>
        <div className="label">{k}</div>
        <div className="value">{v}</div>
      </div>
    ))}
  </div>
);

function Steps({ set, start }: { set: InstructionSet; start: number }) {
  return (
    <div className="blk">
      <div className="steps-grid">
        {set.steps.map((s, i) => (
          <div className="step" key={i}>
            <div className="sno">{start + i}</div>
            <div>{s.text}</div>
            <div className="jig">{s.ref && <span className="pill">{s.ref}</span>}</div>
          </div>
        ))}
      </div>
      <div className="check-row">
        <div>
          <span className="pill">Check</span>
        </div>
        <div>{set.check}</div>
      </div>
    </div>
  );
}

export function Plan({ d }: { d: Design }) {
  const [front, section, detail] = useMemo(() => allDrawings(d), [d]);
  const ins = useMemo(() => buildInstructions(d), [d]);
  const sp = speciesOf(d.params.species);
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const s = d.stock!;
  const size = `${r1(d.overall.w)} × ${r1(d.overall.h)} × ${r1(d.overall.t)}`;
  const mounting = d.params.mounting === 'flush' ? 'Flush, in surround' : 'Surface';
  const count = d.louvre ? `${d.louvre.total} louvres` : `${d.slot!.total} slots`;
  const rips = s.boards.flatMap((b) => b.rips.map((rip, i) => ({ board: b.index, first: i === 0, rip })));

  return (
    <div className="plan">
      <Page d={d} section="Cover" page={1} date={date} cover>
        <h1 className="cover-title">Sauna vent</h1>
        <div className="sub">{size} mm</div>
        <Meta
          items={[
            ['Wall opening', `${r1(d.opening.w)} × ${r1(d.opening.h)}`],
            ['Mounting', mounting],
            ['Sections', String(d.cells.length)],
            [d.louvre ? 'Louvres' : 'Slots', String(d.louvre ? d.louvre.total : d.slot!.total)],
            ['Timber', sp.short],
          ]}
        />
        <div className="cover-drawing">
          <DrawingSvg drawing={front} width={520} height={620} maxHeight="150mm" />
        </div>
        <div className="strip">
          <div>
            <div className="label">Boards</div>
            <div className="value">
              {s.boards.length} × {s.stockThickness} × {s.stockWidth} × {s.stockLength}
            </div>
          </div>
          <div>
            <div className="label">Parts</div>
            <div className="value">
              {d.parts.length} in {d.cutList.length} groups
            </div>
          </div>
          <div>
            <div className="label">Open area, geometric</div>
            <div className="value">{Math.round(d.openArea.mm2).toLocaleString('en')} mm²</div>
          </div>
          <div>
            <div className="label">Design</div>
            <div className="value">{d.id}</div>
          </div>
        </div>
        <p className="note">All dimensions in millimetres. Open area is geometry only and is not an airflow rating.</p>
      </Page>

      <Page d={d} section="Drawings" page={2} date={date}>
        <h2 className="title">Drawings</h2>
        <Meta items={[['Overall', size], ['Wall opening', `${r1(d.opening.w)} × ${r1(d.opening.h)}`], ['Overlap', `${d.params.overlap} each side`]]} />
        <div className="panels two">
          {[front, section].map((dr, i) => (
            <div key={dr.key} className="dpanel">
              <div className="phead">
                {i + 1} {dr.title}
              </div>
              <div className="psub">{dr.subtitle}</div>
              <DrawingSvg drawing={dr} width={i === 0 ? 420 : 280} height={520} maxHeight="118mm" />
            </div>
          ))}
        </div>
        <div className="panels two">
          <div className="dpanel">
            <div className="phead">3 {detail.title}</div>
            <div className="psub">{detail.subtitle}</div>
            <DrawingSvg drawing={detail} width={300} height={260} maxHeight="62mm" />
          </div>
          <div className="dpanel">
            <div className="phead">Key sizes</div>
            <div className="psub">From the calculation engine</div>
            <div className="kv">
              <span>Stile</span>
              <span>{d.params.stileWidth} wide</span>
              <span>Rail</span>
              <span>{d.params.railWidth} wide</span>
              {d.cells.length > 1 && (
                <>
                  <span>Divider</span>
                  <span>{d.params.dividerWidth} wide</span>
                </>
              )}
              <span>Section</span>
              <span>
                {r1(d.cells[0].x1 - d.cells[0].x0)} × {r1(d.cells[0].y1 - d.cells[0].y0)} clear
              </span>
              {d.louvre && (
                <>
                  <span>Louvre</span>
                  <span>
                    {r1(d.louvre.width)} × {r1(d.louvre.thickness)} × {r1(d.louvre.length)} <i>· {d.louvre.angle}°</i>
                  </span>
                  <span>Pitch</span>
                  <span>
                    {r1(d.louvre.pitch)} <i>· gap {r1(d.louvre.throat)}</i>
                  </span>
                  <span>Housing</span>
                  <span>
                    {r1(d.louvre.thickness)} × {r1(d.louvre.width)} <i>· {d.params.housingDepth} deep</i>
                  </span>
                </>
              )}
              {d.slot && (
                <>
                  <span>Slot</span>
                  <span>
                    {r1(d.slot.length)} × {r1(d.slot.width)} <i>· ×{d.slot.perCell} per section</i>
                  </span>
                  <span>Pitch</span>
                  <span>{r1(d.slot.pitch)}</span>
                </>
              )}
              {d.surround && (
                <>
                  <span>Insert</span>
                  <span>
                    {r1(d.grille.w)} × {r1(d.grille.h)} × {r1(d.grille.t)}
                  </span>
                  <span>Pocket</span>
                  <span>
                    {r1(d.surround.pocket.w)} × {r1(d.surround.pocket.h)} <i>· ledge {d.surround.ledgeWidth}</i>
                  </span>
                </>
              )}
              {d.rebate && (
                <>
                  <span>Rebate</span>
                  <span>
                    {r1(d.rebate.width)} × {r1(d.rebate.depth)} <i>· back, all round</i>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </Page>

      <Page d={d} section="Materials" page={3} date={date}>
        <h2 className="title">Materials and cut list</h2>
        <Meta items={[['Boards', `${s.boards.length}`], ['Length', `${r1(s.linearMetres)} m`], ['Yield', `${r1(s.yieldPct)}%`], ['Kerf', `${s.kerf}`]]} />
        <div className="ghead">Parts</div>
        <table className="ptable">
          <thead>
            <tr>
              <th style={{ width: '9mm' }}>Code</th>
              <th>Part</th>
              <th className="n">Qty</th>
              <th className="n">Length</th>
              <th className="n">Width</th>
              <th className="n">Thick</th>
              <th style={{ width: '70mm' }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {d.cutList.map((r) => (
              <tr key={r.code}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td className="n">{r.qty}</td>
                <td className="n">{r.length}</td>
                <td className="n">{r.width}</td>
                <td className="n">{r.thickness}</td>
                <td className="grey">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mat">
          {sp.name} {s.stockThickness} × {s.stockWidth}
        </div>
        <div className="riprows">
          {rips.slice(0, MAX_RIP_ROWS).map(({ board, first, rip }, i) => {
            const groups = new Map<string, number>();
            for (const c of rip.cuts) groups.set(`${c.code} ${r1(c.length)}`, (groups.get(`${c.code} ${r1(c.length)}`) ?? 0) + 1);
            return (
              <div className="rip" key={i}>
                <div className="bno">{first ? board : ''}</div>
                <div className="bar">
                  {rip.cuts.map((c, k) => {
                    const pct = (c.length / s.stockLength) * 100;
                    return (
                      <span key={k} style={{ left: `${(c.offset / s.stockLength) * 100}%`, width: `calc(${pct}% - 1px)` }}>
                        {pct > 3.2 ? c.code : ''}
                      </span>
                    );
                  })}
                </div>
                <div className="ptext">
                  <i>{rip.ripWidth} wide · </i>
                  {Array.from(groups, ([k, n], gi) => (
                    <span key={k}>
                      {gi > 0 ? ' · ' : ''}
                      {k}
                      {n > 1 && <i> ×{n}</i>}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {rips.length > MAX_RIP_ROWS && <p className="note">{rips.length - MAX_RIP_ROWS} more rips are listed in the stock layout CSV.</p>}
        <div className="need">
          <span>Need</span>
          <span>
            {s.boards.length} × {s.stockLength} <i>· {r1(s.linearMetres)} m · rip to width first, then crosscut · {s.endTrim} end trim per board</i>
          </span>
        </div>
      </Page>

      <Page d={d} section="Machining" page={4} date={date}>
        <h2 className="title">Machining</h2>
        <Meta items={[['Steps', `1 to ${ins.machining.steps.length}`], ['Parts', `${d.parts.length}`], ['Count', count]]} />
        <h3 className="sect">Tools and jigs</h3>
        <p className="para">{ins.tools.join(' · ')}</p>
        <Steps set={ins.machining} start={1} />
        {d.stations.map((st) => (
          <div className="stations" key={st.member}>
            <div className="label">
              {st.member} stations · centre of each {d.louvre ? 'housing' : 'slot'} from the {st.from}
            </div>
            <div className="svals">{st.values.join(' · ')}</div>
          </div>
        ))}
      </Page>

      <Page d={d} section="Assembly" page={5} date={date}>
        <h2 className="title">Assembly</h2>
        <Meta items={[['Steps', `${ins.machining.steps.length + 1} to ${ins.machining.steps.length + ins.assembly.steps.length}`], ['Dowels', `${d.dowels.total}`], ['Overall', size]]} />
        <div className="blk list">
          <div className="label">Hardware</div>
          <div>
            {ins.hardware.map((h) => (
              <div className="hw" key={h.name}>
                <span className="q">{h.qty}</span>
                <span>
                  {h.name} <i>· {h.note}</i>
                </span>
              </div>
            ))}
          </div>
        </div>
        <Steps set={ins.assembly} start={ins.machining.steps.length + 1} />
        <h3 className="sect">Inspected</h3>
        <div className="ticks">
          {['Overall size', 'Diagonals match', d.louvre ? 'Louvres seated' : 'Slots clean', 'Edges eased', 'Fits the opening'].map((t) => (
            <div key={t}>
              <span className="tick" />
              {t}
            </div>
          ))}
        </div>
        <div className="sign">
          <div>
            <div className="line" />
            <div className="label">Name</div>
          </div>
          <div>
            <div className="line" />
            <div className="label">Date</div>
          </div>
        </div>
      </Page>
    </div>
  );
}
