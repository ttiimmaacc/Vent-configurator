import { useEffect, useState } from 'react';
import type { Design } from '../engine';
import { r1 } from '../engine';
import { DEFAULT_AR, arSupported, viewInAr } from './ar';
import type { ArOptions } from './ar';

const KEY = 'sauna-vent-ar-v1';

function loadOptions(): ArOptions {
  try {
    return { ...DEFAULT_AR, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_AR;
  }
}

/** Explains what the camera step will ask for before handing over to Apple's AR viewer, which gives almost no guidance itself. */
export function ArSheet({ design, onClose }: { design: Design; onClose: () => void }) {
  const [opts, setOpts] = useState<ArOptions>(loadOptions);
  const [heightText, setHeightText] = useState(String(opts.centreHeight));
  const [state, setState] = useState<'idle' | 'busy' | 'downloaded' | 'failed'>('idle');
  const supported = arSupported();
  const minHeight = Math.ceil(design.overall.h / 2);
  const height = Number(heightText);
  const heightOk = opts.mode === 'wall' || (Number.isFinite(height) && height >= minHeight && height <= 3000);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (patch: Partial<ArOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const open = async () => {
    const final = { ...opts, centreHeight: opts.mode === 'floor' ? height : opts.centreHeight };
    try {
      localStorage.setItem(KEY, JSON.stringify(final));
    } catch {
      /* storage unavailable */
    }
    setState('busy');
    try {
      setState((await viewInAr(design, final)) === 'ar' ? 'idle' : 'downloaded');
    } catch {
      setState('failed');
    }
  };

  const floor = opts.mode === 'floor';
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ar-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ar-title">View in your space</h2>
        <p className="muted">
          Shows the {r1(design.overall.w)} × {r1(design.overall.h)} mm vent at real size through the camera.
        </p>

        <fieldset>
          <legend>How to place it</legend>
          <label className="choice">
            <input type="radio" name="ar-mode" checked={floor} onChange={() => set({ mode: 'floor' })} />
            <span>
              <b>Set the height, then slide it to the wall</b>
              <small>Quickest. The camera only needs to find the floor, and the height is exact.</small>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="ar-mode" checked={!floor} onChange={() => set({ mode: 'wall' })} />
            <span>
              <b>Stick it to the wall</b>
              <small>The camera has to find the wall first. Plain, evenly lit walls can take a while or fail.</small>
            </span>
          </label>
        </fieldset>

        {floor && (
          <div className="sheet-field">
            <label htmlFor="ar-height">Centre of the vent above the floor</label>
            <div className={'num' + (heightOk ? '' : ' bad')}>
              <input id="ar-height" type="number" inputMode="decimal" min={minHeight} max={3000} step={10} value={heightText} onChange={(e) => setHeightText(e.target.value)} />
              <span>mm</span>
            </div>
            {!heightOk && <p className="hint bad">Enter a height between {minHeight} and 3000 mm.</p>}
          </div>
        )}

        <label className="choice">
          <input type="checkbox" checked={opts.guides} onChange={(e) => set({ guides: e.target.checked })} />
          <span>
            <b>Show red alignment marks</b>
            <small>Centre lines around the vent{floor ? ', a line on the floor for the wall and a post showing the height' : ''}.</small>
          </span>
        </label>

        <div className="sheet-steps">
          <h3>What to do in the camera</h3>
          {floor ? (
            <ol>
              <li>Stand about 2 m back from the wall and point the phone at the floor just in front of it.</li>
              <li>When it says “Move iPhone”, sweep it slowly left and right across the floor. It is finding the floor, not scanning the room. This takes a few seconds.</li>
              <li>The vent appears, floating at your height. Drag it with one finger until the red floor line sits where the wall meets the floor.</li>
              <li>Turn it with two fingers until the red line runs along the wall. That is the spot.</li>
            </ol>
          ) : (
            <ol>
              <li>Stand about 1.5 m from the wall, facing it square on.</li>
              <li>When it says “Move iPhone”, sweep it slowly side to side across the wall. It is finding the wall surface, not scanning the room. Include a corner, skirting or anything with detail.</li>
              <li>The vent appears on the wall. Drag it with one finger to the spot.</li>
              <li>Line the red centre lines up with a pencil mark or a level line.</li>
            </ol>
          )}
          <p className="muted small">The vent is locked at real size, so pinching will not resize it. To change the design, close the camera, edit it here and open the camera again.</p>
        </div>

        {state === 'downloaded' && <p className="sheet-note">The camera view needs Safari on an iPhone or iPad. A USDZ file of this vent was downloaded instead.</p>}
        {state === 'failed' && <p className="sheet-note bad">The AR model could not be created.</p>}
        {!supported && state === 'idle' && <p className="sheet-note">This device can’t open the camera view. Open this page in Safari on an iPhone or iPad, or download the model file here.</p>}

        <div className="sheet-actions">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={open} disabled={state === 'busy' || !heightOk}>
            {state === 'busy' ? 'Preparing…' : supported ? 'Open camera' : 'Download USDZ'}
          </button>
        </div>
      </div>
    </div>
  );
}
