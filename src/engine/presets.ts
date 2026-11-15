import { DEFAULT_PARAMS } from './params';
import type { Params } from './types';

export interface Preset {
  name: string;
  params: Params;
}

/** Each built-in lists only what differs from the defaults. */
const preset = (name: string, over: Partial<Params>): Preset => ({ name, params: { ...DEFAULT_PARAMS, ...over } });

/** Presets that ship with the app. Presets a user saves stay in their own browser. */
export const BUILT_IN_PRESETS: Preset[] = [
  preset('Flat Slat Mitred', {
    openingWidth: 300,
    openingHeight: 300,
    thickness: 18,
    sections: 1,
    joinery: 'mitre',
    dowelDiameter: 10,
    louvreThickness: 8,
    louvreAngle: 0,
    louvrePitch: 18,
    housingDepth: 2,
    endClearance: 10,
    locatingRebate: true,
    rebateDepth: 12,
    fitClearance: 0,
    stockThickness: 18,
    stockWidth: 70,
  }),
];
