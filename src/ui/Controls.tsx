import { useEffect, useState } from 'react';
import { FIELD_GROUPS, visibleFields } from '../engine';
import type { Design, NumberField, Params } from '../engine';
import { Presets } from './Presets';

function NumberInput({ field, value, flag, onChange }: { field: NumberField; value: number; flag: string; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const inRange = (v: number) => Number.isFinite(v) && v >= field.min && v <= field.max;
  // Half-typed values are never sent to the engine. On leaving the field they snap into range or revert.
  const settle = () => {
    const v = Number(text);
    if (text.trim() === '' || !Number.isFinite(v)) return setText(String(value));
    const clamped = Math.min(field.max, Math.max(field.min, v));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className={'field' + flag}>
      <label htmlFor={`f-${field.key}`}>{field.label}</label>
      <div className="num">
        <input
          id={`f-${field.key}`}
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          step={field.step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && inRange(v)) onChange(v);
          }}
          onBlur={settle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') settle();
          }}
        />
        {field.unit && <span>{field.unit}</span>}
      </div>
      <input
        className="range"
        type="range"
        aria-label={field.label}
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {field.hint && <p className="hint">{field.hint}</p>}
    </div>
  );
}

export function Controls({ params, design, dirty, onChange, onReset, onSave, onDiscard, onLoadPreset }: { params: Params; design: Design; dirty: boolean; onChange: (patch: Partial<Params>) => void; onReset: () => void; onSave: () => void; onDiscard: () => void; onLoadPreset: (p: Params) => void }) {
  const errors = design.issues.filter((i) => i.level === 'error');
  const warnings = design.issues.filter((i) => i.level === 'warning');
  // Inputs named by an issue get an outline. An error outline wins over a warning one.
  const flags = new Map<string, 'error' | 'warning'>();
  for (const i of warnings) for (const f of i.fields) flags.set(f, 'warning');
  for (const i of errors) for (const f of i.fields) flags.set(f, 'error');
  const flag = (key: string) => (flags.has(key) ? ` flag-${flags.get(key)}` : '');
  const shownKeys = new Set<string>(visibleFields(params).map((f) => f.key));
  const reveal = (key: string) => {
    const el = document.getElementById(`f-${key}`);
    if (!el) return;
    el.closest('details')?.setAttribute('open', '');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  };
  return (
    <aside className="controls screen-only">
      <div className="savebar">
        <p className={dirty ? 'dirty' : ''}>{dirty ? (errors.length ? 'Unsaved changes. Fix the issues below to save.' : 'Unsaved changes. The plans still show the last saved design.') : 'Saved. Plans are up to date.'}</p>
        <div className="btns">
          <button className="primary" onClick={onSave} disabled={!dirty || errors.length > 0}>
            Save and update plans
          </button>
          <button onClick={onDiscard} disabled={!dirty}>
            Discard
          </button>
        </div>
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="issues" role="status">
            {[...errors, ...warnings].map((issue, k) => {
              const target = issue.fields.find((f) => shownKeys.has(f));
              return (
                <div key={k} className={`issue ${issue.level}`}>
                  <p>
                    <b>{issue.rule}</b> {issue.message}
                  </p>
                  <div className="issue-actions">
                    {issue.fix && (
                      <button className="link" onClick={() => onChange(issue.fix!.patch)}>
                        {issue.fix.label}
                      </button>
                    )}
                    {target && (
                      <button className="link" onClick={() => reveal(target)}>
                        Show {issue.fields.filter((f) => shownKeys.has(f)).length > 1 ? 'inputs' : 'input'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Presets params={params} valid={errors.length === 0} onLoad={onLoadPreset} />
      {FIELD_GROUPS.filter((g) => !g.when || g.when(params)).map((g) => (
        <details key={g.title} open className="group">
          <summary>{g.title}</summary>
          {g.fields
            .filter((f) => !f.when || f.when(params))
            .map((f) => {
              if (f.kind === 'number')
                return <NumberInput key={f.key} field={f} value={params[f.key] as number} flag={flag(f.key)} onChange={(v) => onChange({ [f.key]: v } as Partial<Params>)} />;
              if (f.kind === 'select')
                return (
                  <div className={'field' + flag(f.key)} key={f.key}>
                    <label htmlFor={`f-${f.key}`}>{f.label}</label>
                    <select id={`f-${f.key}`} value={params[f.key] as string} onChange={(e) => onChange({ [f.key]: e.target.value } as Partial<Params>)}>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {f.hint && <p className="hint">{f.hint}</p>}
                  </div>
                );
              return (
                <div className={'field' + flag(f.key)} key={f.key}>
                  <label className="toggle">
                    <input id={`f-${f.key}`} type="checkbox" checked={params[f.key] as boolean} onChange={(e) => onChange({ [f.key]: e.target.checked } as Partial<Params>)} />
                    {f.label}
                  </label>
                  {f.hint && <p className="hint">{f.hint}</p>}
                </div>
              );
            })}
        </details>
      ))}
      <button className="ghost" onClick={onReset}>
        Reset to defaults
      </button>
    </aside>
  );
}
