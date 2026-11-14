import type { Params } from './types';

export const DEFAULT_PARAMS: Params = {
  construction: 'louvred',
  mounting: 'surface',
  sizeBy: 'opening',
  openingWidth: 150,
  openingHeight: 300,
  overallWidth: 180,
  overallHeight: 330,
  overlap: 15,
  thickness: 19,

  stileWidth: 28,
  railWidth: 28,
  edgeRadius: 3,

  sections: 2,
  sectionDirection: 'stacked',
  dividerWidth: 40,

  joinery: 'dowel',
  tenonLength: 10,
  dowelDiameter: 6,

  louvreThickness: 5,
  louvreAngle: 45,
  louvreWidthMode: 'auto',
  louvreWidth: 18,
  louvreCountMode: 'auto',
  louvrePitch: 14,
  louvreCount: 8,
  housingDepth: 5,
  faceSetback: 1,
  endClearance: 1,

  slotWidth: 6,
  slotWeb: 6,

  locatingRebate: false,
  rebateDepth: 6,
  fitClearance: 1,

  surroundWidth: 40,
  insertThickness: 14,
  ledgeWidth: 8,
  insertClearance: 0.5,

  species: 'wrc',
  stockThickness: 19,
  stockWidth: 90,
  stockLength: 2400,
  kerf: 3,
  endTrim: 10,
};

export interface Species {
  id: string;
  name: string;
  short: string;
  color: string;
}

// Colour is for the 3D preview only.
export const SPECIES: Species[] = [
  { id: 'wrc', name: 'Western red cedar', short: 'WRC', color: '#c98f62' },
  { id: 'aspen', name: 'Aspen', short: 'Aspen', color: '#ead9b8' },
  { id: 'thermo-aspen', name: 'Thermally modified aspen', short: 'Thermo-aspen', color: '#8a5c3b' },
  { id: 'alder', name: 'Alder', short: 'Alder', color: '#d9a878' },
  { id: 'hemlock', name: 'Hemlock', short: 'Hemlock', color: '#e3c9a0' },
  { id: 'basswood', name: 'Basswood (linden)', short: 'Basswood', color: '#eadfc4' },
  { id: 'spruce', name: 'Nordic spruce', short: 'Spruce', color: '#ecd6a6' },
  { id: 'white-oak', name: 'White oak', short: 'White oak', color: '#cdb088' },
];

export const speciesOf = (id: string): Species => SPECIES.find((s) => s.id === id) ?? SPECIES[0];

type When = (p: Params) => boolean;

export interface NumberField {
  kind: 'number';
  key: keyof Params;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
  when?: When;
}
export interface SelectField {
  kind: 'select';
  key: keyof Params;
  label: string;
  options: { value: string; label: string }[];
  hint?: string;
  when?: When;
}
export interface ToggleField {
  kind: 'toggle';
  key: keyof Params;
  label: string;
  hint?: string;
  when?: When;
}
export type Field = NumberField | SelectField | ToggleField;
export interface FieldGroup {
  title: string;
  when?: When;
  fields: Field[];
}

const louvred: When = (p) => p.construction === 'louvred';
const slotted: When = (p) => p.construction === 'slotted';
const flush: When = (p) => p.mounting === 'flush';
const multi: When = (p) => p.sections > 1;

export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'Type',
    fields: [
      {
        kind: 'select', key: 'construction', label: 'Construction',
        options: [
          { value: 'louvred', label: 'Louvred frame' },
          { value: 'slotted', label: 'Routed slotted panel' },
        ],
      },
      {
        kind: 'select', key: 'mounting', label: 'Mounting',
        options: [
          { value: 'surface', label: 'Surface-mount' },
          { value: 'flush', label: 'Flush, in mitred surround' },
        ],
      },
      {
        kind: 'select', key: 'species', label: 'Timber',
        options: SPECIES.map((s) => ({ value: s.id, label: s.name })),
      },
    ],
  },
  {
    title: 'Size',
    fields: [
      {
        kind: 'select', key: 'sizeBy', label: 'Size from',
        options: [
          { value: 'opening', label: 'Wall opening + overlap' },
          { value: 'overall', label: 'Overall size' },
        ],
      },
      { kind: 'number', key: 'openingWidth', label: 'Opening width', min: 40, max: 1200, step: 1, unit: 'mm', when: (p) => p.sizeBy === 'opening' },
      { kind: 'number', key: 'openingHeight', label: 'Opening height', min: 40, max: 1200, step: 1, unit: 'mm', when: (p) => p.sizeBy === 'opening' },
      { kind: 'number', key: 'overallWidth', label: 'Overall width', min: 60, max: 1300, step: 1, unit: 'mm', when: (p) => p.sizeBy === 'overall' },
      { kind: 'number', key: 'overallHeight', label: 'Overall height', min: 60, max: 1300, step: 1, unit: 'mm', when: (p) => p.sizeBy === 'overall' },
      { kind: 'number', key: 'overlap', label: 'Overlap onto wall, each side', min: 0, max: 80, step: 1, unit: 'mm' },
      { kind: 'number', key: 'thickness', label: 'Thickness', min: 10, max: 45, step: 0.5, unit: 'mm', hint: 'Finished thickness of the vent (the surround when flush-mounted).' },
    ],
  },
  {
    title: 'Frame',
    fields: [
      { kind: 'number', key: 'stileWidth', label: 'Stile (side) width', min: 12, max: 120, step: 1, unit: 'mm' },
      { kind: 'number', key: 'railWidth', label: 'Rail (top and bottom) width', min: 12, max: 120, step: 1, unit: 'mm' },
      { kind: 'number', key: 'edgeRadius', label: 'Front edge round-over', min: 0, max: 8, step: 0.5, unit: 'mm', hint: 'Listed in the machining steps. Not modelled in 3D.' },
    ],
  },
  {
    title: 'Sections',
    fields: [
      { kind: 'number', key: 'sections', label: 'Number of sections', min: 1, max: 6, step: 1, unit: '' },
      {
        kind: 'select', key: 'sectionDirection', label: 'Arrangement', when: multi,
        options: [
          { value: 'stacked', label: 'Stacked, with mid rails' },
          { value: 'side', label: 'Side by side, with mullions' },
        ],
      },
      { kind: 'number', key: 'dividerWidth', label: 'Divider width', min: 10, max: 150, step: 1, unit: 'mm', when: multi },
    ],
  },
  {
    title: 'Louvres',
    when: louvred,
    fields: [
      { kind: 'number', key: 'louvreThickness', label: 'Louvre thickness', min: 3, max: 12, step: 0.5, unit: 'mm' },
      { kind: 'number', key: 'louvreAngle', label: 'Louvre angle', min: 0, max: 70, step: 1, unit: '°', hint: 'Tilt from horizontal. The front edge sits lower than the back edge.' },
      {
        kind: 'select', key: 'louvreWidthMode', label: 'Louvre width',
        options: [
          { value: 'auto', label: 'Auto: fill the thickness' },
          { value: 'manual', label: 'Set manually' },
        ],
      },
      { kind: 'number', key: 'louvreWidth', label: 'Louvre width', min: 6, max: 60, step: 0.5, unit: 'mm', when: (p) => p.louvreWidthMode === 'manual' },
      {
        kind: 'select', key: 'louvreCountMode', label: 'Quantity',
        options: [
          { value: 'auto', label: 'Auto: from target spacing' },
          { value: 'manual', label: 'Set per section' },
        ],
      },
      { kind: 'number', key: 'louvrePitch', label: 'Target spacing, centre to centre', min: 5, max: 80, step: 0.5, unit: 'mm', when: (p) => p.louvreCountMode === 'auto' },
      { kind: 'number', key: 'louvreCount', label: 'Louvres per section', min: 1, max: 80, step: 1, unit: '', when: (p) => p.louvreCountMode === 'manual' },
      { kind: 'number', key: 'housingDepth', label: 'Housing depth in stile', min: 2, max: 15, step: 0.5, unit: 'mm' },
      { kind: 'number', key: 'faceSetback', label: 'Setback from each face', min: 0.5, max: 10, step: 0.5, unit: 'mm', hint: 'Keeps the housings blind: timber left between the housing and each face.' },
      { kind: 'number', key: 'endClearance', label: 'Clearance to rails', min: 0, max: 10, step: 0.5, unit: 'mm' },
    ],
  },
  {
    title: 'Slots',
    when: slotted,
    fields: [
      { kind: 'number', key: 'slotWidth', label: 'Slot width (cutter diameter)', min: 3, max: 25, step: 0.5, unit: 'mm' },
      { kind: 'number', key: 'slotWeb', label: 'Timber between slots', min: 3, max: 40, step: 0.5, unit: 'mm' },
    ],
  },
  {
    title: 'Joinery',
    when: louvred,
    fields: [
      {
        kind: 'select', key: 'joinery', label: 'Frame joints',
        options: [
          { value: 'dowel', label: 'Butt joint with dowels' },
          { value: 'stub-tenon', label: 'Stub tenon' },
          { value: 'mitre', label: 'Mitred corners' },
        ],
      },
      { kind: 'number', key: 'dowelDiameter', label: 'Dowel diameter', min: 4, max: 12, step: 1, unit: 'mm', when: (p) => p.joinery !== 'stub-tenon' },
      { kind: 'number', key: 'tenonLength', label: 'Tenon length', min: 4, max: 40, step: 1, unit: 'mm', when: (p) => p.joinery === 'stub-tenon' },
    ],
  },
  {
    title: 'Mounting details',
    fields: [
      { kind: 'toggle', key: 'locatingRebate', label: 'Locating rebate on the back', hint: 'Leaves a spigot that sits inside the wall opening.' },
      { kind: 'number', key: 'rebateDepth', label: 'Rebate depth', min: 2, max: 30, step: 0.5, unit: 'mm', when: (p) => p.locatingRebate },
      { kind: 'number', key: 'fitClearance', label: 'Spigot clearance, each side', min: 0, max: 5, step: 0.5, unit: 'mm', when: (p) => p.locatingRebate },
      { kind: 'number', key: 'surroundWidth', label: 'Surround width', min: 20, max: 150, step: 1, unit: 'mm', when: flush },
      { kind: 'number', key: 'insertThickness', label: 'Insert thickness', min: 8, max: 40, step: 0.5, unit: 'mm', when: flush },
      { kind: 'number', key: 'ledgeWidth', label: 'Ledge width', min: 4, max: 30, step: 0.5, unit: 'mm', when: flush, hint: 'The lip in the surround that the insert rests on.' },
      { kind: 'number', key: 'insertClearance', label: 'Insert clearance, each side', min: 0, max: 3, step: 0.25, unit: 'mm', when: flush },
    ],
  },
  {
    title: 'Stock',
    fields: [
      { kind: 'number', key: 'stockThickness', label: 'Board thickness', min: 10, max: 70, step: 0.5, unit: 'mm' },
      { kind: 'number', key: 'stockWidth', label: 'Board width', min: 30, max: 400, step: 1, unit: 'mm' },
      { kind: 'number', key: 'stockLength', label: 'Board length', min: 300, max: 6000, step: 50, unit: 'mm' },
      { kind: 'number', key: 'kerf', label: 'Saw kerf', min: 0, max: 6, step: 0.1, unit: 'mm' },
      { kind: 'number', key: 'endTrim', label: 'End trim per board', min: 0, max: 100, step: 1, unit: 'mm' },
    ],
  },
];

export const visibleFields = (p: Params): Field[] =>
  FIELD_GROUPS.filter((g) => !g.when || g.when(p)).flatMap((g) => g.fields.filter((f) => !f.when || f.when(p)));
