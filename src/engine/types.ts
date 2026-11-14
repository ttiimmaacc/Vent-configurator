// All dimensions are millimetres. Angles are degrees.
// Axes: X = width, Y = height, Z = depth. z = 0 is the back (wall) face, +Z faces the room.

export type Construction = 'louvred' | 'slotted';
export type Mounting = 'surface' | 'flush';
export type Joinery = 'dowel' | 'stub-tenon' | 'mitre';
export type SectionDirection = 'stacked' | 'side';
export type SizeBy = 'opening' | 'overall';
export type AutoManual = 'auto' | 'manual';

export interface Params {
  construction: Construction;
  mounting: Mounting;
  sizeBy: SizeBy;
  openingWidth: number;
  openingHeight: number;
  overallWidth: number;
  overallHeight: number;
  overlap: number;
  thickness: number;

  stileWidth: number;
  railWidth: number;
  edgeRadius: number;

  sections: number;
  sectionDirection: SectionDirection;
  dividerWidth: number;

  joinery: Joinery;
  tenonLength: number;
  dowelDiameter: number;

  louvreThickness: number;
  louvreAngle: number;
  louvreWidthMode: AutoManual;
  louvreWidth: number;
  louvreCountMode: AutoManual;
  louvrePitch: number;
  louvreCount: number;
  housingDepth: number;
  faceSetback: number;
  endClearance: number;

  slotWidth: number;
  slotWeb: number;

  locatingRebate: boolean;
  rebateDepth: number;
  fitClearance: number;

  surroundWidth: number;
  insertThickness: number;
  ledgeWidth: number;
  insertClearance: number;

  species: string;
  stockThickness: number;
  stockWidth: number;
  stockLength: number;
  kerf: number;
  endTrim: number;
}

export type Pt = [number, number];

/**
 * A solid made by extruding a 2D outline.
 * axis 'z': outline is [x, y], extruded from z = from to z = to.
 * axis 'x': outline is [y, z], extruded from x = from to x = to.
 */
export interface Prism {
  axis: 'z' | 'x';
  outline: Pt[];
  holes?: Pt[][];
  from: number;
  to: number;
}

export type PartType = 'stile' | 'rail' | 'divider' | 'louvre' | 'panel' | 'surroundH' | 'surroundV';

export interface StockItem {
  length: number;
  ripWidth: number;
  note?: string;
}

export interface Part {
  id: string;
  code: string;
  type: PartType;
  name: string;
  /** Finished cut size. Grain always runs along the length. */
  length: number;
  width: number;
  thickness: number;
  note?: string;
  prisms: Prism[];
  /** Front-elevation outlines [x, y] for the 2D drawings. */
  front: { outline: Pt[]; holes?: Pt[][]; lines?: [Pt, Pt][] }[];
  /** Unit-ish direction the part moves in the exploded view. */
  explode: [number, number, number];
  /** What has to be cut from stock to make this part. */
  stock: StockItem[];
}

export interface IssueFix {
  label: string;
  patch: Partial<Params>;
}

export interface Issue {
  level: 'error' | 'warning';
  rule: string;
  message: string;
  /** Inputs that cause this issue, so the controls can point at them. */
  fields: (keyof Params)[];
  /** A one-click change that clears this issue, when there is an unambiguous one. */
  fix?: IssueFix;
}

export interface Cell {
  index: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface CutRow {
  code: string;
  type: PartType;
  name: string;
  qty: number;
  length: number;
  width: number;
  thickness: number;
  note: string;
  partIds: string[];
}

export interface StockCut {
  code: string;
  offset: number;
  length: number;
}

export interface StockRip {
  ripWidth: number;
  yOffset: number;
  cuts: StockCut[];
  offcut: number;
}

export interface StockBoard {
  index: number;
  rips: StockRip[];
  widthOffcut: number;
}

export interface StockPlan {
  boards: StockBoard[];
  stockThickness: number;
  stockWidth: number;
  stockLength: number;
  kerf: number;
  endTrim: number;
  linearMetres: number;
  stockVolumeM3: number;
  partsAreaMm2: number;
  yieldPct: number;
}

export interface Station {
  member: string;
  from: string;
  values: number[];
}

export interface Design {
  id: string;
  params: Params;
  issues: Issue[];
  ok: boolean;
  overall: { w: number; h: number; t: number };
  opening: { w: number; h: number };
  /** The grille itself: whole vent when surface-mounted, the drop-in insert when flush-mounted. */
  grille: { w: number; h: number; t: number; z0: number; z1: number };
  clear: { w: number; h: number };
  cells: Cell[];
  louvre?: {
    width: number;
    thickness: number;
    angle: number;
    length: number;
    depthProj: number;
    heightProj: number;
    pitch: number;
    perCell: number;
    total: number;
    throat: number;
    sightGap: number;
    centres: number[][];
  };
  slot?: { width: number; web: number; length: number; pitch: number; perCell: number; total: number; centres: number[][] };
  surround?: { width: number; aperture: { w: number; h: number }; pocket: { w: number; h: number }; ledgeWidth: number; ledgeThickness: number };
  rebate?: { width: number; depth: number };
  dowels: { perJoint: number; joints: number; total: number; diameter: number };
  stations: Station[];
  openArea: { mm2: number; pctOfFace: number; basis: string };
  parts: Part[];
  cutList: CutRow[];
  stock: StockPlan | null;
}
