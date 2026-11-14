import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PARAMS, computeDesign, cutListCsv, materialsCsv, partsCsv, r1, speciesOf, stockCsv } from '../engine';
import type { Design, Params } from '../engine';
import { Controls } from './Controls';
import { Viewer3D } from './Viewer3D';
import { CutListPanel, DrawingsPanel, InstructionsPanel, StockPanel } from './Panels';
import { Plan } from './Plan';

const STORE_KEY = 'sauna-vent-params-v1';
const TABS = [
  ['model', '3D model'],
  ['drawings', 'Drawings'],
  ['cut', 'Cut list'],
  ['stock', 'Stock layout'],
  ['steps', 'Instructions'],
  ['plan', 'Build plan'],
] as const;
type Tab = (typeof TABS)[number][0];

function loadParams(): Params {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = { ...DEFAULT_PARAMS, ...JSON.parse(raw) };
      if (computeDesign(p).ok) return p;
    }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PARAMS;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  // "saved" drives every document. "draft" is what the controls edit and the 3D view previews.
  const [saved, setSaved] = useState<Params>(loadParams);
  const [draft, setDraft] = useState<Params>(saved);
  // The tab is kept in the URL hash so a view can be linked to directly, e.g. #drawings.
  const [tab, setTabState] = useState<Tab>(() => {
    const h = location.hash.slice(1);
    return TABS.some(([id]) => id === h) ? (h as Tab) : 'model';
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    history.replaceState(null, '', t === 'model' ? location.pathname + location.search : `#${t}`);
  };
  const shown = useMemo(() => computeDesign(saved), [saved]);
  const draftDesign = useMemo(() => computeDesign(draft), [draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const lastValid = useRef<Design>(shown);
  if (draftDesign.ok) lastValid.current = draftDesign;

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      /* storage unavailable */
    }
  }, [saved]);

  const save = () => {
    if (draftDesign.ok) setSaved(draft);
  };

  const print = () => {
    setTab('plan');
    setTimeout(() => window.print(), 150);
  };
  const csv = (kind: string) => {
    const f = { cut: cutListCsv, parts: partsCsv, stock: stockCsv, materials: materialsCsv }[kind]!;
    download(`sauna-vent-${shown.id}-${kind}.csv`, f(shown));
  };

  return (
    <div className="app">
      <header className="top screen-only">
        <div className="brand">
          <h1>Sauna vent configurator</h1>
          <p>
            {r1(shown.overall.w)} × {r1(shown.overall.h)} × {r1(shown.overall.t)} mm · {speciesOf(shown.params.species).name} · <span className="mono">{shown.id}</span>
          </p>
        </div>
        <div className="actions">
          <details className="menu">
            <summary>Download CSV</summary>
            <div>
              <button onClick={() => csv('cut')}>Cut list</button>
              <button onClick={() => csv('parts')}>All parts</button>
              <button onClick={() => csv('stock')}>Stock layout</button>
              <button onClick={() => csv('materials')}>Materials</button>
            </div>
          </details>
          <button className="primary" onClick={print} disabled={dirty} title={dirty ? 'Save your changes first' : undefined}>
            Print plan / save PDF
          </button>
        </div>
      </header>

      <div className="body">
        <Controls params={draft} design={draftDesign} dirty={dirty} onChange={(patch) => setDraft((p) => ({ ...p, ...patch }))} onReset={() => setDraft(DEFAULT_PARAMS)} onSave={save} onDiscard={() => setDraft(saved)} onLoadPreset={setDraft} />
        <main className="main">
          <nav className="tabs screen-only" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className={'content' + (tab === 'model' ? ' fill' : '') + (tab === 'plan' ? ' plan-view' : '')}>
            {tab !== 'model' && dirty && (
              <p className="stale-note screen-only">
                This shows the last saved design ({shown.id}). Save your changes to update it.
              </p>
            )}
            {tab === 'model' && <Viewer3D design={lastValid.current} stale={!draftDesign.ok} />}
            {tab === 'drawings' && <DrawingsPanel d={shown} />}
            {tab === 'cut' && <CutListPanel d={shown} />}
            {tab === 'stock' && <StockPanel d={shown} />}
            {tab === 'steps' && <InstructionsPanel d={shown} />}
            {tab === 'plan' && <Plan d={shown} />}
          </div>
        </main>
      </div>
    </div>
  );
}
