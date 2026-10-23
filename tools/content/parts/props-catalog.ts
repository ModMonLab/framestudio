/**
 * The rest of the H1 prop catalog: furniture, tech, kitchen and office props (this file) and decor, building,
 * outdoor, sports, music, party, medical, mystery, fantasy, travel, retail and event props (props-catalog2.ts).
 * Furniture is drawn at about 2.6 stage units per centimetre, matching the podcast kit; hand props are drawn about
 * half as large again so they read at a distance. States, seat and grip anchors and sound cues follow the catalog.
 */
import type { When } from '../../../packages/rig/src/types.js';
import type { PS } from '../dsl.js';
import type { PropDrawer, PropSpec } from './props.js';

export const sway = (x: number, y = 0): Record<string, [number, number]> => ({ 'anim.sin': [x, y] });
export const flick = (x: number, y = 0): Record<string, [number, number]> => ({ 'anim.fast': [x, y] });

/** A point on an ellipse (rx, ry) around (cx, cy) at angle `ang` that turns with `anim.spin*` (rest pose = `ang`). */
export function spinPt(cx: number, cy: number, r: number, ang: number, ry = r): PS {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [cx + r * c, cy + ry * s, { 'anim.spinC1': [r * c, ry * s], 'anim.spinS': [-r * s, ry * c] }];
}

/** A wheel: tyre, rim and spokes; the spokes turn in the `moving` states and stand still in the `still` ones. */
export function wheel(d: PropDrawer, cx: number, cy: number, r: number, tyre: string, rim: string, moving: string[] = [], still: string[] = []) {
  d.ellipse(cx, cy, r, r, tyre);
  d.ellipse(cx, cy, r * 0.62, r * 0.62, rim, { flat: true });
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const c = Math.cos(a) * r * 0.58;
    const s = Math.sin(a) * r * 0.58;
    if (moving.length) d.stroke([spinPt(cx, cy, r * 0.58, a), spinPt(cx, cy, r * 0.58, a + Math.PI)], tyre, 3, { when: { state: moving } });
    d.stroke([[cx - c, cy - s], [cx + c, cy + s]], tyre, 3, moving.length ? { when: { state: still } } : {});
  }
  d.ellipse(cx, cy, r * 0.14, r * 0.14, tyre, { flat: true });
}

/** Four legs seen from the front: two outer and two set-back inner ones. */
function legs(d: PropDrawer, half: number, top: number, w: number, slot: string, inset = 0.82) {
  d.rect(-half * inset - w / 2, top, w, -top, `${slot}.shade`, { flat: true });
  d.rect(half * inset - w / 2, top, w, -top, `${slot}.shade`, { flat: true });
  d.rect(-half - w / 2 + w, top, w, -top, slot, { r: 2 });
  d.rect(half - w / 2 - w, top, w, -top, slot, { r: 2 });
}

/** Lines of text-like strokes in a box (screens, papers, boards). */
function lines(d: PropDrawer, x: number, y: number, w: number, h: number, slot: string, n: number, o: { when?: When; width?: number } = {}) {
  const gap = h / (n + 1);
  for (let i = 1; i <= n; i++) {
    const len = w * (0.55 + ((i * 37) % 40) / 100);
    d.stroke([[x, y + i * gap], [x + len, y + i * gap]], slot, o.width ?? Math.max(1.5, gap * 0.3), o.when ? { when: o.when } : {});
  }
}

/** A seat cushion block with a soft top. */
function cushion(d: PropDrawer, x: number, y: number, w: number, h: number, slot: string, id?: string) {
  d.rect(x, y, w, h, slot, { r: Math.min(18, h / 2), ...(id ? { id } : {}) });
  if (id) d.shade([[x, y + h * 0.6], [x + w, y + h * 0.6], [x + w, y + h], [x, y + h]], id);
}

export const CATALOG_PROPS_A: Record<string, PropSpec> = {
  /* ---------------------------------------------------------------- furniture */
  desk: {
    colors: { wood: '#A87A55', metal: '#3A3330', drawer: '#C79C72' }, bounds: [-185, -205, 370, 205], anchors: { top: [0, -200], left: [-120, -205], right: [120, -205] }, capabilities: ['surface'],
    draw: (d) => {
      d.ground(380);
      d.rect(-170, -190, 16, 190, 'metal', { r: 3 });
      d.rect(30, -190, 140, 190, 'drawer', { id: 'ped' });
      for (const y of [-180, -120, -60]) {
        d.rect(40, y, 120, 52, 'drawer', { r: 4 });
        d.rect(85, y + 22, 30, 7, 'metal', { r: 3, flat: true });
      }
      d.shade([[130, -190], [170, -190], [170, 0], [130, 0]], 'ped');
      d.rect(-185, -205, 370, 20, 'wood', { r: 4, id: 'top' });
    },
  },
  'office-chair': {
    colors: { seat: '#34383F', metal: '#9AA0A8', wheel: '#1E1F22' }, states: ['still', 'swivel'], bounds: [-140, -300, 280, 300], anchors: { seat: [0, -125] }, capabilities: ['seat', 'swivel'], sounds: { 'state:swivel': 'sfx.chair-creak@1' },
    draw: (d) => {
      d.ground(240);
      for (const x of [-110, -40, 40, 110]) d.ellipse(x, -10, 12, 10, 'wheel');
      d.stroke([[-110, -20], [0, -40], [110, -20]], 'metal', 10, { smooth: true });
      d.stroke([[-40, -18], [0, -40], [40, -18]], 'metal', 8, { smooth: true });
      d.rect(-9, -110, 18, 75, 'metal', { r: 4 });
      d.stroke([[0, -125], [6, -170]], 'metal', 10);
      const tw = { 'anim.sin': [14, 0] as [number, number] };
      // Swivelling turns the backrest from side to side.
      d.poly([[-95, -300], [95, -300], [100, -170], [-100, -170]], 'seat', { smooth: 0.35, id: 'back', when: { state: 'still' } });
      d.poly([[-95, -300, tw], [95, -300, tw], [100, -170, tw], [-100, -170, tw]], 'seat', { smooth: 0.35, when: { state: 'swivel' } });
      cushion(d, -120, -150, 240, 34, 'seat', 'cush');
    },
  },
  armchair: {
    colors: { fabric: '#B4664A', leg: '#4A3326' }, bounds: [-150, -280, 300, 280], anchors: { seat: [0, -112] }, capabilities: ['seat'], sounds: { sit: 'sfx.sit-on-sofa@1' },
    draw: (d) => {
      d.ground(300);
      for (const x of [-115, 115]) d.rect(x - 8, -30, 16, 30, 'leg', { r: 3 });
      d.rect(-120, -280, 240, 200, 'fabric', { r: 50, id: 'back' });
      d.shade([[-120, -150], [120, -150], [120, -80], [-120, -80]], 'back');
      cushion(d, -112, -135, 224, 60, 'fabric', 'seatc');
      d.rect(-150, -175, 52, 150, 'fabric', { r: 24 });
      d.rect(98, -175, 52, 150, 'fabric', { r: 24 });
    },
  },
  sofa: {
    colors: { fabric: '#4F6E8C', leg: '#3A2A20', pillow: '#E3B85C' }, bounds: [-290, -270, 580, 270], anchors: { seat: [0, -112], seatL: [-175, -112], seatR: [175, -112] }, capabilities: ['seat'], sounds: { sit: 'sfx.sit-on-sofa@1' },
    draw: (d) => {
      d.ground(580);
      for (const x of [-250, 250]) d.rect(x - 8, -28, 16, 28, 'leg', { r: 3 });
      d.rect(-260, -270, 520, 190, 'fabric', { r: 40, id: 'back' });
      d.shade([[-260, -140], [260, -140], [260, -80], [-260, -80]], 'back');
      for (const x of [-250, -84, 82]) cushion(d, x, -135, 168, 62, 'fabric');
      d.rect(-290, -180, 56, 155, 'fabric', { r: 24 });
      d.rect(234, -180, 56, 155, 'fabric', { r: 24 });
      d.poly([[-225, -215], [-150, -230], [-140, -150], [-215, -140]], 'pillow', { smooth: 0.4 });
    },
  },
  stool: {
    colors: { wood: '#C29468' }, bounds: [-70, -125, 140, 125], anchors: { seat: [0, -120] }, capabilities: ['seat'],
    draw: (d) => {
      d.ground(130);
      d.stroke([[-30, -110], [-55, 0]], 'wood.shade', 10);
      d.stroke([[30, -110], [55, 0]], 'wood.shade', 10);
      d.stroke([[0, -110], [0, -4]], 'wood', 10);
      d.stroke([[-45, -45], [45, -45]], 'wood.shade', 6);
      d.ellipse(0, -118, 66, 14, 'wood');
    },
  },
  bench: {
    colors: { wood: '#9C6B45', metal: '#2F2B29' }, bounds: [-210, -120, 420, 120], anchors: { seat: [-100, -115], seatR: [100, -115] }, capabilities: ['seat'],
    draw: (d) => {
      d.ground(420);
      legs(d, 190, -105, 16, 'metal');
      d.rect(-210, -125, 420, 24, 'wood', { r: 6 });
    },
  },
  bed: {
    colors: { frame: '#8A5E3E', sheet: '#EDEFF3', blanket: '#6C8FB5', pillow: '#FFFFFF' }, bounds: [-280, -300, 560, 300], anchors: { lie: [0, -145], seat: [120, -140], head: [-200, -170] }, capabilities: ['lie', 'seat'],
    draw: (d) => {
      d.ground(560);
      d.rect(-280, -300, 34, 300, 'frame', { r: 8 });
      d.rect(250, -170, 26, 170, 'frame', { r: 6 });
      d.rect(-250, -90, 500, 60, 'frame', { r: 6 });
      d.rect(-246, -140, 496, 56, 'sheet', { r: 16 });
      d.ellipse(-180, -158, 58, 24, 'pillow');
      d.poly([[-90, -150], [250, -150], [256, -60], [-96, -60]], 'blanket', { smooth: 0.15, id: 'bl' });
      d.shade([[-96, -100], [256, -100], [256, -60], [-96, -60]], 'bl');
    },
  },
  bookshelf: {
    colors: { wood: '#7E5638', b1: '#C8553D', b2: '#3F6E8C', b3: '#E3B85C', b4: '#5E8C5A' }, bounds: [-125, -495, 250, 495], depth: 'back',
    draw: (d) => {
      d.ground(250);
      d.rect(-125, -495, 250, 495, 'wood', { id: 'case' });
      d.rect(-110, -480, 220, 470, 'wood.shade', { flat: true });
      const shelves = [-480, -365, -250, -135];
      shelves.forEach((y, si) => {
        let x = -105;
        let i = si;
        while (x < 95) {
          const w = 14 + ((i * 7) % 12);
          const h = 80 + ((i * 13) % 25);
          d.rect(x, y + 108 - h, w, h, ['b1', 'b2', 'b3', 'b4'][i % 4]!, { r: 2 });
          x += w + 2;
          i += 3;
        }
        d.rect(-110, y + 108, 220, 8, 'wood', { flat: true });
      });
    },
  },
  cabinet: {
    colors: { wood: '#B98D62', inside: '#5A4334', knob: '#D9B25F', stuff: '#8FA8C0' }, states: ['closed', 'open'], bounds: [-105, -235, 210, 235], capabilities: ['open', 'close'], sounds: { 'state:open': 'sfx.door-open@1', 'state:closed': 'sfx.door-close@1' },
    draw: (d) => {
      d.ground(210);
      d.rect(-105, -235, 210, 225, 'wood', { r: 4 });
      d.rect(-95, -225, 190, 205, 'inside', { flat: true, when: { state: 'open' } });
      d.rect(-80, -205, 60, 70, 'stuff', { r: 3, when: { state: 'open' } });
      d.rect(10, -110, 70, 80, 'stuff', { r: 3, when: { state: 'open' } });
      d.rect(-95, -122, 190, 6, 'wood', { flat: true, when: { state: 'open' } });
      d.rect(-95, -225, 93, 205, 'wood', { r: 3, when: { state: 'closed' } });
      d.rect(2, -225, 93, 205, 'wood', { r: 3, when: { state: 'closed' } });
      d.ellipse(-14, -125, 6, 6, 'knob', { when: { state: 'closed' } });
      d.ellipse(14, -125, 6, 6, 'knob', { when: { state: 'closed' } });
      d.poly([[-105, -230], [-150, -245], [-150, 5], [-105, -12]], 'wood', { when: { state: 'open' } });
      d.poly([[105, -230], [150, -245], [150, 5], [105, -12]], 'wood', { when: { state: 'open' } });
      d.rect(-105, -12, 210, 12, 'wood.shade', { flat: true });
    },
  },
  'coffee-table': {
    colors: { wood: '#8E6446', glass: '#CFE3EA' }, bounds: [-155, -110, 310, 110], anchors: { top: [0, -108], cupL: [-70, -110], cupR: [70, -110] }, capabilities: ['surface'],
    draw: (d) => {
      d.ground(300);
      legs(d, 140, -95, 16, 'wood');
      d.rect(-130, -40, 260, 10, 'wood.shade', { flat: true });
      d.rect(-155, -112, 310, 20, 'wood', { r: 6 });
    },
  },
  'kitchen-counter': {
    colors: { cab: '#E8E2D6', top: '#5B5E63', handle: '#9AA0A8', plinth: '#3A3836' }, bounds: [-210, -240, 420, 240], anchors: { top: [0, -235], left: [-120, -240], right: [120, -240] }, capabilities: ['surface'], depth: 'back',
    draw: (d) => {
      d.rect(-200, -18, 400, 18, 'plinth', { flat: true });
      for (const x of [-200, -67, 66]) {
        d.rect(x + 3, -215, 128, 195, 'cab', { r: 3 });
        d.rect(x + 50, -195, 36, 7, 'handle', { r: 3, flat: true });
      }
      d.rect(-210, -240, 420, 26, 'top', { r: 3 });
    },
  },
  'bar-stool': {
    colors: { seat: '#B34B3B', metal: '#B8BDC4' }, bounds: [-60, -200, 120, 200], anchors: { seat: [0, -195] }, capabilities: ['seat'],
    draw: (d) => {
      d.ground(110);
      d.ellipse(0, -6, 50, 9, 'metal');
      d.rect(-6, -185, 12, 180, 'metal', { r: 3 });
      d.ellipse(0, -75, 40, 7, 'metal', { flat: true });
      d.ellipse(0, -76, 34, 4, 'metal.shade', { flat: true });
      d.rect(-58, -205, 116, 26, 'seat', { r: 12 });
    },
  },
  lectern: {
    colors: { wood: '#7A4E31', trim: '#C9A15B' }, bounds: [-95, -310, 190, 310], anchors: { top: [0, -300], mic: [40, -320] }, capabilities: ['surface'],
    draw: (d) => {
      d.ground(200);
      d.rect(-90, -20, 180, 20, 'wood', { r: 4 });
      d.poly([[-60, -20], [60, -20], [75, -270], [-75, -270]], 'wood', { id: 'body' });
      d.shade([[25, -20], [60, -20], [75, -270], [35, -270]], 'body');
      d.poly([[-95, -270], [95, -270], [90, -310], [-90, -295]], 'wood');
      d.rect(-40, -200, 80, 30, 'trim', { r: 4 });
    },
  },
  whiteboard: {
    colors: { board: '#FAFBFC', frame: '#AEB4BC', ink: '#2F5E8C', ink2: '#C8553D' }, states: ['clean', 'written'], bounds: [-190, -490, 380, 490], anchors: { write: [0, -360] }, capabilities: ['writable'],
    draw: (d) => {
      d.ground(320);
      d.stroke([[-150, -260], [-170, 0]], 'frame', 8);
      d.stroke([[150, -260], [170, 0]], 'frame', 8);
      d.rect(-190, -490, 380, 240, 'frame', { r: 6 });
      d.rect(-180, -480, 360, 220, 'board', { flat: true });
      d.rect(-150, -258, 300, 8, 'frame', { flat: true });
      lines(d, -160, -470, 200, 120, 'ink', 4, { when: { state: 'written' } });
      d.stroke([[50, -330], [80, -400], [110, -350], [140, -440]], 'ink2', 4, { when: { state: 'written' } });
      d.stroke([[-140, -330], [-60, -300]], 'ink2', 4, { when: { state: 'written' } });
    },
  },
  'classroom-desk': {
    colors: { wood: '#C9A06F', metal: '#4E5A66' }, bounds: [-200, -260, 400, 260], anchors: { seat: [-95, -115], seatFacing: 'right', top: [80, -185] }, capabilities: ['seat', 'surface'],
    draw: (d) => {
      d.ground(380);
      d.rect(-170, -260, 14, 150, 'metal', { r: 3 });
      d.rect(-170, -265, 60, 70, 'wood', { r: 8 });
      for (const x of [-160, -40, 40, 180]) d.rect(x - 6, x < 0 ? -105 : -180, 12, x < 0 ? 105 : 180, 'metal', { r: 3 });
      d.rect(-170, -125, 150, 18, 'wood', { r: 6 });
      d.rect(-10, -195, 210, 20, 'wood', { r: 4 });
    },
  },
  'dining-table': {
    colors: { wood: '#9A6A44', cloth: '#F1E8D8' }, bounds: [-250, -200, 500, 200], anchors: { top: [0, -196], left: [-150, -200], right: [150, -200] }, capabilities: ['surface'],
    draw: (d) => {
      d.ground(480);
      legs(d, 225, -185, 18, 'wood');
      d.rect(-250, -200, 500, 18, 'wood', { r: 4 });
      d.poly([[-140, -201], [140, -201], [150, -160], [-150, -160]], 'cloth', { smooth: 0.1 });
    },
  },
  wardrobe: {
    colors: { wood: '#8C6240', inside: '#4A372A', shirt: '#6C8FB5', coat: '#B4664A', knob: '#D9B25F' }, states: ['closed', 'open'], bounds: [-135, -530, 270, 530], capabilities: ['open', 'close'], depth: 'back', sounds: { 'state:open': 'sfx.door-open@1', 'state:closed': 'sfx.door-close@1' },
    draw: (d) => {
      d.ground(270);
      d.rect(-135, -530, 270, 520, 'wood', { r: 4 });
      d.rect(-122, -515, 244, 490, 'inside', { flat: true, when: { state: 'open' } });
      d.stroke([[-115, -470], [115, -470]], 'knob', 5, { when: { state: 'open' } });
      for (const [x, c] of [[-70, 'shirt'], [-10, 'coat'], [55, 'shirt']] as const) {
        d.stroke([[x, -470], [x, -450]], 'knob', 3, { when: { state: 'open' } });
        d.poly([[x - 40, -445], [x + 40, -445], [x + 34, -260], [x - 34, -260]], c, { smooth: 0.15, when: { state: 'open' } });
      }
      d.rect(-122, -515, 121, 490, 'wood', { r: 3, when: { state: 'closed' } });
      d.rect(1, -515, 121, 490, 'wood', { r: 3, when: { state: 'closed' } });
      d.ellipse(-14, -270, 7, 7, 'knob', { when: { state: 'closed' } });
      d.ellipse(14, -270, 7, 7, 'knob', { when: { state: 'closed' } });
      d.poly([[-135, -525], [-195, -545], [-195, 10], [-135, -10]], 'wood', { when: { state: 'open' } });
      d.poly([[135, -525], [195, -545], [195, 10], [135, -10]], 'wood', { when: { state: 'open' } });
    },
  },
  'reception-desk': {
    colors: { front: '#E6E1D8', top: '#6A5848', accent: '#3F7C8C' }, bounds: [-270, -300, 540, 300], anchors: { top: [0, -295], counter: [0, -300] }, capabilities: ['surface'],
    draw: (d) => {
      d.ground(540);
      d.poly([[-260, 0], [260, 0], [270, -260], [-270, -260]], 'front', { id: 'body' });
      d.rect(-260, -170, 520, 26, 'accent', { flat: true });
      d.shade([[-260, -60], [260, -60], [260, 0], [-260, 0]], 'body');
      d.rect(-280, -300, 560, 40, 'top', { r: 6 });
    },
  },

  /* ---------------------------------------------------------------- tech */
  'boom-microphone': {
    colors: { metal: '#2C2A2B', grille: '#55555C', foam: '#3A3A42' }, bounds: [-140, -420, 300, 420], anchors: { mic: [140, -330] },
    draw: (d) => {
      d.ground(180);
      for (const x of [-70, 0, 70]) d.stroke([[0, -40], [x, 0]], 'metal', 7);
      d.rect(-5, -300, 10, 262, 'metal', { r: 3 });
      d.stroke([[-100, -260], [150, -360]], 'metal', 7);
      d.ellipse(-100, -260, 16, 16, 'metal');
      d.poly([[118, -380], [168, -360], [150, -300], [100, -320]], 'foam', { smooth: 0.6 });
    },
  },
  laptop: {
    colors: { body: '#BFC4CB', screen: '#1E2633', glow: '#7FB8F0', code: '#F2C24F' }, states: ['open', 'closed'], bounds: [-90, -120, 180, 120], anchors: { grip: [0, -6], screen: [0, -70], keys: [0, -8] }, capabilities: ['grip', 'typing', 'screen'], sounds: { type: 'sfx.keyboard-typing@1', 'state:open': 'sfx.computer-startup@1' },
    draw: (d) => {
      d.poly([[-90, 0], [90, 0], [80, -12], [-80, -12]], 'body');
      d.rect(-80, -16, 160, 6, 'body', { flat: true, when: { state: 'closed' } });
      d.poly([[-72, -12], [72, -12], [80, -118], [-80, -118]], 'body', { when: { state: 'open' } });
      d.poly([[-64, -18], [64, -18], [71, -110], [-71, -110]], 'screen', { flat: true, when: { state: 'open' } });
      for (let i = 0; i < 5; i++) d.stroke([[-58 + (i % 2) * 10, -96 + i * 15], [-10 + ((i * 23) % 60), -96 + i * 15]], i % 3 ? 'glow' : 'code', 3, { when: { state: 'open' } });
    },
  },
  'desktop-monitor': {
    colors: { body: '#26282C', screen: '#203046', glow: '#7FB8F0', win: '#E6EDF5' }, states: ['on', 'off'], bounds: [-120, -200, 240, 200], anchors: { screen: [0, -120] }, capabilities: ['screen'],
    draw: (d) => {
      d.poly([[-55, 0], [55, 0], [40, -10], [-40, -10]], 'body');
      d.rect(-8, -60, 16, 52, 'body', { flat: true });
      d.rect(-120, -200, 240, 145, 'body', { r: 8 });
      d.rect(-110, -190, 220, 125, 'screen', { flat: true });
      d.rect(-96, -176, 120, 80, 'win', { r: 4, when: { state: 'on' }, opacity: 0.9 });
      lines(d, -90, -170, 90, 70, 'glow', 4, { when: { state: 'on' } });
      // A window being dragged across the screen.
      d.poly([[40, -170, sway(14)], [96, -170, sway(14)], [96, -110, sway(14)], [40, -110, sway(14)]], 'glow', { when: { state: 'on' }, flat: true, opacity: 0.85 });
    },
  },
  tablet: {
    colors: { case: '#2C2E33', screen: '#1B2230', lit: '#A9D8FF', icon: '#F2C24F' }, states: ['off', 'on'], bounds: [-45, -130, 90, 130], anchors: { grip: [0, -40], screen: [0, -65] }, capabilities: ['grip', 'screen'],
    draw: (d) => {
      d.rect(-45, -130, 90, 130, 'case', { r: 10 });
      d.rect(-38, -122, 76, 114, 'screen', { r: 4, flat: true, when: { state: 'off' } });
      d.rect(-38, -122, 76, 114, 'lit', { r: 4, flat: true, when: { state: 'on' } });
      for (let i = 0; i < 6; i++) d.rect(-30 + (i % 3) * 22, -112 + Math.floor(i / 3) * 24, 16, 16, 'icon', { r: 4, flat: true, when: { state: 'on' } });
    },
  },
  tv: {
    colors: { body: '#1E1F22', screen: '#14181F', sky: '#6FB4E8', hill: '#5E9C5A', sun: '#F2C24F' }, states: ['on', 'off'], bounds: [-210, -300, 420, 300], anchors: { screen: [0, -175] }, capabilities: ['screen'], depth: 'back', sounds: { 'state:on': 'sfx.static-noise@1' },
    draw: (d) => {
      d.ground(200);
      d.poly([[-90, 0], [90, 0], [70, -14], [-70, -14]], 'body');
      d.rect(-10, -60, 20, 50, 'body', { flat: true });
      d.rect(-210, -300, 420, 245, 'body', { r: 6 });
      d.rect(-198, -288, 396, 221, 'screen', { flat: true, id: 'scr' });
      d.rect(-198, -288, 396, 221, 'sky', { flat: true, when: { state: 'on' } });
      d.ellipse(110, -235, 26, 26, 'sun', { flat: true, when: { state: 'on' }, d: sway(0, 10) });
      d.poly([[-198, -67], [-198, -140], [-80, -180, sway(0, 6)], [40, -130], [198, -170, sway(0, -6)], [198, -67]], 'hill', { flat: true, smooth: 0.6, when: { state: 'on' }, clip: 'scr' });
    },
  },
  'camera-on-tripod': {
    colors: { body: '#2B2D31', lens: '#4A5560', metal: '#8E949B', rec: '#E5484D' }, bounds: [-100, -380, 230, 380], anchors: { lens: [120, -330] },
    draw: (d) => {
      d.ground(200);
      for (const x of [-80, 0, 80]) d.stroke([[0, -270], [x, 0]], 'metal', 6);
      d.rect(-6, -290, 12, 30, 'metal', { flat: true });
      d.rect(-70, -380, 150, 90, 'body', { r: 10 });
      d.rect(80, -365, 50, 60, 'lens', { r: 8 });
      d.ellipse(-50, -362, 6, 6, 'rec', { flat: true, opParam: 'anim.flicker' });
    },
  },
  'ring-light': {
    colors: { ring: '#F4F2EC', glow: '#FFF7E0', metal: '#2E2B2A' }, states: ['on', 'off'], bounds: [-110, -480, 220, 480], capabilities: ['light'],
    draw: (d) => {
      d.ground(180);
      for (const x of [-80, 0, 80]) d.stroke([[0, -60], [x, 0]], 'metal', 6);
      d.rect(-5, -300, 10, 245, 'metal', { r: 3 });
      d.ellipse(0, -385, 150, 150, 'glow', { flat: true, opacity: 0.25, when: { state: 'on' } });
      d.push({ ellipse: { c: d.a.pt([0, -385]), rx: 95, ry: 95 }, stroke: { c: 'ring', w: 18 } });
      d.push({ ellipse: { c: d.a.pt([0, -385]), rx: 95, ry: 95 }, stroke: { c: 'glow', w: 8 } }, { state: 'on' });
    },
  },
  'game-controller': {
    colors: { body: '#3A3D44', btn: '#E5484D', btn2: '#4F9CF2', stick: '#1E1F22' }, bounds: [-60, -45, 120, 45], anchors: { grip: [0, -20] }, capabilities: ['grip'],
    draw: (d) => {
      d.poly([[-55, -10], [-40, -42], [40, -42], [55, -10], [45, 0], [20, -14], [-20, -14], [-45, 0]], 'body', { smooth: 0.5 });
      d.ellipse(-28, -28, 9, 9, 'stick', { flat: true });
      d.ellipse(28, -34, 5, 5, 'btn', { flat: true });
      d.ellipse(38, -24, 5, 5, 'btn2', { flat: true });
    },
  },
  keyboard: {
    colors: { body: '#2E3035', key: '#D9DCE1' }, bounds: [-110, -26, 220, 26], anchors: { keys: [0, -20] }, capabilities: ['typing'], sounds: { type: 'sfx.keyboard-typing@1' },
    draw: (d) => {
      d.poly([[-110, 0], [110, 0], [102, -26], [-102, -26]], 'body');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) d.rect(-96 + c * 16 + r * 2, -22 + r * 7, 12, 5, 'key', { flat: true, r: 1 });
    },
  },
  speaker: {
    colors: { box: '#2A2724', cone: '#4A4743', wave: '#7FB8F0' }, states: ['on', 'off'], bounds: [-50, -170, 100, 170], capabilities: ['sound'],
    draw: (d) => {
      d.rect(-50, -170, 100, 170, 'box', { r: 8 });
      d.ellipse(0, -130, 22, 22, 'cone');
      d.ellipse(0, -60, 36, 36, 'cone');
      d.ellipse(0, -60, 12, 12, 'box', { flat: true });
      for (const [r, k] of [[46, 0.6], [58, 0.35]] as const) d.ellipse(0, -60, r, r, 'wave', { flat: true, opacity: k, opParam: 'anim.fast', when: { state: 'on' } });
    },
  },
  radio: {
    colors: { body: '#C9563C', grille: '#F1E3C4', dial: '#2E2621', note: '#2E2621' }, states: ['off', 'on'], bounds: [-90, -170, 180, 170], anchors: { grip: [0, -115] }, capabilities: ['grip', 'sound'], sounds: { 'state:on': 'sfx.static-noise@1' },
    draw: (d) => {
      d.stroke([[50, -100], [80, -170]], 'dial', 3);
      d.rect(-90, -105, 180, 105, 'body', { r: 16 });
      d.rect(-70, -85, 80, 65, 'grille', { r: 8 });
      d.ellipse(48, -52, 18, 18, 'dial');
      d.stroke([[30, -82], [70, -82]], 'dial', 3);
      d.poly([[-40, -140, sway(4, -6)], [-34, -140, sway(4, -6)], [-34, -122, sway(4, -6)], [-40, -118, sway(4, -6)]], 'note', { when: { state: 'on' }, flat: true });
      d.ellipse(-44, -118, 7, 5, 'note', { when: { state: 'on' }, flat: true, d: sway(4, -6) });
    },
  },
  'projector-screen': {
    colors: { screen: '#F6F7F9', case: '#3A3D44', slide: '#4F7CFF', slide2: '#F2C24F' }, states: ['blank', 'slides'], bounds: [-230, -520, 460, 520], anchors: { screen: [0, -370] }, capabilities: ['screen'], depth: 'back',
    draw: (d) => {
      d.ground(260);
      for (const x of [-90, 0, 90]) d.stroke([[0, -50], [x, 0]], 'case', 6);
      d.rect(-5, -230, 10, 190, 'case', { r: 2 });
      d.rect(-230, -520, 460, 20, 'case', { r: 8 });
      d.rect(-215, -500, 430, 270, 'screen', { flat: true });
      d.rect(-180, -470, 180, 120, 'slide', { r: 6, when: { state: 'slides' } });
      d.rect(30, -470, 150, 22, 'slide2', { r: 4, when: { state: 'slides' } });
      lines(d, 30, -440, 150, 90, 'slide', 4, { when: { state: 'slides' } });
    },
  },

  /* ---------------------------------------------------------------- kitchen */
  'coffee-cup-to-go': {
    colors: { cup: '#F4EFE6', lid: '#3A2E28', sleeve: '#B98A5E' }, bounds: [-28, -90, 56, 90], anchors: { grip: [0, -42], rim: [0, -86] }, capabilities: ['grip', 'drink'], sounds: { contact: 'sfx.cup-clink@1' },
    draw: (d) => {
      d.poly([[-20, 0], [20, 0], [26, -78], [-26, -78]], 'cup');
      d.poly([[-22, -26], [22, -26], [24, -56], [-24, -56]], 'sleeve', { flat: true });
      d.rect(-29, -90, 58, 14, 'lid', { r: 5 });
    },
  },
  'water-glass': {
    colors: { glass: '#DCEFF7', water: '#8CC9EC' }, states: ['full', 'empty'], bounds: [-25, -75, 50, 75], anchors: { grip: [0, -35], rim: [0, -72] }, capabilities: ['grip', 'drink'], sounds: { contact: 'sfx.cup-clink@1', pour: 'sfx.pour-drink@1' },
    draw: (d) => {
      d.poly([[-19, 0], [19, 0], [24, -74], [-24, -74]], 'glass', { opacity: 0.55, id: 'g' });
      d.poly([[-18, -4], [18, -4], [22, -58], [-22, -58]], 'water', { flat: true, opacity: 0.8, when: { state: 'full' } });
      d.stroke([[-14, -66], [-11, -12]], '#FFFFFF', 3, { opacity: 0.7 });
    },
  },
  'wine-glass': {
    colors: { glass: '#E4F0F4', wine: '#8C1F33' }, states: ['full', 'empty'], bounds: [-28, -95, 56, 95], anchors: { grip: [0, -28], rim: [0, -92] }, capabilities: ['grip', 'drink'], sounds: { contact: 'sfx.cup-clink@1' },
    draw: (d) => {
      d.ellipse(0, -3, 24, 5, 'glass', { opacity: 0.7 });
      d.rect(-3, -50, 6, 48, 'glass', { flat: true, opacity: 0.8 });
      d.poly([[-26, -94], [26, -94], [22, -64], [0, -50], [-22, -64]], 'glass', { smooth: 0.4, opacity: 0.5 });
      d.poly([[-24, -78], [24, -78], [20, -64], [0, -53], [-20, -64]], 'wine', { smooth: 0.4, flat: true, when: { state: 'full' } });
    },
  },
  'plate-of-food': {
    colors: { plate: '#F7F5F0', food: '#D9A04A', veg: '#5E9C5A', sauce: '#B8462E' }, states: ['full', 'eaten'], bounds: [-75, -40, 150, 40], anchors: { grip: [0, -6] }, capabilities: ['grip', 'eat'],
    draw: (d) => {
      d.ellipse(0, -8, 75, 12, 'plate');
      d.ellipse(-15, -20, 32, 16, 'food', { when: { state: 'full' } });
      d.ellipse(25, -18, 20, 12, 'veg', { when: { state: 'full' } });
      d.ellipse(-12, -26, 14, 5, 'sauce', { flat: true, when: { state: 'full' } });
      d.ellipse(-10, -12, 14, 4, 'food', { flat: true, when: { state: 'eaten' } });
      d.stroke([[30, -12], [48, -14]], 'sauce', 3, { when: { state: 'eaten' } });
    },
  },
  'coffee-machine': {
    colors: { body: '#2F3236', metal: '#B8BDC4', cup: '#F4EFE6', light: '#5ED38A', steam: '#FFFFFF' }, states: ['idle', 'brewing'], bounds: [-80, -220, 160, 220], capabilities: ['use'], sounds: { 'state:brewing': 'sfx.pour-drink@1' },
    draw: (d) => {
      d.rect(-80, -220, 160, 220, 'body', { r: 12 });
      d.rect(-60, -150, 120, 110, 'metal', { r: 6 });
      d.rect(-20, -150, 40, 20, 'body', { flat: true });
      d.rect(-20, -70, 40, 30, 'cup', { r: 4 });
      d.ellipse(55, -195, 6, 6, 'light', { flat: true, when: { state: 'brewing' } });
      d.stroke([[0, -130], [0, -72]], 'body.shade', 3, { when: { state: 'brewing' } });
      for (const x of [-8, 8]) d.stroke([[x, -76], [x + 6, -110, sway(4)], [x - 2, -140, sway(-6)]], 'steam', 3, { smooth: true, opacity: 0.6, when: { state: 'brewing' } });
    },
  },
  kettle: {
    colors: { body: '#D9DDE2', handle: '#2E2B2A', steam: '#FFFFFF' }, states: ['off', 'steaming', 'whistling'], bounds: [-80, -150, 170, 150], anchors: { grip: [0, -130] }, capabilities: ['grip', 'pour'], sounds: { 'state:whistling': 'sfx.kettle-whistle@1', pour: 'sfx.pour-drink@1' },
    draw: (d) => {
      d.stroke([[-45, -95], [-30, -140], [30, -140], [45, -95]], 'handle', 9, { smooth: true });
      d.poly([[-60, 0], [60, 0], [55, -70], [30, -100], [-30, -100], [-55, -70]], 'body', { smooth: 0.4, id: 'b' });
      d.poly([[50, -40], [85, -80], [90, -76], [58, -28]], 'body');
      d.shade([[20, -100], [60, -100], [60, 0], [20, 0]], 'b');
      for (const k of [0, 1]) d.stroke([[88 + k * 6, -84], [95 + k * 4, -110, sway(5)], [88 + k * 10, -140, sway(-8)]], 'steam', 4, { smooth: true, opacity: 0.65, when: { state: ['steaming', 'whistling'] } });
      d.stroke([[100, -90], [115, -96]], 'handle', 2, { when: { state: 'whistling' }, opParam: 'anim.fast' });
      d.stroke([[100, -76], [116, -74]], 'handle', 2, { when: { state: 'whistling' }, opParam: 'anim.fast' });
    },
  },
  toaster: {
    colors: { body: '#C9CED6', toast: '#D9A35A', slot: '#2E2B2A' }, states: ['down', 'popped'], bounds: [-70, -130, 140, 130], capabilities: ['use'], sounds: { 'state:popped': 'sfx.toaster-pop@1' },
    draw: (d) => {
      d.rect(-50, -125, 40, 50, 'toast', { r: 8, when: { state: 'popped' } });
      d.rect(10, -125, 40, 50, 'toast', { r: 8, when: { state: 'popped' } });
      d.rect(-70, -95, 140, 95, 'body', { r: 24, id: 'b' });
      d.rect(-50, -95, 40, 6, 'slot', { flat: true });
      d.rect(10, -95, 40, 6, 'slot', { flat: true });
      d.rect(62, -60, 14, 8, 'slot', { r: 2, when: { state: 'down' } });
      d.rect(62, -80, 14, 8, 'slot', { r: 2, when: { state: 'popped' } });
      d.shade([[20, -95], [70, -95], [70, 0], [20, 0]], 'b');
    },
  },
  fridge: {
    colors: { body: '#EEF1F4', inside: '#F8FBFF', light: '#FFF6D6', handle: '#9AA0A8', food: '#E3B85C', food2: '#5E9C5A' }, states: ['closed', 'open'], bounds: [-120, -560, 240, 560], capabilities: ['open', 'close'], depth: 'back', sounds: { 'state:open': 'sfx.door-open@1', 'state:closed': 'sfx.door-close@1' },
    draw: (d) => {
      d.ground(240);
      d.rect(-120, -560, 240, 555, 'body', { r: 12 });
      d.rect(-105, -545, 210, 525, 'inside', { flat: true, when: { state: 'open' } });
      d.ellipse(0, -400, 180, 220, 'light', { flat: true, opacity: 0.6, when: { state: 'open' } });
      for (const y of [-430, -310, -190]) d.rect(-105, y, 210, 5, 'handle', { flat: true, when: { state: 'open' } });
      d.rect(-80, -480, 40, 50, 'food', { r: 6, when: { state: 'open' } });
      d.ellipse(40, -330, 30, 20, 'food2', { when: { state: 'open' } });
      d.rect(-20, -250, 70, 60, 'food', { r: 6, when: { state: 'open' } });
      d.rect(-108, -545, 216, 175, 'body', { r: 6, when: { state: 'closed' } });
      d.rect(-108, -362, 216, 342, 'body', { r: 6, when: { state: 'closed' } });
      d.rect(84, -460, 10, 70, 'handle', { r: 4, when: { state: 'closed' } });
      d.rect(84, -340, 10, 110, 'handle', { r: 4, when: { state: 'closed' } });
      d.poly([[-120, -555], [-190, -575], [-190, 15], [-120, -5]], 'body', { when: { state: 'open' } });
    },
  },
  'cereal-box': {
    colors: { box: '#E8B23A', panel: '#C8553D', bowl: '#FFFFFF' }, bounds: [-40, -130, 80, 130], anchors: { grip: [0, -70] }, capabilities: ['grip', 'pour'],
    draw: (d) => {
      d.rect(-40, -130, 80, 130, 'box', { r: 3, id: 'b' });
      d.rect(-30, -115, 60, 30, 'panel', { r: 4, flat: true });
      d.ellipse(0, -45, 26, 14, 'bowl', { flat: true });
      d.ellipse(0, -52, 22, 6, 'box.shade', { flat: true });
      d.shade([[20, -130], [40, -130], [40, 0], [20, 0]], 'b');
    },
  },
  'pizza-box': {
    colors: { box: '#D9C29A', pizza: '#E3A040', sauce: '#C8462E', pep: '#9C2A22' }, states: ['closed', 'open'], bounds: [-90, -100, 180, 100], anchors: { grip: [0, -10] }, capabilities: ['grip', 'open', 'close'],
    draw: (d) => {
      d.poly([[-90, 0], [90, 0], [80, -20], [-80, -20]], 'box');
      d.poly([[-80, -20], [80, -20], [80, -26], [-80, -26]], 'box.shade', { flat: true, when: { state: 'closed' } });
      d.ellipse(0, -22, 70, 10, 'pizza', { when: { state: 'open' } });
      d.ellipse(0, -23, 60, 7, 'sauce', { flat: true, when: { state: 'open' } });
      for (const x of [-30, 5, 35]) d.ellipse(x, -23, 7, 3, 'pep', { flat: true, when: { state: 'open' } });
      d.poly([[-80, -20], [80, -20], [76, -100], [-76, -100]], 'box', { when: { state: 'open' } });
    },
  },
  'fruit-bowl': {
    colors: { bowl: '#3F6E8C', apple: '#C8453D', banana: '#F2D04A', orange: '#F08A2C' }, bounds: [-75, -80, 150, 80],
    draw: (d) => {
      d.ellipse(-25, -50, 22, 22, 'apple');
      d.ellipse(20, -52, 22, 22, 'orange');
      d.poly([[-50, -60], [0, -78], [50, -62], [40, -55], [0, -66], [-45, -52]], 'banana', { smooth: 0.6 });
      d.poly([[-75, -40], [75, -40], [50, 0], [-50, 0]], 'bowl', { smooth: 0.4 });
    },
  },

  /* ---------------------------------------------------------------- office */
  book: {
    colors: { cover: '#2F5E8C', page: '#F7F2E6', text: '#8A8378' }, states: ['closed', 'open'], bounds: [-55, -75, 110, 75], anchors: { grip: [0, -35] }, capabilities: ['grip', 'read', 'open', 'close'], sounds: { 'state:open': 'sfx.page-turn@1', turn: 'sfx.page-turn@1' },
    draw: (d) => {
      d.rect(-28, -75, 56, 75, 'cover', { r: 3, when: { state: 'closed' } });
      d.rect(22, -72, 4, 69, 'page', { flat: true, when: { state: 'closed' } });
      d.poly([[-55, -8], [0, 0], [55, -8], [55, -72], [0, -66], [-55, -72]], 'cover', { when: { state: 'open' } });
      d.poly([[-50, -12], [0, -5], [0, -64], [-50, -68]], 'page', { when: { state: 'open' } });
      d.poly([[0, -5], [50, -12], [50, -68], [0, -64]], 'page', { when: { state: 'open' } });
      lines(d, -44, -60, 36, 46, 'text', 5, { when: { state: 'open' }, width: 2 });
      lines(d, 7, -60, 36, 46, 'text', 5, { when: { state: 'open' }, width: 2 });
    },
  },
  notebook: {
    colors: { cover: '#E3B85C', page: '#FFFFFF', ring: '#5A5A60', ink: '#4F7CFF' }, states: ['closed', 'open'], bounds: [-50, -70, 100, 70], anchors: { grip: [0, -30] }, capabilities: ['grip', 'write', 'open', 'close'], sounds: { 'state:open': 'sfx.page-turn@1', write: 'sfx.paper-rustle@1' },
    draw: (d) => {
      d.rect(-25, -70, 50, 70, 'cover', { r: 3, when: { state: 'closed' } });
      d.rect(-50, -70, 100, 70, 'page', { r: 3, when: { state: 'open' } });
      lines(d, -44, -62, 38, 56, 'ink', 6, { when: { state: 'open' }, width: 1.5 });
      for (let i = 0; i < 7; i++) d.ellipse(0, -64 + i * 10, 3, 3, 'ring', { flat: true, when: { state: 'open' } });
      for (let i = 0; i < 7; i++) d.ellipse(-25, -64 + i * 10, 3, 3, 'ring', { flat: true, when: { state: 'closed' } });
    },
  },
  pen: {
    colors: { body: '#2F5E8C', tip: '#C9CED6' }, bounds: [-6, -70, 12, 70], anchors: { grip: [0, -20] }, capabilities: ['pinch', 'write'], sounds: { click: 'sfx.pen-click@1' },
    draw: (d) => {
      d.poly([[-3, 0], [3, 0], [5, -12], [-5, -12]], 'tip');
      d.rect(-5, -64, 10, 52, 'body', { r: 4 });
      d.rect(3, -60, 3, 26, 'tip', { flat: true });
      d.rect(-2, -70, 4, 6, 'tip', { flat: true });
    },
  },
  clipboard: {
    colors: { board: '#B98A5E', paper: '#FFFFFF', clip: '#9AA0A8', text: '#8A8378' }, bounds: [-45, -120, 90, 120], anchors: { grip: [0, -60] }, capabilities: ['grip', 'write'],
    draw: (d) => {
      d.rect(-45, -115, 90, 115, 'board', { r: 6 });
      d.rect(-36, -100, 72, 92, 'paper', { flat: true });
      lines(d, -30, -95, 56, 80, 'text', 7, { width: 2 });
      d.rect(-18, -122, 36, 16, 'clip', { r: 4 });
    },
  },
  folder: {
    colors: { folder: '#E8C26A', paper: '#FFFFFF', text: '#8A8378' }, states: ['closed', 'open'], bounds: [-70, -80, 140, 80], anchors: { grip: [0, -35] }, capabilities: ['grip', 'open', 'close'], sounds: { 'state:open': 'sfx.paper-rustle@1' },
    draw: (d) => {
      d.poly([[-35, 0], [35, 0], [35, -70], [5, -70], [0, -78], [-35, -78]], 'folder', { when: { state: 'closed' } });
      d.poly([[-70, 0], [70, 0], [70, -70], [-70, -70]], 'folder', { when: { state: 'open' } });
      d.rect(-64, -66, 60, 60, 'paper', { flat: true, when: { state: 'open' } });
      d.rect(4, -66, 60, 60, 'paper', { flat: true, when: { state: 'open' } });
      lines(d, -58, -62, 46, 50, 'text', 5, { when: { state: 'open' }, width: 2 });
    },
  },
  'stack-of-papers': {
    colors: { paper: '#FBFAF6', edge: '#D9D3C4' }, bounds: [-55, -50, 110, 50], anchors: { top: [0, -48] },
    draw: (d) => {
      for (let i = 0; i < 8; i++) d.rect(-50 + ((i * 7) % 9) - 4, -6 - i * 6, 100, 6, i % 2 ? 'paper' : 'edge', { r: 1 });
    },
  },
  envelope: {
    colors: { paper: '#F2E8D5', flap: '#E2D4B8', letter: '#FFFFFF', seal: '#B8462E' }, states: ['sealed', 'open'], bounds: [-50, -95, 100, 95], anchors: { grip: [0, -30] }, capabilities: ['grip', 'open'], sounds: { 'state:open': 'sfx.paper-rustle@1' },
    draw: (d) => {
      d.rect(-36, -92, 72, 60, 'letter', { flat: true, when: { state: 'open' } });
      d.rect(-50, -60, 100, 60, 'paper', { r: 2 });
      d.poly([[-50, -60], [0, -24], [50, -60]], 'flap', { when: { state: 'sealed' } });
      d.ellipse(0, -28, 7, 7, 'seal', { when: { state: 'sealed' } });
      d.poly([[-50, -60], [0, -96], [50, -60]], 'flap', { when: { state: 'open' } });
    },
  },
  briefcase: {
    colors: { case: '#5A3A28', metal: '#C9A15B', inside: '#2E2621', paper: '#FFFFFF' }, states: ['closed', 'open'], bounds: [-85, -150, 170, 150], anchors: { grip: [0, -128] }, capabilities: ['grip', 'open', 'close'],
    draw: (d) => {
      d.stroke([[-22, -112], [-22, -130], [22, -130], [22, -112]], 'case', 8);
      d.rect(-85, -112, 170, 112, 'case', { r: 10, id: 'b' });
      d.rect(-40, -94, 14, 10, 'metal', { r: 2, when: { state: 'closed' } });
      d.rect(26, -94, 14, 10, 'metal', { r: 2, when: { state: 'closed' } });
      d.rect(-75, -104, 150, 40, 'inside', { flat: true, when: { state: 'open' } });
      d.rect(-60, -140, 70, 60, 'paper', { flat: true, when: { state: 'open' } });
      d.shade([[-85, -40], [85, -40], [85, 0], [-85, 0]], 'b');
    },
  },
  calculator: {
    colors: { body: '#3A3D44', screen: '#B9D7B0', key: '#D9DCE1', key2: '#F08A2C' }, bounds: [-35, -80, 70, 80], anchors: { grip: [0, -35] }, capabilities: ['grip', 'use'],
    draw: (d) => {
      d.rect(-35, -80, 70, 80, 'body', { r: 8 });
      d.rect(-26, -72, 52, 18, 'screen', { r: 3, flat: true });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) d.rect(-26 + c * 13.5, -48 + r * 11.5, 11, 9, c === 3 ? 'key2' : 'key', { r: 2, flat: true });
    },
  },
  stapler: {
    colors: { body: '#C8453D', base: '#2E2B2A' }, states: ['up', 'pressed'], bounds: [-60, -40, 120, 40], anchors: { press: [20, -36] }, capabilities: ['press'], sounds: { press: 'sfx.mouse-click@1', 'state:pressed': 'sfx.mouse-click@1' },
    draw: (d) => {
      d.rect(-60, -10, 120, 10, 'base', { r: 4 });
      d.poly([[-58, -14], [55, -24], [60, -14], [-58, -10]], 'body', { smooth: 0.2, when: { state: 'pressed' } });
      d.poly([[-58, -14], [50, -40], [58, -30], [-56, -10]], 'body', { smooth: 0.2, when: { state: 'up' } });
      d.ellipse(-52, -14, 8, 8, 'base');
    },
  },
  'desk-lamp': {
    colors: { metal: '#2F5E8C', glow: '#FFF3C4', base: '#2E2B2A' }, states: ['on', 'off'], bounds: [-100, -170, 200, 170], capabilities: ['light', 'switch'], sounds: { 'state:on': 'sfx.mouse-click@1', 'state:off': 'sfx.mouse-click@1' },
    draw: (d) => {
      d.poly([[40, -95], [120, 0], [-40, 0]], 'glow', { flat: true, opacity: 0.35, when: { state: 'on' } });
      d.ellipse(-50, -6, 40, 8, 'base');
      d.stroke([[-50, -10], [-30, -110], [30, -150]], 'metal', 7);
      d.ellipse(-30, -110, 7, 7, 'metal');
      d.poly([[10, -165], [50, -150], [72, -100], [12, -110]], 'metal', { smooth: 0.3 });
      d.ellipse(42, -103, 20, 6, 'glow', { flat: true, when: { state: 'on' } });
    },
  },
  'wall-clock': {
    colors: { face: '#FFFFFF', rim: '#2E2B2A', hand: '#2E2B2A', second: '#E5484D' }, bounds: [-60, -120, 120, 120], depth: 'back',
    draw: (d) => {
      const cx = 0;
      const cy = -60;
      d.ellipse(cx, cy, 60, 60, 'rim');
      d.ellipse(cx, cy, 52, 52, 'face', { flat: true });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        d.stroke([[cx + Math.sin(a) * 44, cy - Math.cos(a) * 44], [cx + Math.sin(a) * 50, cy - Math.cos(a) * 50]], 'hand', i % 3 ? 2 : 4);
      }
      d.stroke([[cx, cy], [cx + 22, cy - 14]], 'hand', 5);
      d.stroke([[cx, cy], [cx - 6, cy - 38]], 'hand', 3.5);
      // The second hand ticks once a second.
      d.stroke([[cx, cy], [cx, cy - 46, { 'anim.tickS': [46, 0], 'anim.tickC1': [0, -46] }]], 'second', 1.6);
      d.ellipse(cx, cy, 4, 4, 'second', { flat: true });
    },
  },
  calendar: {
    colors: { page: '#FFFFFF', head: '#C8453D', grid: '#C9CED6', mark: '#2F5E8C' }, bounds: [-55, -130, 110, 130], depth: 'back',
    draw: (d) => {
      d.rect(-55, -130, 110, 130, 'page', { r: 3 });
      d.rect(-55, -130, 110, 30, 'head', { r: 3, flat: true });
      for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) d.rect(-48 + c * 14, -92 + r * 17, 11, 13, (r * 7 + c) === 17 ? 'mark' : 'grid', { flat: true, r: 1 });
    },
  },
  'sticky-notes': {
    colors: { note: '#F7E36A', note2: '#F6A6C1', note3: '#9FDCB0', ink: '#4A4A50' }, bounds: [-50, -60, 100, 60],
    draw: (d) => {
      d.rect(-50, -40, 46, 40, 'note2', { r: 1 });
      d.rect(4, -44, 46, 44, 'note3', { r: 1 });
      d.rect(-22, -60, 46, 46, 'note', { r: 1 });
      lines(d, -16, -56, 30, 30, 'ink', 3, { width: 1.5 });
    },
  },
  trophy: {
    colors: { gold: '#E3B23C', base: '#4A3326' }, bounds: [-45, -130, 90, 130], anchors: { grip: [0, -30] }, capabilities: ['grip', 'raise'],
    draw: (d) => {
      d.rect(-40, -24, 80, 24, 'base', { r: 3 });
      d.rect(-8, -60, 16, 38, 'gold', { flat: true });
      d.poly([[-30, -128], [30, -128], [24, -80], [0, -62], [-24, -80]], 'gold', { smooth: 0.3, id: 'cup' });
      d.stroke([[-30, -118], [-46, -112], [-30, -92]], 'gold', 5, { smooth: true });
      d.stroke([[30, -118], [46, -112], [30, -92]], 'gold', 5, { smooth: true });
      d.shade([[8, -128], [30, -128], [24, -80], [8, -66]], 'cup');
    },
  },
};
