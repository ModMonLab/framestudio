/**
 * Props (H1) and kit set pieces (I1) drawn in stage units (origin at the floor contact point, y up is negative).
 * Each prop gets Flat (flat fills, one shade) and Illustrated (gradients, warm outline) art.
 */
import type { StyleFamily } from '../../../packages/schema/src/index.js';
import type { FillDef, PartData, ShapeDef, When } from '../../../packages/rig/src/types.js';
import { Art, lin, type PS } from '../dsl.js';

export type Draw = (d: PropDrawer) => void;

/** Small drawing vocabulary that emits family-appropriate shapes. */
export class PropDrawer {
  readonly a = new Art('o');
  private shapes: { slot: string; shape: ShapeDef; when?: When }[] = [];
  constructor(readonly fam: StyleFamily) {}
  get ill() {
    return this.fam === 'illustrated';
  }
  /** Fill for a colour slot: Illustrated gets a top→bottom light/shade gradient. */
  fill(slot: string, y0: number, y1: number, x = 0): FillDef {
    if (!this.ill) return slot;
    return lin(this.a.pt([x, y0]), this.a.pt([x, y1]), [[0, `${slot}.light`], [0.55, slot], [1, `${slot}.shade`]]);
  }
  private line(slot: string) {
    return this.ill ? { stroke: { c: `${slot}.line`, w: 1.4 } } : {};
  }
  rect(x: number, y: number, w: number, h: number, slot: string, o: { r?: number; flat?: boolean; when?: When; id?: string; opacity?: number; clip?: string; opParam?: string } = {}) {
    const r = Math.min(o.r ?? 0, w / 2, h / 2);
    const pts: PS[] = r > 0
      ? [[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]]
      : [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const path = r > 0 ? this.a.smooth(pts, true, 0.35) : this.a.path([['M', pts[0]!], ['L', pts[1]!], ['L', pts[2]!], ['L', pts[3]!], ['Z']]);
    this.push({ ...(o.id ? { id: o.id } : {}), path, fill: o.flat ? slot : this.fill(slot, y, y + h, x + w / 2), ...(o.flat ? {} : this.line(slot)), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.opParam ? { opacityParam: o.opParam } : {}), ...(o.clip ? { clip: o.clip } : {}) }, o.when);
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, slot: string, o: { flat?: boolean; when?: When; opacity?: number; id?: string; d?: Record<string, [number, number]>; clip?: string; opParam?: string } = {}) {
    this.push({ ...(o.id ? { id: o.id } : {}), ellipse: { c: this.a.pt([cx, cy, o.d ?? {}]), rx, ry }, fill: o.flat ? slot : this.fill(slot, cy - ry, cy + ry, cx), ...(o.flat ? {} : this.line(slot)), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.opParam ? { opacityParam: o.opParam } : {}), ...(o.clip ? { clip: o.clip } : {}) }, o.when);
    return this;
  }
  poly(pts: PS[], slot: string, o: { smooth?: number; flat?: boolean; when?: When; opacity?: number; id?: string; clip?: string; blend?: ShapeDef['blend']; opParam?: string } = {}) {
    const ys = pts.map((p) => p[1]);
    const path = o.smooth ? this.a.smooth(pts, true, o.smooth) : this.a.path([['M', pts[0]!], ...pts.slice(1).map((p) => ['L', p] as ['L', PS]), ['Z']]);
    this.push({ ...(o.id ? { id: o.id } : {}), path, fill: o.flat ? slot : this.fill(slot, Math.min(...ys), Math.max(...ys)), ...(o.flat ? {} : this.line(slot)), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.opParam ? { opacityParam: o.opParam } : {}), ...(o.clip ? { clip: o.clip } : {}), ...(o.blend ? { blend: o.blend } : {}) }, o.when);
    return this;
  }
  stroke(pts: PS[], slot: string, w: number, o: { when?: When; opacity?: number; smooth?: boolean; opParam?: string } = {}) {
    const path = o.smooth ? this.a.smooth(pts, false, 0.8) : this.a.path([['M', pts[0]!], ...pts.slice(1).map((p) => ['L', p] as ['L', PS])]);
    this.push({ path, stroke: { c: slot, w }, ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.opParam ? { opacityParam: o.opParam } : {}) }, o.when);
    return this;
  }
  /** One-tone shade (Flat) or soft multiply shadow (Illustrated) clipped to a shape id. */
  shade(pts: PS[], clip: string, o: { when?: When; slot?: string } = {}) {
    this.push({ path: this.a.smooth(pts, true, 0.5), fill: o.slot ?? '#000000', opacity: this.ill ? 0.22 : 0.16, clip, ...(this.ill ? { blend: 'multiply' as const } : {}) }, o.when);
    return this;
  }
  /** Soft ground shadow ellipse. */
  ground(w: number, x = 0) {
    this.push({ ellipse: { c: this.a.pt([x, -2]), rx: w / 2, ry: Math.max(6, w * 0.06) }, fill: '#000000', opacity: 0.16 });
    return this;
  }
  push(shape: ShapeDef, when?: When) {
    this.shapes.push({ slot: 'prop', shape: when ? { ...shape, when } : shape });
  }
  build() {
    this.a.layer('prop', 'stage', this.shapes.map((s) => s.shape));
    return this.a.build();
  }
}

export interface PropSpec {
  draw: Draw;
  colors: Record<string, string>;
  states?: string[];
  /** Sound cues by event name or `state:<name>` (FR-SND-04). */
  sounds?: Record<string, string>;
  /** [x, y, w, h] in stage units for selection/hit testing. */
  bounds: [number, number, number, number];
  /** Named points ([x, y]); image and text slots as [x, y, w, h]; `seatFacing` names the way a seat faces. */
  anchors?: Record<string, [number, number] | [number, number, number, number] | string>;
  depth?: 'mid' | 'front' | 'back' | 'ground';
  capabilities?: string[];
}

export function propPart(spec: PropSpec): PartData {
  const families: PartData['families'] = {};
  for (const fam of ['flat', 'illustrated'] as const) {
    const d = new PropDrawer(fam);
    spec.draw(d);
    families[fam] = { views: { front: d.build() }, exempt: { three: 'Props are drawn from the camera; they do not turn with character views.', side: 'Props are drawn from the camera.', back: 'Props are drawn from the camera.' } };
  }
  return { slot: 'prop', families, colors: spec.colors, ...(spec.states ? { options: { state: spec.states } } : {}), ...(spec.sounds ? { sounds: spec.sounds } : {}) };
}

/* ------------------------------------------------------------------ podcast kit props (H1) */

export const PROPS: Record<string, PropSpec> = {
  'round-table': {
    colors: { wood: '#B78E66', metal: '#2E2622' }, bounds: [-320, -230, 640, 230], anchors: { top: [0, -205], cupL: [-120, -210], cupR: [120, -210] }, capabilities: ['surface'],
    draw: (d) => {
      d.ground(520);
      d.poly([[-28, 0], [28, 0], [16, -190], [-16, -190]], 'metal');
      d.ellipse(0, -8, 120, 14, 'metal');
      d.ellipse(0, -192, 310, 40, 'wood.shade', { flat: true });
      d.ellipse(0, -205, 310, 40, 'wood', { id: 'top' });
      d.shade([[-310, -205], [310, -205], [300, -180], [-300, -180]], 'top');
    },
  },
  'studio-chair': {
    colors: { seat: '#7A7F8C', metal: '#2C2A2B' }, bounds: [-150, -300, 300, 300], anchors: { seat: [0, -150] }, capabilities: ['seat'],
    draw: (d) => {
      d.ground(260);
      d.poly([[-110, -40], [110, -40], [90, -150], [-90, -150]], 'seat', { smooth: 0.3, id: 'base' });
      d.rect(-140, -300, 280, 170, 'seat', { r: 40, id: 'back' });
      d.shade([[-140, -170], [140, -170], [140, -130], [-140, -130]], 'back');
      d.stroke([[-80, -40], [-95, 0]], 'metal', 10);
      d.stroke([[80, -40], [95, 0]], 'metal', 10);
    },
  },
  'desk-microphone': {
    colors: { metal: '#2C2A2B', grille: '#4A4A50', light: '#E5484D' }, states: ['off', 'on'], bounds: [-40, -170, 80, 170], anchors: { grip: [0, -120] },
    draw: (d) => {
      d.ellipse(0, -6, 38, 8, 'metal');
      d.stroke([[0, -6], [-10, -60], [-24, -110]], 'metal', 7, { smooth: true });
      d.rect(-46, -170, 34, 66, 'grille', { r: 16, id: 'cap' });
      d.shade([[-30, -170], [-12, -170], [-12, -104], [-30, -104]], 'cap');
      d.ellipse(-29, -98, 5, 5, 'light', { when: { state: 'on' }, flat: true });
    },
  },
  'on-air-sign': {
    colors: { box: '#2A1C19', glow: '#FF7A62', dim: '#6E3A33' }, states: ['on', 'off'], bounds: [-110, -60, 220, 60],
    draw: (d) => {
      d.rect(-110, -60, 220, 60, 'box', { r: 12, flat: true });
      d.rect(-90, -46, 180, 32, 'glow', { r: 6, when: { state: 'on' }, flat: true, opacity: 0.25 });
      d.rect(-80, -40, 160, 20, 'glow', { r: 4, when: { state: 'on' }, flat: true });
      d.rect(-80, -40, 160, 20, 'dim', { r: 4, when: { state: 'off' }, flat: true });
    },
  },
  'floor-lamp': {
    colors: { metal: '#3B302A', shade: '#F1E3C4', glow: '#FFF3D9' }, states: ['on', 'off'], bounds: [-90, -420, 180, 420],
    draw: (d) => {
      d.ground(130);
      d.ellipse(0, -6, 60, 12, 'metal');
      d.stroke([[0, -10], [0, -320]], 'metal', 9);
      d.poly([[-70, -320], [70, -320], [45, -420], [-45, -420]], 'shade');
      d.ellipse(0, -330, 150, 110, 'glow', { when: { state: 'on' }, flat: true, opacity: 0.18 });
    },
  },
  'potted-plant': {
    colors: { pot: '#B9765A', leaf: '#6F9873', leaf2: '#4E7A5A' }, bounds: [-150, -330, 300, 330],
    draw: (d) => {
      d.ground(140);
      const sway = { 'anim.sin': [6, 0] as [number, number] };
      d.poly([[0, -110], [-60, -210, sway], [-140, -260, sway], [-110, -200, sway], [-30, -120]], 'leaf2', { smooth: 0.8 });
      d.poly([[0, -110], [70, -230, sway], [130, -300, sway], [110, -220, sway], [30, -120]], 'leaf', { smooth: 0.8 });
      d.poly([[0, -110], [-10, -250, sway], [10, -330, sway], [30, -250, sway], [10, -110]], 'leaf', { smooth: 0.8 });
      d.rect(-65, -120, 130, 120, 'pot', { r: 14, id: 'pot' });
      d.shade([[20, -120], [65, -120], [65, 0], [20, 0]], 'pot');
    },
  },
  mug: {
    colors: { mug: '#F2ECE2', coffee: '#5A3B2B', steam: '#FFFFFF' }, states: ['full', 'empty', 'steam'], bounds: [-35, -60, 80, 60], anchors: { grip: [34, -30], rim: [0, -56] }, capabilities: ['grip', 'drink'], sounds: { contact: 'sfx.mug-on-table@1' },
    draw: (d) => {
      d.stroke([[22, -45], [40, -42], [40, -18], [22, -16]], 'mug', 7, { smooth: true });
      d.rect(-26, -56, 52, 56, 'mug', { r: 8, id: 'body' });
      d.ellipse(0, -55, 25, 6, 'coffee', { when: { state: ['full', 'steam'] }, flat: true });
      d.shade([[8, -56], [26, -56], [26, 0], [8, 0]], 'body');
      for (const [x, ph] of [[-8, 0], [8, 0.5]] as const) d.stroke([[x, -66], [x + 6, -86, { 'anim.sin': [4 * (ph ? -1 : 1), 0] }], [x - 2, -108, { 'anim.sin': [-6, 0] }]], 'steam', 4, { when: { state: 'steam' }, smooth: true, opacity: 0.6 });
    },
  },
  phone: {
    colors: { case: '#24242A', screen: '#1B2230', lit: '#9FD3FF', ring: '#FFFFFF' }, states: ['off', 'on', 'ringing'], bounds: [-20, -64, 40, 64], anchors: { grip: [0, -30] }, capabilities: ['grip', 'use'],
    draw: (d) => {
      d.rect(-17, -64, 34, 64, 'case', { r: 6, id: 'body' });
      d.rect(-13, -58, 26, 52, 'screen', { r: 3, flat: true, when: { state: 'off' } });
      d.rect(-13, -58, 26, 52, 'lit', { r: 3, flat: true, when: { state: ['on', 'ringing'] } });
      for (const k of [1, 2] as const) d.stroke([[20 + k * 6, -52], [24 + k * 8, -40], [20 + k * 6, -28]], 'ring', 2.5, { when: { state: 'ringing' }, smooth: true, opacity: 0.85 });
    },
  },
  door: {
    colors: { frame: '#6B4B34', panel: '#B98A5E', gap: '#2E2621', knob: '#D9B25F' }, states: ['closed', 'open'], bounds: [-120, -460, 240, 460], anchors: { handle: [80, -220] }, capabilities: ['open', 'close'], depth: 'back', sounds: { 'state:open': 'sfx.door-open@1', 'state:closed': 'sfx.door-close@1' },
    draw: (d) => {
      d.rect(-120, -460, 240, 460, 'frame', { flat: true });
      d.rect(-104, -446, 208, 446, 'gap', { flat: true, when: { state: 'open' } });
      d.rect(-104, -446, 208, 446, 'panel', { r: 2, id: 'panel', when: { state: 'closed' } });
      d.rect(-84, -420, 168, 160, 'panel', { r: 4, when: { state: 'closed' } });
      d.rect(-84, -230, 168, 200, 'panel', { r: 4, when: { state: 'closed' } });
      d.ellipse(80, -220, 9, 9, 'knob', { when: { state: 'closed' } });
      // Open: the panel swung toward the camera, seen edge-on as a narrow slab on the hinge side.
      d.poly([[-104, -446], [-60, -470], [-60, 20], [-104, 0]], 'panel', { when: { state: 'open' } });
      d.ellipse(-70, -230, 7, 9, 'knob', { when: { state: 'open' } });
    },
  },
  'podcast-headphones': {
    colors: { band: '#2A2A30', cup: '#3A3A42' }, bounds: [-60, -60, 120, 60],
    draw: (d) => {
      d.stroke([[-45, -10], [-40, -50], [0, -62], [40, -50], [45, -10]], 'band', 7, { smooth: true });
      d.rect(-60, -30, 26, 34, 'cup', { r: 10 });
      d.rect(34, -30, 26, 34, 'cup', { r: 10 });
    },
  },
};

/* ------------------------------------------------------------------ podcast studio kit set pieces (I1) */

export const PODCAST_KIT_PARTS: Record<string, { name: string; plane: string; order: number; at: [number, number]; spec: PropSpec; parallax?: number }> = {
  wall: {
    name: 'Back wall', plane: 'back', order: 0, at: [960, 700],
    spec: { colors: { wall: '#E9DCC8', glow: '#FFF3DF', skirting: '#8A6A4C' }, bounds: [-1400, -800, 2800, 900], draw: (d) => {
      d.rect(-1400, -800, 2800, 900, 'wall', { flat: true });
      d.ellipse(0, -430, 560, 440, 'glow', { flat: true, opacity: 0.55 });
      d.rect(-1400, -14, 2800, 16, 'skirting', { flat: true });
    } },
  },
  window: {
    name: 'Arched window', plane: 'back', order: 1, at: [960, 640],
    spec: { colors: { glass: '#F4EAD8', frame: '#CDB592', sky: '#CFE3EE' }, bounds: [-200, -580, 400, 580], draw: (d) => {
      d.poly([[-190, 0], [-190, -380], [-140, -520], [0, -575], [140, -520], [190, -380], [190, 0]], 'sky', { smooth: 0, id: 'pane' });
      d.poly([[-190, 0], [-190, -380], [-140, -520], [0, -575], [140, -520], [190, -380], [190, 0], [175, 0], [175, -380], [128, -505], [0, -558], [-128, -505], [-175, -380], [-175, 0]], 'frame', { flat: true });
      d.stroke([[0, 0], [0, -570]], 'frame', 10);
      d.stroke([[-190, -240], [190, -240]], 'frame', 10);
    } },
  },
  slats: {
    name: 'Acoustic slats', plane: 'back', order: 2, at: [960, 650],
    spec: { colors: { slat: '#C4A57F' }, bounds: [-930, -560, 1860, 560], draw: (d) => {
      for (let i = 0; i < 6; i++) {
        d.rect(-900 + i * 44, -560, 26, 560, 'slat', { r: 6 });
        d.rect(640 + i * 44, -560, 26, 560, 'slat', { r: 6 });
      }
    } },
  },
  floor: {
    name: 'Floor', plane: 'ground', order: 0, at: [960, 1080],
    spec: { colors: { floor: '#B99573', rug: '#DCC6A6' }, bounds: [-1400, -460, 2800, 480], draw: (d) => {
      d.rect(-1400, -460, 2800, 480, 'floor');
      d.ellipse(0, -200, 620, 90, 'rug', { flat: true });
    } },
  },
};

export type KitParts = Record<string, { name: string; plane: string; order: number; at: [number, number]; spec: PropSpec; parallax?: number }>;

/* ------------------------------------------------------------------ coffee shop kit set pieces (I1) */

export const COFFEE_KIT_PARTS: KitParts = {
  wall: {
    name: 'Brick wall', plane: 'back', order: 0, at: [960, 700],
    spec: { colors: { wall: '#C98A6A', brick: '#B4775A', mortar: '#D9A486', trim: '#5A3B2B' }, bounds: [-1400, -800, 2800, 900], draw: (d) => {
      d.rect(-1400, -800, 2800, 900, 'wall', { flat: true });
      for (let row = 0; row < 16; row++) for (let col = -14; col < 14; col++) {
        if ((row * 7 + col * 3) % 5 === 0) d.rect(col * 100 + (row % 2) * 50, -790 + row * 50, 92, 42, 'brick', { flat: true });
      }
      d.rect(-1400, -14, 2800, 16, 'trim', { flat: true });
    } },
  },
  window: {
    name: 'Shop window', plane: 'back', order: 1, at: [1360, 640],
    spec: { colors: { street: '#BFD7E3', city: '#8FA7B5', frame: '#3E2B20', awning: '#2F6B57' }, bounds: [-300, -560, 600, 560], draw: (d) => {
      d.rect(-290, -500, 580, 500, 'street', { flat: true, id: 'pane' });
      for (const [x, w, h] of [[-280, 90, 260], [-180, 120, 200], [-50, 80, 300], [40, 140, 230], [190, 90, 280]] as const) d.rect(x, -h - 60, w, h, 'city', { flat: true, clip: 'pane' });
      d.rect(-300, -510, 600, 20, 'frame', { flat: true });
      d.rect(-300, -10, 600, 20, 'frame', { flat: true });
      d.rect(-300, -510, 20, 520, 'frame', { flat: true });
      d.rect(280, -510, 20, 520, 'frame', { flat: true });
      d.rect(-10, -510, 20, 520, 'frame', { flat: true });
      for (let i = 0; i < 6; i++) d.rect(-320 + i * 107, -560, 107, 60, i % 2 ? 'street' : 'awning', { flat: true });
    } },
  },
  menu: {
    name: 'Menu board', plane: 'back', order: 2, at: [700, 380],
    spec: { colors: { board: '#2F4A3A', chalk: '#EDEDE2', frame: '#6B4B34' }, bounds: [-220, -150, 440, 300], draw: (d) => {
      d.rect(-220, -150, 440, 300, 'frame', { r: 8, flat: true });
      d.rect(-200, -130, 400, 260, 'board', { flat: true });
      d.rect(-120, -110, 240, 26, 'chalk', { flat: true, opacity: 0.85 });
      for (let i = 0; i < 4; i++) {
        d.rect(-170, -60 + i * 44, 210, 10, 'chalk', { flat: true, opacity: 0.6 });
        d.rect(120, -60 + i * 44, 50, 10, 'chalk', { flat: true, opacity: 0.6 });
      }
    } },
  },
  shelves: {
    name: 'Shelves', plane: 'back', order: 3, at: [260, 560],
    spec: { colors: { wood: '#7A5236', jar: '#E8D9B8', lid: '#3E2B20', cup: '#F2ECE2' }, bounds: [-220, -320, 440, 330], draw: (d) => {
      for (let i = 0; i < 3; i++) {
        d.rect(-220, -100 * i - 10, 440, 16, 'wood', { flat: true });
        for (let j = 0; j < 5; j++) {
          const x = -190 + j * 85;
          if ((i + j) % 2) {
            d.rect(x, -100 * i - 80, 50, 70, 'jar', { r: 8 });
            d.rect(x - 2, -100 * i - 88, 54, 12, 'lid', { flat: true });
          } else d.rect(x + 5, -100 * i - 50, 40, 40, 'cup', { r: 6 });
        }
      }
    } },
  },
  counter: {
    name: 'Counter', plane: 'mid', order: 0, at: [520, 1010],
    spec: { colors: { front: '#8C5E3C', top: '#E8DCC8', panel: '#7A5236', machine: '#B9BEC4', dark: '#2A2A2E' }, bounds: [-460, -470, 920, 470], draw: (d) => {
      d.rect(-460, -300, 920, 300, 'front', { id: 'front' });
      for (let i = 0; i < 6; i++) d.rect(-440 + i * 150, -270, 130, 240, 'panel', { r: 6 });
      d.rect(-480, -320, 960, 30, 'top', { r: 6 });
      // Espresso machine.
      d.rect(-380, -470, 220, 150, 'machine', { r: 10, id: 'machine' });
      d.rect(-360, -440, 180, 30, 'dark', { r: 4, flat: true });
      d.rect(-320, -400, 20, 50, 'dark', { flat: true });
      d.rect(-240, -400, 20, 50, 'dark', { flat: true });
      d.shade([[-250, -470], [-160, -470], [-160, -320], [-250, -320]], 'machine');
    } },
  },
  lights: {
    name: 'Pendant lights', plane: 'back', order: 4, at: [960, 0],
    spec: { colors: { cord: '#2A2A2E', shade: '#2F6B57', glow: '#FFE9B8' }, bounds: [-700, 0, 1400, 300], draw: (d) => {
      for (const x of [-600, -200, 200, 600]) {
        d.stroke([[x, 0], [x, 180]], 'cord', 4);
        d.poly([[x - 60, 250], [x + 60, 250], [x + 30, 180], [x - 30, 180]], 'shade');
        d.ellipse(x, 270, 120, 60, 'glow', { flat: true, opacity: 0.35 });
      }
    } },
  },
  floor: {
    name: 'Tiled floor', plane: 'ground', order: 0, at: [960, 1080],
    spec: { colors: { a: '#E7DED0', b: '#BBAE9C' }, bounds: [-1400, -460, 2800, 480], draw: (d) => {
      d.rect(-1400, -460, 2800, 480, 'a', { flat: true });
      for (let row = 0; row < 6; row++) for (let col = -14; col < 14; col++) if ((row + col) % 2) d.rect(col * 100, -460 + row * 80, 100, 80, 'b', { flat: true });
    } },
  },
};

export function kitPartsData(parts: KitParts = PODCAST_KIT_PARTS): Record<string, { name: string; plane: string; order: number; at: [number, number]; art: PartData; bounds: [number, number, number, number] }> {
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { name: v.name, plane: v.plane, order: v.order, at: v.at, art: propPart(v.spec), bounds: v.spec.bounds }]));
}
