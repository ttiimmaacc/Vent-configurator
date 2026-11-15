import { useState } from 'react';
import { BUILT_IN_PRESETS, DEFAULT_PARAMS, computeDesign } from '../engine';
import type { Params, Preset } from '../engine';

const KEY = 'sauna-vent-presets-v1';
/** Select values for built-ins carry this prefix so a saved preset may share a built-in's name. */
const BUILT_IN = 'builtin:';

function load(): Preset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === 'string' && p.params) : [];
  } catch {
    return [];
  }
}

/** Named configurations kept in this browser. Loading one fills the controls; Save then updates the plans. */
export function Presets({ params, valid, onLoad }: { params: Params; valid: boolean; onLoad: (p: Params) => void }) {
  const [presets, setPresets] = useState<Preset[]>(load);
  const [current, setCurrent] = useState('');
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);

  const store = (next: Preset[]) => {
    setPresets(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  const trimmed = name.trim();
  const exists = presets.some((p) => p.name === trimmed);
  const save = () => {
    if (!trimmed || !valid) return;
    store([...presets.filter((p) => p.name !== trimmed), { name: trimmed, params }].sort((a, b) => a.name.localeCompare(b.name)));
    setCurrent(trimmed);
    setNaming(false);
    setName('');
  };
  const pick = (n: string) => {
    setCurrent(n);
    const preset = n.startsWith(BUILT_IN) ? BUILT_IN_PRESETS.find((p) => BUILT_IN + p.name === n) : presets.find((p) => p.name === n);
    if (!preset) return;
    // Presets saved by an older version may lack newer fields, so fill those from the defaults.
    const merged = { ...DEFAULT_PARAMS, ...preset.params };
    if (computeDesign(merged).ok) onLoad(merged);
  };

  return (
    <div className="presets">
      <label htmlFor="preset-select">Presets</label>
      <div className="row">
        <select id="preset-select" value={current} onChange={(e) => pick(e.target.value)}>
          <option value="">Load a preset…</option>
          <optgroup label="Built in">
            {BUILT_IN_PRESETS.map((p) => (
              <option key={p.name} value={BUILT_IN + p.name}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {presets.length > 0 && (
            <optgroup label="Saved in this browser">
              {presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {current && !current.startsWith(BUILT_IN) && (
          <button
            aria-label={`Delete preset ${current}`}
            title="Delete this preset"
            onClick={() => {
              store(presets.filter((p) => p.name !== current));
              setCurrent('');
            }}
          >
            Delete
          </button>
        )}
      </div>
      {naming ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input autoFocus aria-label="Preset name" placeholder="Preset name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!trimmed}>
            {exists ? 'Replace' : 'Save'}
          </button>
          <button type="button" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          className="wide"
          disabled={!valid}
          title={valid ? undefined : 'Fix the issues first'}
          onClick={() => {
            setName(current.startsWith(BUILT_IN) ? '' : current);
            setNaming(true);
          }}
        >
          Save current settings as a preset
        </button>
      )}
    </div>
  );
}
