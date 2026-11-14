import type { Design } from './types';
import { RULES, r1 } from './design';
import { speciesOf } from './params';

export interface Step {
  text: string;
  ref?: string;
}
export interface InstructionSet {
  title: string;
  steps: Step[];
  check: string;
}
export interface HardwareRow {
  qty: string;
  name: string;
  note: string;
}
export interface Instructions {
  machining: InstructionSet;
  assembly: InstructionSet;
  hardware: HardwareRow[];
  tools: string[];
}

const mm = (n: number) => `${r1(n)} mm`;

/** Every number in these steps comes from the computed design. Nothing is restated by hand. */
export function buildInstructions(d: Design): Instructions {
  const p = d.params;
  const louvred = p.construction === 'louvred';
  const flush = p.mounting === 'flush';
  const G = d.grille;
  const code = (type: string) => d.cutList.filter((r) => r.type === type).map((r) => r.code).join(', ');
  const m: Step[] = [];
  const a: Step[] = [];
  const tools = new Set<string>(['Table saw or track saw', 'Thicknesser', 'Clamps', 'Square and tape']);
  const grilleName = flush ? 'insert' : 'vent';

  m.push({
    text: `Dress the ${speciesOf(p.species).name.toLowerCase()} to ${mm(d.overall.t)} thick${flush ? ` for the surround and ${mm(G.t)} for the insert parts` : ''}. Rip and crosscut every part to the cut list, following the stock layout. Keep grain running along the length of each part.`,
  });

  if (louvred && d.louvre) {
    const L = d.louvre;
    tools.add('Router with straight cutter');
    const onEdge = L.width <= p.stockThickness;
    m.push({
      text: onEdge
        ? `Louvres (${code('louvre')}): rip ${mm(L.thickness + RULES.LOUVRE_RIP_ALLOWANCE)} strips off the edge of the board, plane to ${mm(L.thickness)} thick and ${mm(L.width)} wide, then crosscut ${L.total} pieces at ${mm(L.length)}.`
        : `Louvres (${code('louvre')}): rip strips ${mm(L.width)} wide, resaw and plane to ${mm(L.thickness)} thick, then crosscut ${L.total} pieces at ${mm(L.length)}.`,
    });
    const st = d.stations[0];
    m.push({
      text: `Mark the housing centres on the inner edge of both stiles (${code('stile')}) as a mirrored pair, measured from the ${st.from}. ${L.perCell} per section, ${d.cells.length > 1 ? `${d.cells.length} sections, ` : ''}${L.perCell > 1 ? `${mm(L.pitch)} apart` : 'centred in the section'}. The station list gives every centre.`,
    });
    m.push({
      text: `Rout each housing ${mm(L.thickness)} wide, ${mm(L.width)} long and ${mm(p.housingDepth)} deep, tilted ${L.angle}° from square across the edge so the front end sits lower than the back end. Centre it in the ${mm(G.t)} thickness. It stops ${mm((G.t - L.depthProj) / 2)} short of each face.`,
      ref: 'Housing jig',
    });
    if (d.stations[1])
      m.push({
        text: `Mullions (${code('divider')}): rout the same housings on both edges, measured from the ${d.stations[1].from}. Mirror the tilt so the louvres run in line across the mullion.`,
        ref: 'Housing jig',
      });
    if (p.joinery === 'dowel') {
      tools.add('Dowelling jig');
      m.push({
        text: `Frame joints: drill for ${d.dowels.perJoint} × ø${p.dowelDiameter} mm dowel${d.dowels.perJoint > 1 ? 's' : ''} at each of the ${d.dowels.joints} joints, centred in the thickness. Drill the rail ends and the matching stile edges from the same reference face.`,
        ref: 'Dowel jig',
      });
    } else if (p.joinery === 'stub-tenon') {
      m.push({
        text: `Frame joints: cut a stub tenon ${mm(p.tenonLength)} long and ${mm(G.t / 3)} thick (one third of the thickness) on both ends of every rail${d.cells.length > 1 ? ' and divider' : ''}. Cut matching mortises ${mm(p.tenonLength + 1)} deep in the stiles.`,
      });
    } else {
      m.push({
        text: `Frame joints: mitre both ends of the stiles and rails at 45°. Lengths in the cut list are long point to long point.${d.dowels.total ? ` Drill ${d.dowels.perJoint} × ø${p.dowelDiameter} mm dowel${d.dowels.perJoint > 1 ? 's' : ''} at each divider joint.` : ''}`,
      });
    }
    m.push({ text: 'Lightly ease the long edges of every louvre and sand all inside faces now. They cannot be reached after glue-up.' });
  } else if (d.slot) {
    const S = d.slot;
    tools.add('Router with straight cutter');
    tools.add('Slot template and guide bush');
    const panel = d.parts.find((x) => x.type === 'panel')!;
    if (panel.stock.length > 1)
      m.push({
        text: `Panel (${panel.code}): joint and glue ${panel.stock.length} strips edge to edge with the grain running across the ${mm(G.w)} width, in line with the slots. When cured, flatten and trim to ${r1(G.w)} × ${r1(G.h)} mm.`,
      });
    else m.push({ text: `Panel (${panel.code}): cut to ${r1(G.w)} × ${r1(G.h)} mm with the grain running across the ${mm(G.w)} width, in line with the slots.` });
    const st = d.stations[0];
    m.push({
      text: `Mark slot centre lines from the ${st.from}: ${S.perCell} per section at ${mm(S.pitch)} centres. The station list gives every centre. Slots start ${mm(p.stileWidth)} in from each side${d.cells.length > 1 && p.sectionDirection === 'side' ? `, with ${mm(p.dividerWidth)} left solid between sections` : ''}.`,
    });
    m.push({
      text: `Rout ${S.total} through slots with a ø${r1(S.width)} mm cutter, each ${mm(S.length)} long overall (${mm(S.length - S.width)} of cutter travel). Take several shallow passes over a backing board.`,
      ref: 'Slot template',
    });
    m.push({ text: 'Sand the faces and lightly ease the slot edges on both sides.' });
  }

  if (flush && d.surround) {
    const s = d.surround;
    m.push({
      text: `Surround (${code('surroundH')}, ${code('surroundV')}): before mitring, rout the insert ledge along the inner front edge of the surround stock, ${mm(s.ledgeWidth)} wide and ${mm(G.t)} deep. That leaves a ledge ${mm(s.ledgeThickness)} thick.`,
    });
    if (d.rebate)
      m.push({ text: `Rout the locating rebate along the outer back edge of the same stock, ${mm(d.rebate.width)} wide and ${mm(d.rebate.depth)} deep.` });
    m.push({ text: 'Mitre both ends of each surround piece at 45°. Lengths in the cut list are long point to long point.' });
  }

  // Assembly.
  if (louvred && d.louvre) {
    a.push({ text: `Dry fit the whole ${grilleName} without glue. Every louvre should slide home with about ${mm(RULES.LOUVRE_END_FLOAT)} of end float.` });
    a.push({ text: 'Lay one stile on the bench, housings up. Glue the rail and divider joints into it, then stand the louvres in their housings with a small spot of glue in each.' });
    a.push({ text: 'Glue the second stile joints and lower it on, starting the louvres at one end and working along.' });
    a.push({ text: `Clamp across the rails. Measure both diagonals: each should read ${mm(Math.hypot(G.w, G.h))}. Adjust until they match, then leave to cure.` });
  } else {
    a.push({ text: 'The panel is one piece, so no frame glue-up is needed.' });
  }
  if (!flush && d.rebate)
    a.push({
      text: `Rout the locating rebate around the back perimeter, ${mm(d.rebate.width)} wide and ${mm(d.rebate.depth)} deep. The spigot left is ${r1(d.opening.w - 2 * p.fitClearance)} × ${r1(d.opening.h - 2 * p.fitClearance)} mm.`,
    });
  if (flush && d.surround) {
    a.push({ text: `Glue the four surround mitres and clamp with a band clamp. Diagonals should both read ${mm(Math.hypot(d.overall.w, d.overall.h))}.` });
    a.push({
      text: `Check the pocket measures ${r1(d.surround.pocket.w)} × ${r1(d.surround.pocket.h)} mm. The insert (${r1(G.w)} × ${r1(G.h)} mm) should drop in with ${mm(p.insertClearance)} clearance each side and sit flush with the face.`,
    });
  }
  if (p.edgeRadius > 0) {
    tools.add('Round-over cutter');
    a.push({ text: `Round over the outer front edges with a ${mm(p.edgeRadius)} radius cutter, then finish sand.` });
  } else a.push({ text: 'Break the outer edges by hand and finish sand.' });
  a.push({
    text: `Fit over the ${r1(d.opening.w)} × ${r1(d.opening.h)} mm wall opening with ${mm(p.overlap)} of overlap each side. Fixings and any finish are your choice and are not specified here. Use only products their makers rate for sauna use.`,
  });

  const hardware: HardwareRow[] = [];
  if (d.dowels.total) hardware.push({ qty: `${d.dowels.total}`, name: `Dowels ø${p.dowelDiameter} mm`, note: `${d.dowels.perJoint} per joint, ${d.dowels.joints} joints` });
  hardware.push({ qty: '', name: 'Wood glue', note: 'rated by its maker for heat and moisture' });
  hardware.push({ qty: '', name: 'Fixings', note: 'to suit the wall, not specified' });

  return {
    machining: {
      title: 'Machining',
      steps: m,
      check: louvred
        ? `Stiles are a mirrored pair, housings tilt the same way on both, and a test louvre fits a housing snugly.`
        : `Slots are parallel, ${mm(d.slot?.web ?? 0)} apart, and clear of the ${mm(p.railWidth)} top and bottom borders.`,
    },
    assembly: {
      title: 'Assembly',
      steps: a,
      check: `Overall size is ${r1(d.overall.w)} × ${r1(d.overall.h)} × ${r1(d.overall.t)} mm, the face is flat and diagonals match.`,
    },
    hardware,
    tools: Array.from(tools),
  };
}
