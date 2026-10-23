/**
 * H1 props, second half: decor, building, outdoor, sports, music, party, medical, mystery, fantasy, travel, retail
 * and event props. Same units and conventions as props-catalog.ts. The party hat and backpack are worn, so they live
 * with the other worn props in accessories.ts.
 */
import type { PropSpec } from './props.js';
import { flick, spinPt, sway, wheel } from './props-catalog.js';

const bob = (y: number, x = 0): Record<string, [number, number]> => ({ 'anim.sin': [x, y] });
const rise = (y: number, x = 0): Record<string, [number, number]> => ({ 'anim.phase': [x, y] });

export const CATALOG_PROPS_B: Record<string, PropSpec> = {
  /* ---------------------------------------------------------------- decor */
  'large-plant': {
    colors: { pot: '#E8E2D6', leaf: '#4E8A5A', leaf2: '#3A6E48' }, bounds: [-170, -470, 340, 470],
    draw: (d) => {
      d.ground(170);
      const leaves: [number, number, number, string][] = [[-150, -300, 8, 'leaf2'], [140, -320, -8, 'leaf2'], [-110, -420, 10, 'leaf'], [100, -450, -10, 'leaf'], [0, -470, 6, 'leaf']];
      for (const [x, y, s, c] of leaves) d.poly([[0, -150], [x * 0.4, (y - 150) / 2, sway(s / 2)], [x, y, sway(s)], [x * 0.6, (y - 120) / 2, sway(s / 2)]], c, { smooth: 0.8 });
      d.poly([[-75, 0], [75, 0], [90, -160], [-90, -160]], 'pot', { id: 'pot' });
      d.shade([[30, -160], [90, -160], [75, 0], [30, 0]], 'pot');
    },
  },
  'flower-vase': {
    colors: { vase: '#3F6E8C', stem: '#4E8A5A', petal: '#E2537A', petal2: '#F2C24F' }, bounds: [-55, -170, 110, 170],
    draw: (d) => {
      for (const [x, y, c] of [[-35, -150, 'petal'], [0, -170, 'petal2'], [35, -145, 'petal']] as const) {
        d.stroke([[0, -70], [x, y]], 'stem', 4);
        d.ellipse(x, y, 16, 16, c, { d: sway(2) });
        d.ellipse(x, y, 6, 6, 'petal2', { flat: true, d: sway(2) });
      }
      d.poly([[-25, 0], [25, 0], [38, -45], [18, -80], [-18, -80], [-38, -45]], 'vase', { smooth: 0.5, id: 'v' });
      d.shade([[10, -80], [38, -45], [25, 0], [10, 0]], 'v');
    },
  },
  'picture-frame': {
    colors: { frame: '#B98A5E', sky: '#9FD0F0', hill: '#6FA86A', sun: '#F2C24F' }, bounds: [-80, -120, 160, 120], anchors: { image: [-64, -104, 128, 88] }, capabilities: ['image-slot'], depth: 'back',
    draw: (d) => {
      d.rect(-80, -120, 160, 120, 'frame', { r: 4 });
      d.rect(-64, -104, 128, 88, 'sky', { flat: true, id: 'img' });
      d.ellipse(30, -80, 12, 12, 'sun', { flat: true });
      d.poly([[-64, -16], [-64, -50], [-20, -70], [20, -45], [64, -60], [64, -16]], 'hill', { smooth: 0.5, flat: true, clip: 'img' });
    },
  },
  poster: {
    colors: { paper: '#F2E8D5', art: '#C8553D', art2: '#2F5E8C', pin: '#E3B23C' }, bounds: [-90, -250, 180, 250], anchors: { image: [-75, -235, 150, 160] }, capabilities: ['image-slot'], depth: 'back',
    draw: (d) => {
      d.rect(-90, -250, 180, 250, 'paper', { r: 2 });
      d.rect(-75, -235, 150, 160, 'art2', { flat: true });
      d.ellipse(0, -160, 50, 50, 'art', { flat: true });
      d.rect(-60, -60, 120, 16, 'art', { flat: true, r: 3 });
      d.rect(-45, -36, 90, 10, 'art2', { flat: true, r: 3 });
      for (const x of [-80, 80]) d.ellipse(x, -240, 5, 5, 'pin', { flat: true });
    },
  },
  'neon-sign': {
    colors: { board: '#1E1A24', tube: '#FF4FA4', glow: '#FF8AC6', off: '#5A3A4A' }, states: ['on', 'off'], bounds: [-140, -110, 280, 110], anchors: { text: [-120, -90, 240, 70] }, capabilities: ['text-slot', 'light'], depth: 'back',
    draw: (d) => {
      d.rect(-140, -110, 280, 110, 'board', { r: 10, flat: true });
      // OPEN, drawn as tube strokes.
      const word: [number, number][][] = [
        [[-110, -80], [-70, -80], [-70, -30], [-110, -30], [-110, -80]],
        [[-55, -30], [-55, -80], [-20, -80], [-20, -58], [-55, -58]],
        [[25, -80], [-5, -80], [-5, -30], [25, -30]], [[-5, -55], [20, -55]],
        [[40, -30], [40, -80], [80, -30], [80, -80]],
      ];
      for (const w of word) {
        d.stroke(w, 'glow', 14, { opacity: 0.35, when: { state: 'on' }, opParam: 'anim.flicker' });
        d.stroke(w, 'tube', 5, { when: { state: 'on' }, opParam: 'anim.flicker' });
        d.stroke(w, 'off', 5, { when: { state: 'off' } });
      }
      d.stroke([[100, -85], [120, -60], [100, -35]], 'tube', 5, { when: { state: 'on' } });
    },
  },
  rug: {
    colors: { rug: '#B4664A', border: '#E3B85C', motif: '#4F6E8C' }, bounds: [-260, -50, 520, 50], depth: 'ground',
    draw: (d) => {
      d.poly([[-230, -45], [230, -45], [260, 0], [-260, 0]], 'rug', { flat: true });
      d.poly([[-205, -38], [205, -38], [228, -7], [-228, -7]], 'border', { flat: true });
      d.poly([[-185, -32], [185, -32], [204, -13], [-204, -13]], 'rug', { flat: true });
      for (const x of [-100, 0, 100]) d.poly([[x - 30, -22], [x, -30], [x + 30, -22], [x, -14]], 'motif', { flat: true });
    },
  },
  curtains: {
    colors: { cloth: '#8C3A3A', rod: '#4A3326', sky: '#BFDDF2' }, states: ['open', 'closed'], bounds: [-200, -500, 400, 500], capabilities: ['open', 'close'], depth: 'back',
    draw: (d) => {
      d.rect(-150, -470, 300, 400, 'sky', { flat: true, when: { state: 'open' } });
      d.rect(-210, -500, 420, 10, 'rod', { r: 5 });
      d.poly([[-200, -490], [-120, -490], [-110, -60, sway(6)], [-205, -60, sway(4)]], 'cloth', { smooth: 0.15, when: { state: 'open' } });
      d.poly([[120, -490], [200, -490], [205, -60, sway(4)], [110, -60, sway(6)]], 'cloth', { smooth: 0.15, when: { state: 'open' } });
      d.poly([[-200, -490], [0, -490], [0, -60, sway(3)], [-205, -60, sway(5)]], 'cloth', { smooth: 0.1, when: { state: 'closed' } });
      d.poly([[0, -490], [200, -490], [205, -60, sway(5)], [0, -60, sway(3)]], 'cloth', { smooth: 0.1, when: { state: 'closed' } });
      for (const x of [-150, -100, -50, 50, 100, 150]) d.stroke([[x, -480], [x, -70, sway(4)]], 'cloth.shade', 3, { when: { state: 'closed' } });
    },
  },
  candle: {
    colors: { wax: '#F4EBD8', flame: '#FFB23C', core: '#FFF3C4', glow: '#FFE7A8' }, states: ['lit', 'out'], bounds: [-20, -110, 40, 110], anchors: { grip: [0, -30] }, capabilities: ['grip', 'light'],
    draw: (d) => {
      d.ellipse(0, -80, 40, 40, 'glow', { flat: true, opacity: 0.3, when: { state: 'lit' } });
      d.rect(-14, -70, 28, 70, 'wax', { r: 4 });
      d.stroke([[0, -70], [0, -78]], '#2E2621', 2);
      d.poly([[0, -108, flick(3)], [8, -86], [0, -76], [-8, -86]], 'flame', { smooth: 0.6, flat: true, when: { state: 'lit' } });
      d.ellipse(0, -84, 3, 6, 'core', { flat: true, when: { state: 'lit' } });
    },
  },
  fireplace: {
    colors: { brick: '#A0523C', mantel: '#6A4A36', soot: '#2A201C', fire: '#F08A2C', fire2: '#FFD15C', log: '#5A3A28' }, states: ['lit', 'out'], bounds: [-200, -340, 400, 340], capabilities: ['light'], depth: 'back', sounds: { 'state:lit': 'sfx.whoosh@1' },
    draw: (d) => {
      d.rect(-200, -320, 400, 320, 'brick', { id: 'b' });
      d.rect(-220, -340, 440, 28, 'mantel', { r: 4 });
      d.poly([[-120, 0], [120, 0], [120, -170], [0, -220], [-120, -170]], 'soot', { flat: true, smooth: 0.2 });
      d.rect(-80, -30, 160, 22, 'log', { r: 10 });
      d.poly([[-70, -30], [-50, -120, flick(8)], [-20, -70], [0, -160, flick(-10)], [25, -80], [55, -130, flick(8)], [70, -30]], 'fire', { smooth: 0.5, flat: true, when: { state: 'lit' } });
      d.poly([[-35, -30], [-15, -90, flick(-6)], [5, -60], [25, -100, flick(6)], [40, -30]], 'fire2', { smooth: 0.5, flat: true, when: { state: 'lit' } });
    },
  },
  aquarium: {
    colors: { glass: '#BFE3F2', water: '#5EA8D8', fish: '#F08A2C', fish2: '#F2C24F', sand: '#E3CF9A', stand: '#3A3330', bubble: '#FFFFFF', weed: '#3E8A5A' }, bounds: [-160, -300, 320, 300], capabilities: ['animated'],
    draw: (d) => {
      d.rect(-150, -110, 300, 110, 'stand', { r: 4 });
      d.rect(-160, -300, 320, 190, 'glass', { r: 6, opacity: 0.6 });
      d.rect(-150, -280, 300, 165, 'water', { flat: true, id: 'w', opacity: 0.85 });
      d.rect(-150, -140, 300, 25, 'sand', { flat: true });
      d.poly([[-110, -140], [-120, -200, sway(6)], [-100, -230, sway(10)], [-95, -140]], 'weed', { smooth: 0.6, flat: true });
      for (const [x, y, c, a] of [[-40, -210, 'fish', 50], [60, -170, 'fish2', -40]] as const) {
        d.ellipse(x, y, 18, 10, c, { flat: true, d: sway(a, 4) });
        d.poly([[x - 16, y, sway(a, 4)], [x - 30, y - 10, sway(a, 4)], [x - 30, y + 10, sway(a, 4)]], c, { flat: true });
      }
      for (const [x, k] of [[90, 0], [96, 60]] as const) d.ellipse(x, -140 - k, 5, 5, 'bubble', { flat: true, opacity: 0.8, d: rise(-130) });
    },
  },
  globe: {
    colors: { sea: '#4F8CC9', land: '#6FA86A', stand: '#8C6240' }, states: ['still', 'spinning'], bounds: [-70, -190, 140, 190], capabilities: ['spin'],
    draw: (d) => {
      d.ellipse(0, -6, 45, 8, 'stand');
      d.rect(-5, -50, 10, 46, 'stand', { flat: true });
      d.ellipse(0, -120, 62, 62, 'sea', { id: 'g' });
      d.poly([[-30, -150], [0, -165], [20, -140], [-5, -110], [-30, -120]], 'land', { smooth: 0.6, flat: true, clip: 'g', when: { state: 'still' } });
      d.poly([[10, -100], [35, -95], [30, -75], [10, -80]], 'land', { smooth: 0.6, flat: true, clip: 'g', when: { state: 'still' } });
      // Spinning: the continents slide across the face.
      const sl = { 'anim.phase': [-180, 0] as [number, number] };
      for (const off of [0, 180]) d.poly([[60 + off, -150, sl], [90 + off, -165, sl], [110 + off, -140, sl], [85 + off, -110, sl], [60 + off, -120, sl]], 'land', { smooth: 0.6, flat: true, clip: 'g', when: { state: 'spinning' } });
      d.stroke([[-8, -188], [52, -165], [74, -120], [52, -75], [-8, -52]], 'stand', 5, { smooth: true });
    },
  },
  'clock-radio': {
    colors: { body: '#2E2B2A', display: '#1A1414', digit: '#FF5A4D' }, states: ['on', 'alarm'], bounds: [-70, -60, 140, 60], capabilities: ['sound'], sounds: { 'state:alarm': 'sfx.error-beep@1' },
    draw: (d) => {
      d.rect(-70, -60, 140, 60, 'body', { r: 12 });
      d.rect(-50, -48, 75, 32, 'display', { r: 4, flat: true });
      for (const x of [-44, -30, -6, 8]) d.rect(x, -42, 10, 20, 'digit', { r: 2, flat: true, opacity: 0.9 });
      d.ellipse(-12, -37, 2, 2, 'digit', { flat: true, opParam: 'anim.fast' });
      d.ellipse(-12, -27, 2, 2, 'digit', { flat: true, opParam: 'anim.fast' });
      d.rect(-50, -48, 75, 32, 'digit', { r: 4, flat: true, opacity: 0.3, opParam: 'anim.fast', when: { state: 'alarm' } });
      for (let i = 0; i < 4; i++) d.rect(35, -48 + i * 9, 25, 4, 'display', { flat: true });
    },
  },
  mirror: {
    colors: { frame: '#C9A15B', glass: '#D6E6EE' }, bounds: [-75, -200, 150, 200], depth: 'back',
    draw: (d) => {
      d.ellipse(0, -100, 75, 100, 'frame');
      d.ellipse(0, -100, 62, 87, 'glass', { flat: true, id: 'g' });
      d.poly([[-50, -140], [-20, -170], [-5, -160], [-40, -120]], '#FFFFFF', { flat: true, opacity: 0.5, clip: 'g' });
    },
  },

  /* ---------------------------------------------------------------- building */
  window: {
    colors: { frame: '#F4F2EC', sky: '#9FD0F0', cloud: '#FFFFFF', sill: '#D9D3C4' }, states: ['closed', 'open'], bounds: [-130, -300, 260, 300], anchors: { view: [-110, -280, 220, 260] }, capabilities: ['open', 'close', 'weather-view'], depth: 'back',
    draw: (d) => {
      d.rect(-130, -300, 260, 290, 'frame', { r: 4 });
      d.rect(-115, -285, 230, 260, 'sky', { flat: true, id: 'v' });
      d.ellipse(-40, -220, 40, 16, 'cloud', { flat: true, d: sway(30), clip: 'v' });
      d.ellipse(50, -150, 30, 12, 'cloud', { flat: true, d: sway(-20), clip: 'v' });
      d.rect(-5, -285, 10, 260, 'frame', { flat: true, when: { state: 'closed' } });
      d.rect(-115, -160, 230, 8, 'frame', { flat: true, when: { state: 'closed' } });
      d.poly([[-115, -285], [-160, -300], [-160, -10], [-115, -25]], 'frame', { when: { state: 'open' } });
      d.poly([[115, -285], [160, -300], [160, -10], [115, -25]], 'frame', { when: { state: 'open' } });
      d.rect(-145, -14, 290, 14, 'sill', { r: 3 });
    },
  },
  'light-switch': {
    colors: { plate: '#F4F2EC', toggle: '#D9D3C4' }, states: ['on', 'off'], bounds: [-20, -34, 40, 34], anchors: { press: [0, -17] }, capabilities: ['press', 'controls-lights'], depth: 'back', sounds: { 'state:on': 'sfx.mouse-click@1', 'state:off': 'sfx.mouse-click@1' },
    draw: (d) => {
      d.rect(-20, -34, 40, 34, 'plate', { r: 4 });
      d.rect(-7, -28, 14, 12, 'toggle', { r: 2, when: { state: 'on' } });
      d.rect(-7, -18, 14, 12, 'toggle', { r: 2, when: { state: 'off' } });
    },
  },
  stairs: {
    colors: { step: '#B98D62', rail: '#4A3326', riser: '#8C6240' }, bounds: [-200, -300, 400, 300], anchors: { bottom: [-200, 0], top: [200, -300] }, capabilities: ['walk-path'],
    draw: (d) => {
      for (let i = 0; i < 6; i++) {
        d.rect(-200 + i * 67, -50 * (i + 1), 400 - i * 67, 50, i % 2 ? 'riser' : 'step', { flat: true });
        d.rect(-200 + i * 67, -50 * (i + 1), 400 - i * 67, 8, 'step', { flat: true });
      }
      d.stroke([[-200, -140], [200, -440]], 'rail', 8);
      for (let i = 0; i < 6; i++) d.stroke([[-180 + i * 67, -50 * (i + 1)], [-180 + i * 67, -50 * (i + 1) - 100]], 'rail', 4);
    },
  },
  'elevator-doors': {
    colors: { frame: '#9AA0A8', door: '#C9CED6', inside: '#3A3D44', light: '#F2C24F' }, states: ['closed', 'open'], bounds: [-140, -480, 280, 480], capabilities: ['open', 'close'], depth: 'back', sounds: { 'state:open': 'sfx.notification-chime@1' },
    draw: (d) => {
      d.rect(-140, -480, 280, 480, 'frame', { r: 3 });
      d.rect(-120, -420, 240, 420, 'inside', { flat: true });
      d.rect(-120, -420, 119, 420, 'door', { when: { state: 'closed' } });
      d.rect(1, -420, 119, 420, 'door', { when: { state: 'closed' } });
      d.rect(-120, -420, 25, 420, 'door', { when: { state: 'open' } });
      d.rect(95, -420, 25, 420, 'door', { when: { state: 'open' } });
      d.poly([[-10, -440], [10, -440], [0, -460]], 'light', { flat: true });
    },
  },

  /* ---------------------------------------------------------------- outdoor */
  fence: {
    colors: { wood: '#C9A47A' }, bounds: [-260, -200, 520, 200], depth: 'back',
    draw: (d) => {
      d.rect(-260, -150, 520, 16, 'wood', { flat: true });
      d.rect(-260, -70, 520, 16, 'wood', { flat: true });
      for (let x = -250; x <= 230; x += 40) d.poly([[x, 0], [x + 26, 0], [x + 26, -180], [x + 13, -200], [x, -180]], 'wood');
    },
  },
  'street-lamp': {
    colors: { metal: '#2E3236', glass: '#FFF3C4', glow: '#FFE7A8' }, states: ['on', 'off'], bounds: [-90, -720, 180, 720], capabilities: ['light'], depth: 'back',
    draw: (d) => {
      d.ground(120);
      d.poly([[-30, 0], [30, 0], [18, -60], [-18, -60]], 'metal');
      d.rect(-8, -640, 16, 590, 'metal', { r: 4 });
      d.ellipse(0, -670, 110, 110, 'glow', { flat: true, opacity: 0.25, when: { state: 'on' } });
      d.poly([[-38, -640], [38, -640], [28, -700], [-28, -700]], 'glass', { when: { state: 'on' } });
      d.poly([[-38, -640], [38, -640], [28, -700], [-28, -700]], 'metal', { when: { state: 'off' }, opacity: 0.6 });
      d.poly([[-45, -700], [45, -700], [0, -725]], 'metal');
    },
  },
  'park-bench': {
    colors: { wood: '#9C6B45', metal: '#2F3A33' }, bounds: [-220, -220, 440, 220], anchors: { seat: [-100, -110], seatR: [100, -110] }, capabilities: ['seat'],
    draw: (d) => {
      d.ground(420);
      for (const x of [-185, 185]) {
        d.stroke([[x, 0], [x, -110], [x + (x < 0 ? -10 : 10), -220]], 'metal', 10);
        d.stroke([[x - 25, 0], [x, -60]], 'metal', 8);
      }
      for (const y of [-210, -180, -150]) d.rect(-210, y, 420, 18, 'wood', { r: 4 });
      d.rect(-215, -120, 430, 18, 'wood', { r: 4 });
      d.rect(-215, -100, 430, 10, 'wood.shade', { flat: true });
    },
  },
  'bus-stop': {
    colors: { frame: '#3A3D44', glass: '#BFE3F2', sign: '#2F5E8C', seat: '#9AA0A8', text: '#FFFFFF' }, bounds: [-260, -520, 520, 520], anchors: { seat: [0, -110] }, capabilities: ['seat'], depth: 'back',
    draw: (d) => {
      d.ground(480);
      d.rect(-250, -420, 500, 300, 'glass', { flat: true, opacity: 0.5 });
      for (const x of [-250, 240]) d.rect(x, -440, 10, 440, 'frame', { flat: true });
      d.rect(-260, -450, 520, 30, 'frame', { r: 4 });
      d.rect(-150, -120, 300, 16, 'seat', { r: 4 });
      d.rect(180, -520, 60, 60, 'sign', { r: 30 });
      d.rect(196, -505, 28, 8, 'text', { flat: true, r: 2 });
      d.rect(196, -490, 28, 8, 'text', { flat: true, r: 2 });
    },
  },
  'traffic-light': {
    colors: { pole: '#2E3236', box: '#1E2024', red: '#E5484D', amber: '#F2B23C', green: '#46C46E', dim: '#3A3D44' }, states: ['cycle', 'red', 'amber', 'green'], bounds: [-50, -620, 100, 620], depth: 'back',
    draw: (d) => {
      d.ground(80);
      d.rect(-8, -460, 16, 460, 'pole', { r: 3 });
      d.rect(-40, -620, 80, 190, 'box', { r: 12 });
      const lamps = [['red', -585, 'anim.cycle0'], ['amber', -525, 'anim.cycle1'], ['green', -465, 'anim.cycle2']] as const;
      for (const [c, y, cyc] of lamps) {
        d.ellipse(0, y, 22, 22, 'dim', { flat: true });
        d.ellipse(0, y, 22, 22, c, { flat: true, opParam: cyc, when: { state: 'cycle' } });
        d.ellipse(0, y, 22, 22, c, { flat: true, when: { state: c } });
      }
    },
  },
  tree: {
    colors: { trunk: '#6A4A36', leaf: '#4E8A4A', leaf2: '#3A6E3E' }, bounds: [-260, -820, 520, 820], depth: 'back',
    draw: (d) => {
      d.ground(260);
      d.poly([[-40, 0], [40, 0], [28, -420], [-28, -420]], 'trunk');
      d.stroke([[0, -380], [-90, -480]], 'trunk', 16);
      d.stroke([[0, -420], [90, -520]], 'trunk', 14);
      d.ellipse(-120, -520, 140, 110, 'leaf2', { d: sway(6) });
      d.ellipse(120, -560, 140, 120, 'leaf2', { d: sway(8) });
      d.ellipse(0, -680, 180, 140, 'leaf', { d: sway(10) });
      d.ellipse(-60, -600, 120, 100, 'leaf', { d: sway(8) });
    },
  },
  bush: {
    colors: { leaf: '#4E8A4A', leaf2: '#3A6E3E' }, bounds: [-170, -180, 340, 180],
    draw: (d) => {
      d.ground(320);
      d.ellipse(-80, -70, 90, 70, 'leaf2', { d: sway(3) });
      d.ellipse(80, -75, 90, 75, 'leaf2', { d: sway(3) });
      d.ellipse(0, -110, 110, 75, 'leaf', { d: sway(5) });
    },
  },
  rock: {
    colors: { stone: '#8E8C88', moss: '#6F8C4A' }, bounds: [-120, -110, 240, 110], capabilities: ['seat'], anchors: { seat: [0, -95] },
    draw: (d) => {
      d.ground(230);
      d.poly([[-115, 0], [-100, -60], [-40, -105], [40, -100], [100, -55], [118, 0]], 'stone', { smooth: 0.5, id: 'r' });
      d.shade([[20, -100], [100, -55], [118, 0], [30, 0]], 'r');
      d.poly([[-60, -90], [-20, -104], [20, -100], [-10, -88]], 'moss', { smooth: 0.6, flat: true });
    },
  },
  mailbox: {
    colors: { box: '#2F5E8C', post: '#6A4A36', flag: '#E5484D', mail: '#FFFFFF' }, states: ['closed', 'open'], bounds: [-70, -230, 150, 230], capabilities: ['open', 'close'], sounds: { 'state:open': 'sfx.door-open@1' },
    draw: (d) => {
      d.ground(80);
      d.rect(-8, -150, 16, 150, 'post', { flat: true });
      d.poly([[-60, -150], [60, -150], [60, -195], [0, -230], [-60, -195]], 'box', { smooth: 0.3 });
      d.rect(-50, -200, 30, 40, 'mail', { flat: true, when: { state: 'open' } });
      d.poly([[-60, -150], [-95, -165], [-95, -210], [-60, -195]], 'box', { when: { state: 'open' } });
      d.rect(62, -215, 6, 50, 'flag', { flat: true, when: { state: 'closed' } });
      d.rect(62, -215, 30, 16, 'flag', { flat: true, when: { state: 'closed' } });
      d.rect(62, -180, 40, 8, 'flag', { flat: true, when: { state: 'open' } });
    },
  },
  'trash-can': {
    colors: { can: '#5E7A6A', lid: '#4A6656', bag: '#2E2B2A' }, states: ['closed', 'open'], bounds: [-70, -210, 140, 210], capabilities: ['open', 'close'], sounds: { 'state:closed': 'sfx.thud@1' },
    draw: (d) => {
      d.ground(130);
      d.poly([[-55, 0], [55, 0], [65, -170], [-65, -170]], 'can', { id: 'c' });
      for (const x of [-30, 0, 30]) d.stroke([[x, -20], [x * 1.15, -150]], 'can.shade', 3);
      d.rect(-68, -185, 136, 18, 'lid', { r: 6, when: { state: 'closed' } });
      d.rect(-10, -195, 20, 10, 'lid', { r: 3, when: { state: 'closed' } });
      d.ellipse(0, -170, 60, 10, 'bag', { flat: true, when: { state: 'open' } });
      d.poly([[-68, -175], [-100, -205], [-90, -212], [-58, -182]], 'lid', { when: { state: 'open' } });
    },
  },
  bicycle: {
    colors: { frame: '#C8453D', tyre: '#1E1F22', rim: '#C9CED6', seat: '#2E2B2A' }, states: ['parked', 'riding'], bounds: [-200, -260, 400, 260], anchors: { seat: [-40, -230], grip: [110, -250], ride: [-40, -230] }, capabilities: ['ride', 'walk-with'], sounds: { ring: 'sfx.bicycle-bell@1' },
    draw: (d) => {
      wheel(d, -130, -70, 70, 'tyre', 'rim', ['riding'], ['parked']);
      wheel(d, 130, -70, 70, 'tyre', 'rim', ['riding'], ['parked']);
      d.stroke([[-130, -70], [-30, -70], [-50, -210], [-130, -70]], 'frame', 8);
      d.stroke([[-30, -70], [100, -190], [-50, -190]], 'frame', 8);
      d.stroke([[100, -190], [130, -70]], 'frame', 8);
      d.stroke([[100, -190], [110, -250], [85, -255]], 'frame', 6);
      d.rect(-75, -240, 60, 14, 'seat', { r: 7 });
      d.ellipse(-30, -70, 14, 14, 'rim');
    },
  },
  car: {
    colors: { body: '#3F7CC9', window: '#BFE3F2', tyre: '#1E1F22', rim: '#C9CED6', light: '#FFF3C4' }, states: ['parked', 'driving', 'door-open'], bounds: [-560, -380, 1120, 380], anchors: { driver: [-60, -170], door: [-60, -200] }, capabilities: ['enter', 'drive'], sounds: { horn: 'sfx.car-horn@1', 'state:driving': 'sfx.car-pass@1', 'state:door-open': 'sfx.door-open@1' },
    draw: (d) => {
      d.ground(1000);
      d.poly([[-540, -60], [-550, -180], [-440, -210], [-300, -360], [220, -360], [380, -220], [540, -190], [550, -60]], 'body', { smooth: 0.12, id: 'b' });
      d.poly([[-270, -330], [-20, -330], [-20, -215], [-380, -215]], 'window', { flat: true });
      d.poly([[10, -330], [200, -330], [320, -215], [10, -215]], 'window', { flat: true });
      d.shade([[-550, -110], [550, -110], [550, -60], [-540, -60]], 'b');
      d.rect(510, -170, 30, 30, 'light', { r: 8, flat: true });
      d.poly([[-60, -320], [-170, -300], [-170, -70], [-60, -80]], 'body', { when: { state: 'door-open' } });
      for (const x of [-330, 330]) wheel(d, x, -70, 72, 'tyre', 'rim', ['driving'], ['parked', 'door-open']);
    },
  },
  scooter: {
    colors: { deck: '#2E3236', stem: '#46C46E', tyre: '#1E1F22', rim: '#C9CED6' }, states: ['parked', 'riding'], bounds: [-120, -330, 240, 330], anchors: { ride: [-20, -40], grip: [95, -320] }, capabilities: ['ride'],
    draw: (d) => {
      wheel(d, -90, -30, 30, 'tyre', 'rim', ['riding'], ['parked']);
      wheel(d, 95, -30, 30, 'tyre', 'rim', ['riding'], ['parked']);
      d.rect(-100, -55, 180, 16, 'deck', { r: 6 });
      d.stroke([[70, -45], [95, -30]], 'deck', 8);
      d.stroke([[95, -30], [80, -320]], 'stem', 10);
      d.stroke([[50, -320], [110, -320]], 'deck', 10);
    },
  },
  umbrella: {
    colors: { canopy: '#C8453D', canopy2: '#F2E8D5', handle: '#3A2E28' }, states: ['closed', 'open'], bounds: [-160, -340, 320, 340], anchors: { grip: [0, -40] }, capabilities: ['grip', 'open', 'close'], sounds: { 'state:open': 'sfx.whoosh@1' },
    draw: (d) => {
      d.stroke([[0, -20], [0, -320]], 'handle', 5, { when: { state: 'open' } });
      d.stroke([[0, -20], [8, 0], [20, -4]], 'handle', 6, { smooth: true });
      d.poly([[-160, -230], [-120, -290], [0, -330], [120, -290], [160, -230], [107, -245], [53, -230], [0, -245], [-53, -230], [-107, -245]], 'canopy', { smooth: 0.2, when: { state: 'open' } });
      d.poly([[-53, -230], [0, -330], [53, -230], [0, -245]], 'canopy2', { smooth: 0.1, flat: true, when: { state: 'open' } });
      d.poly([[0, -330], [14, -250], [8, -80], [-8, -80], [-14, -250]], 'canopy', { when: { state: 'closed' } });
      d.stroke([[0, -80], [0, -20]], 'handle', 5, { when: { state: 'closed' } });
    },
  },

  /* ---------------------------------------------------------------- sports */
  football: {
    colors: { ball: '#FFFFFF', patch: '#1E1F22' }, states: ['still', 'rolling'], bounds: [-36, -72, 72, 72], anchors: { grip: [0, -36] }, capabilities: ['grip', 'throw', 'catch', 'kick'], sounds: { kick: 'sfx.thud@1', catch: 'sfx.thud@1' },
    draw: (d) => {
      d.ellipse(0, -36, 36, 36, 'ball', { id: 'b' });
      d.poly([[0, -50], [12, -42], [8, -28], [-8, -28], [-12, -42]], 'patch', { flat: true, when: { state: 'still' } });
      for (const a of [0, 1.26, 2.51, 3.77, 5.03]) {
        const p = [Math.sin(a) * 30, -36 - Math.cos(a) * 30] as const;
        d.ellipse(p[0], p[1], 7, 7, 'patch', { flat: true, clip: 'b', when: { state: 'still' } });
        d.ellipse(Math.sin(a) * 28, -36 - Math.cos(a) * 28, 7, 7, 'patch', { flat: true, clip: 'b', when: { state: 'rolling' }, d: { 'anim.spinC1': [Math.sin(a) * 28, -Math.cos(a) * 28], 'anim.spinS': [Math.cos(a) * 28, Math.sin(a) * 28] } });
      }
    },
  },
  basketball: {
    colors: { ball: '#E07A2C', seam: '#2E1E14' }, states: ['still', 'bouncing'], bounds: [-36, -160, 72, 160], anchors: { grip: [0, -36] }, capabilities: ['grip', 'bounce', 'throw'], sounds: { bounce: 'sfx.thud@1' },
    draw: (d) => {
      d.ellipse(0, -8, 30, 6, 'seam', { flat: true, opacity: 0.15 });
      for (const [st, b] of [['still', {}], ['bouncing', bob(-110)]] as const) {
        d.ellipse(0, -36, 36, 36, 'ball', { when: { state: st }, d: b });
        d.ellipse(0, -36, 2, 36, 'seam', { flat: true, when: { state: st }, d: b });
        d.ellipse(0, -36, 36, 2, 'seam', { flat: true, when: { state: st }, d: b });
      }
    },
  },
  'tennis-racket': {
    colors: { frame: '#2F5E8C', strings: '#E8E2D6', grip: '#2E2B2A' }, bounds: [-40, -170, 80, 170], anchors: { grip: [0, -20] }, capabilities: ['grip', 'swing'], sounds: { swing: 'sfx.swish@1', hit: 'sfx.bonk@1' },
    draw: (d) => {
      d.rect(-6, -60, 12, 60, 'grip', { r: 4 });
      d.stroke([[0, -60], [-20, -85]], 'frame', 6);
      d.stroke([[0, -60], [20, -85]], 'frame', 6);
      d.ellipse(0, -125, 36, 46, 'frame');
      d.ellipse(0, -125, 30, 40, 'strings', { flat: true });
      for (let i = -2; i <= 2; i++) {
        d.stroke([[i * 10, -160], [i * 10, -90]], 'frame.shade', 1);
        d.stroke([[-28, -125 + i * 12], [28, -125 + i * 12]], 'frame.shade', 1);
      }
    },
  },
  dumbbell: {
    colors: { weight: '#2E3236', bar: '#B8BDC4' }, bounds: [-60, -40, 120, 40], anchors: { grip: [0, -20] }, capabilities: ['grip', 'lift'], sounds: { contact: 'sfx.thud@1' },
    draw: (d) => {
      d.rect(-35, -24, 70, 8, 'bar', { r: 3 });
      d.rect(-60, -40, 26, 40, 'weight', { r: 6 });
      d.rect(34, -40, 26, 40, 'weight', { r: 6 });
    },
  },
  'yoga-mat': {
    colors: { mat: '#7A5EA8' }, states: ['flat', 'rolled'], bounds: [-200, -40, 400, 40], depth: 'ground', capabilities: ['lie'], anchors: { lie: [0, -10] },
    draw: (d) => {
      d.poly([[-180, -16], [180, -16], [200, 0], [-200, 0]], 'mat', { when: { state: 'flat' } });
      d.ellipse(0, -20, 26, 20, 'mat', { when: { state: 'rolled' } });
      d.rect(-80, -40, 160, 40, 'mat', { r: 20, when: { state: 'rolled' } });
    },
  },
  skateboard: {
    colors: { deck: '#E3B23C', tyre: '#F4F2EC', truck: '#9AA0A8' }, states: ['still', 'rolling'], bounds: [-110, -40, 220, 40], anchors: { ride: [0, -26] }, capabilities: ['ride'],
    draw: (d) => {
      d.poly([[-110, -36], [-95, -26], [95, -26], [110, -36], [100, -20], [-100, -20]], 'deck', { smooth: 0.3 });
      for (const x of [-70, 70]) {
        d.rect(x - 14, -20, 28, 6, 'truck', { flat: true });
        d.ellipse(x, -9, 9, 9, 'tyre', { when: { state: 'still' } });
        d.ellipse(x, -9, 9, 9, 'tyre', { when: { state: 'rolling' } });
        d.stroke([spinPt(x, -9, 6, 0), spinPt(x, -9, 6, Math.PI)], 'truck', 2, { when: { state: 'rolling' } });
      }
    },
  },

  /* ---------------------------------------------------------------- music */
  guitar: {
    colors: { body: '#C27A3A', neck: '#5A3A28', hole: '#2E1E14', strings: '#E8E2D6' }, bounds: [-75, -280, 150, 280], anchors: { grip: [0, -230], body: [0, -80] }, capabilities: ['grip', 'play'],
    draw: (d) => {
      d.rect(-10, -275, 20, 170, 'neck', { r: 3 });
      d.rect(-14, -290, 28, 24, 'neck', { r: 4 });
      d.poly([[-70, -30], [-55, -110], [-40, -130], [40, -130], [55, -110], [70, -30], [40, 0], [-40, 0]], 'body', { smooth: 0.6, id: 'b' });
      d.ellipse(0, -90, 18, 18, 'hole', { flat: true });
      d.rect(-20, -40, 40, 8, 'neck', { flat: true });
      for (const x of [-6, -2, 2, 6]) d.stroke([[x, -275], [x, -36]], 'strings', 1);
    },
  },
  'keyboard-instrument': {
    colors: { body: '#1E1F22', white: '#FAFAFA', black: '#1E1F22', stand: '#5A5A60' }, bounds: [-200, -230, 400, 230], anchors: { keys: [0, -200] }, capabilities: ['play'],
    draw: (d) => {
      d.ground(320);
      d.stroke([[-150, -170], [150, 0]], 'stand', 8);
      d.stroke([[150, -170], [-150, 0]], 'stand', 8);
      d.rect(-200, -230, 400, 60, 'body', { r: 8 });
      for (let i = 0; i < 24; i++) d.rect(-188 + i * 15.6, -205, 14, 30, 'white', { flat: true, r: 1 });
      for (let i = 0; i < 23; i++) if (![2, 6, 9, 13, 16, 20].includes(i % 21)) d.rect(-178 + i * 15.6, -205, 8, 18, 'black', { flat: true });
    },
  },
  'drum-kit': {
    colors: { shell: '#C8453D', head: '#F4F2EC', metal: '#C9CED6', cymbal: '#E3B23C' }, bounds: [-230, -300, 460, 300], anchors: { player: [0, -120] }, capabilities: ['play'], sounds: { hit: 'sfx.thud@1', crash: 'sfx.crash@1' },
    draw: (d) => {
      d.ground(420);
      d.stroke([[-180, -230], [-180, 0]], 'metal', 4);
      d.stroke([[190, -260], [190, 0]], 'metal', 4);
      d.ellipse(-180, -235, 60, 8, 'cymbal');
      d.ellipse(190, -265, 70, 9, 'cymbal');
      d.rect(-150, -150, 90, 60, 'shell', { r: 6 });
      d.ellipse(-105, -150, 45, 8, 'head', { flat: true });
      d.rect(60, -170, 80, 60, 'shell', { r: 6 });
      d.ellipse(100, -170, 40, 8, 'head', { flat: true });
      d.ellipse(0, -90, 90, 90, 'shell');
      d.ellipse(0, -90, 70, 70, 'head', { flat: true });
    },
  },
  violin: {
    colors: { body: '#9C4A22', neck: '#2E1E14', strings: '#E8E2D6', bow: '#5A3A28' }, bounds: [-50, -230, 140, 230], anchors: { grip: [0, -200], chin: [0, -20] }, capabilities: ['grip', 'play'],
    draw: (d) => {
      d.rect(-6, -230, 12, 110, 'neck', { r: 3 });
      d.poly([[-38, -10], [-45, -50], [-28, -70], [-40, -100], [-30, -125], [30, -125], [40, -100], [28, -70], [45, -50], [38, -10], [0, 0]], 'body', { smooth: 0.6 });
      d.stroke([[-12, -80], [-16, -50]], 'neck', 2);
      d.stroke([[12, -80], [16, -50]], 'neck', 2);
      for (const x of [-3, 1, 3]) d.stroke([[x, -225], [x, -20]], 'strings', 0.8);
      d.stroke([[90, -200], [-30, -40]], 'bow', 3);
    },
  },
  'microphone-stand': {
    colors: { metal: '#2C2A2B', grille: '#9AA0A8' }, bounds: [-70, -380, 140, 380], anchors: { mic: [0, -365] },
    draw: (d) => {
      d.ground(130);
      d.ellipse(0, -6, 60, 10, 'metal');
      d.rect(-5, -340, 10, 335, 'metal', { r: 3 });
      d.rect(-10, -345, 20, 12, 'metal', { r: 3 });
      d.rect(-12, -385, 24, 44, 'grille', { r: 12 });
    },
  },

  /* ---------------------------------------------------------------- party */
  'gift-box': {
    colors: { box: '#4F7CFF', ribbon: '#F2C24F', inside: '#2F4A99' }, states: ['closed', 'open'], bounds: [-60, -140, 120, 140], anchors: { grip: [0, -50] }, capabilities: ['grip', 'open'], sounds: { 'state:open': 'sfx.paper-rustle@1' },
    draw: (d) => {
      d.rect(-55, -90, 110, 90, 'box');
      d.rect(-8, -90, 16, 90, 'ribbon', { flat: true });
      d.rect(-62, -110, 124, 24, 'box', { r: 3, when: { state: 'closed' } });
      d.rect(-8, -110, 16, 24, 'ribbon', { flat: true, when: { state: 'closed' } });
      d.ellipse(-16, -118, 16, 9, 'ribbon', { when: { state: 'closed' } });
      d.ellipse(16, -118, 16, 9, 'ribbon', { when: { state: 'closed' } });
      d.ellipse(0, -90, 52, 7, 'inside', { flat: true, when: { state: 'open' } });
      d.poly([[-62, -110], [62, -120], [64, -140], [-60, -132]], 'box', { when: { state: 'open' } });
    },
  },
  balloons: {
    colors: { b1: '#E5484D', b2: '#4F7CFF', b3: '#F2C24F', string: '#8A8378' }, bounds: [-90, -420, 180, 420], anchors: { grip: [0, -10] }, capabilities: ['grip'],
    draw: (d) => {
      const bs: [number, number, string, number][] = [[-50, -340, 'b1', 8], [40, -370, 'b2', -10], [0, -300, 'b3', 6]];
      for (const [x, y, , s] of bs) d.stroke([[0, -10], [x * 0.5, (y - 10) / 2], [x, y + 50, bob(s, s / 3)]], 'string', 1.5, { smooth: true });
      for (const [x, y, c, s] of bs) {
        d.ellipse(x, y, 40, 50, c, { d: bob(s, s / 3) });
        d.poly([[x - 6, y + 56, bob(s, s / 3)], [x + 6, y + 56, bob(s, s / 3)], [x, y + 48, bob(s, s / 3)]], c, { flat: true });
      }
    },
  },
  'birthday-cake': {
    colors: { cake: '#F4D7C4', icing: '#F6A6C1', plate: '#FFFFFF', candle: '#4F7CFF', flame: '#FFB23C' }, states: ['lit', 'blown-out'], bounds: [-90, -170, 180, 170], capabilities: ['blow-out'], sounds: { 'state:blown-out': 'sfx.whoosh@1' },
    draw: (d) => {
      d.ellipse(0, -8, 90, 12, 'plate');
      d.rect(-75, -100, 150, 90, 'cake', { r: 6 });
      d.poly([[-78, -104], [78, -104], [78, -80], [55, -70], [35, -84], [10, -68], [-15, -84], [-40, -70], [-62, -82], [-78, -74]], 'icing', { smooth: 0.4 });
      for (const x of [-40, 0, 40]) {
        d.rect(x - 4, -140, 8, 38, 'candle', { r: 2 });
        d.poly([[x, -168, flick(2)], [x + 6, -150], [x, -142], [x - 6, -150]], 'flame', { smooth: 0.6, flat: true, when: { state: 'lit' } });
        d.stroke([[x, -144], [x + 4, -160], [x - 2, -175]], '#B8BDC4', 2, { smooth: true, opacity: 0.6, when: { state: 'blown-out' } });
      }
    },
  },
  'confetti-cannon': {
    colors: { tube: '#7A5EA8', band: '#F2C24F', c1: '#E5484D', c2: '#4F7CFF', c3: '#46C46E' }, states: ['ready', 'fired'], bounds: [-40, -300, 160, 300], anchors: { grip: [0, -30] }, capabilities: ['grip', 'fire'], sounds: { 'state:fired': 'sfx.pop@1', fire: 'sfx.pop@1' },
    draw: (d) => {
      d.poly([[-14, 0], [14, 0], [30, -130], [-30, -130]], 'tube');
      d.rect(-26, -100, 52, 12, 'band', { flat: true });
      const bits: [number, number, string][] = [[-20, -200, 'c1'], [30, -230, 'c2'], [70, -190, 'c3'], [0, -270, 'c3'], [50, -280, 'c1'], [-40, -250, 'c2'], [90, -250, 'c1']];
      for (const [x, y, c] of bits) d.rect(x, y, 10, 6, c, { flat: true, when: { state: 'fired' } });
    },
  },

  /* ---------------------------------------------------------------- medical */
  'hospital-bed': {
    colors: { frame: '#C9CED6', sheet: '#EEF4F8', blanket: '#8FB8D9', wheel: '#2E3236' }, bounds: [-290, -260, 580, 260], anchors: { lie: [0, -150], seat: [130, -145], head: [-200, -185] }, capabilities: ['lie', 'seat'],
    draw: (d) => {
      d.ground(560);
      for (const x of [-250, 250]) d.ellipse(x, -14, 14, 14, 'wheel');
      d.rect(-260, -60, 520, 30, 'frame', { r: 6 });
      d.rect(-280, -260, 18, 230, 'frame', { r: 6 });
      d.rect(262, -200, 18, 170, 'frame', { r: 6 });
      d.poly([[-262, -150], [-180, -200], [-120, -150], [262, -150], [262, -90], [-262, -90]], 'sheet', { smooth: 0.15 });
      d.poly([[-80, -155], [262, -155], [262, -95], [-80, -95]], 'blanket', { smooth: 0.1 });
      d.stroke([[-60, -170], [150, -170]], 'frame', 6);
    },
  },
  'first-aid-kit': {
    colors: { box: '#E5484D', cross: '#FFFFFF', inside: '#F4F2EC', item: '#4F7CFF' }, states: ['closed', 'open'], bounds: [-70, -130, 140, 130], anchors: { grip: [0, -100] }, capabilities: ['grip', 'open', 'close'],
    draw: (d) => {
      d.stroke([[-20, -90], [-20, -105], [20, -105], [20, -90]], 'box', 7);
      d.rect(-70, -90, 140, 90, 'box', { r: 10 });
      d.rect(-10, -70, 20, 50, 'cross', { flat: true, when: { state: 'closed' } });
      d.rect(-25, -55, 50, 20, 'cross', { flat: true, when: { state: 'closed' } });
      d.rect(-60, -80, 120, 70, 'inside', { flat: true, when: { state: 'open' } });
      d.rect(-50, -60, 40, 14, 'item', { r: 4, flat: true, when: { state: 'open' } });
      d.rect(10, -50, 40, 30, 'cross', { r: 4, when: { state: 'open' } });
      d.poly([[-70, -90], [70, -90], [60, -130], [-60, -130]], 'box', { when: { state: 'open' } });
    },
  },
  'pill-bottle': {
    colors: { bottle: '#E8962C', cap: '#FFFFFF', label: '#FFFFFF' }, bounds: [-22, -70, 44, 70], anchors: { grip: [0, -30] }, capabilities: ['grip', 'open'],
    draw: (d) => {
      d.rect(-20, -58, 40, 58, 'bottle', { r: 6, opacity: 0.9 });
      d.rect(-20, -44, 40, 26, 'label', { flat: true });
      d.rect(-22, -70, 44, 14, 'cap', { r: 3 });
    },
  },

  /* ---------------------------------------------------------------- mystery */
  'magnifying-glass': {
    colors: { rim: '#3A3330', lens: '#CFE8F2', handle: '#6A4A36' }, bounds: [-40, -150, 80, 150], anchors: { grip: [0, -30] }, capabilities: ['grip', 'inspect'],
    draw: (d) => {
      d.rect(-7, -70, 14, 70, 'handle', { r: 6 });
      d.ellipse(0, -110, 40, 40, 'rim');
      d.ellipse(0, -110, 32, 32, 'lens', { flat: true, opacity: 0.85 });
      d.poly([[-20, -125], [-8, -136], [-2, -132], [-16, -118]], '#FFFFFF', { flat: true, opacity: 0.7 });
    },
  },
  'detective-notebook': {
    colors: { cover: '#3A2E28', band: '#2E1E14', page: '#F2E8D5' }, bounds: [-35, -90, 70, 90], anchors: { grip: [0, -40] }, capabilities: ['grip', 'write'], sounds: { write: 'sfx.paper-rustle@1' },
    draw: (d) => {
      d.rect(-35, -90, 70, 90, 'cover', { r: 4 });
      d.rect(30, -90, 5, 90, 'page', { flat: true });
      d.rect(-35, -50, 70, 6, 'band', { flat: true });
    },
  },
  'evidence-board': {
    colors: { cork: '#C79C6A', frame: '#6A4A36', photo: '#F4F2EC', img: '#7A8C9C', string: '#D9303A', pin: '#E5484D', note: '#F7E36A' }, bounds: [-230, -470, 460, 470], anchors: { image1: [-190, -430, 80, 70], image2: [60, -440, 80, 70], image3: [-60, -300, 80, 70] }, capabilities: ['image-slot'], depth: 'back',
    draw: (d) => {
      d.ground(380);
      for (const x of [-180, 180]) d.stroke([[x, -150], [x * 1.1, 0]], 'frame', 8);
      d.rect(-230, -470, 460, 330, 'frame', { r: 4 });
      d.rect(-215, -455, 430, 300, 'cork', { flat: true });
      const pins: [number, number][] = [[-150, -425], [100, -435], [-20, -295], [140, -245]];
      d.stroke([pins[0]!, pins[2]!, pins[1]!, pins[3]!, pins[2]!], 'string', 2);
      for (const [x, y] of [[-190, -430], [60, -440], [-60, -300]] as const) {
        d.rect(x, y, 80, 70, 'photo', { flat: true });
        d.rect(x + 6, y + 6, 68, 46, 'img', { flat: true });
      }
      d.rect(110, -260, 60, 50, 'note', { flat: true });
      for (const [x, y] of pins) d.ellipse(x, y, 5, 5, 'pin', { flat: true });
    },
  },
  flashlight: {
    colors: { body: '#2E3236', lens: '#FFF3C4', beam: '#FFF7D6' }, states: ['off', 'on'], bounds: [-20, -110, 280, 110], anchors: { grip: [0, -55] }, capabilities: ['grip', 'light', 'switch'], sounds: { 'state:on': 'sfx.mouse-click@1', 'state:off': 'sfx.mouse-click@1' },
    draw: (d) => {
      d.poly([[40, -70], [280, -110], [280, 0], [40, -40]], 'beam', { flat: true, opacity: 0.35, when: { state: 'on' } });
      d.rect(-20, -66, 50, 22, 'body', { r: 6 });
      d.poly([[28, -72], [44, -76], [44, -34], [28, -38]], 'body');
      d.rect(44, -74, 4, 38, 'lens', { flat: true });
    },
  },
  key: {
    colors: { metal: '#D9B25F' }, bounds: [-14, -70, 28, 70], anchors: { grip: [0, -55] }, capabilities: ['pinch', 'unlock'],
    draw: (d) => {
      d.ellipse(0, -55, 14, 14, 'metal');
      d.ellipse(0, -55, 6, 6, 'metal.shade', { flat: true });
      d.rect(-3, -42, 6, 42, 'metal', { flat: true });
      d.rect(3, -14, 8, 5, 'metal', { flat: true });
      d.rect(3, -6, 6, 5, 'metal', { flat: true });
    },
  },

  /* ---------------------------------------------------------------- fantasy */
  'treasure-chest': {
    colors: { wood: '#8C5A34', metal: '#D9B25F', gold: '#F2C94C', glow: '#FFE89A' }, states: ['closed', 'open'], bounds: [-110, -200, 220, 200], capabilities: ['open', 'close'], sounds: { 'state:open': 'sfx.door-open@1' },
    draw: (d) => {
      d.ground(220);
      d.ellipse(0, -120, 130, 80, 'glow', { flat: true, opacity: 0.35, when: { state: 'open' }, opParam: 'anim.sin' });
      d.rect(-100, -110, 200, 110, 'wood', { r: 4 });
      d.ellipse(0, -110, 92, 14, 'gold', { when: { state: 'open' } });
      for (const [x, y] of [[-40, -122], [10, -128], [50, -118]] as const) d.ellipse(x, y, 12, 12, 'gold', { when: { state: 'open' } });
      d.poly([[-100, -110], [100, -110], [100, -150], [70, -175], [-70, -175], [-100, -150]], 'wood', { smooth: 0.3, when: { state: 'closed' } });
      d.poly([[-100, -110], [100, -110], [90, -200], [-90, -200]], 'wood', { when: { state: 'open' } });
      for (const x of [-80, 66]) d.rect(x, -110, 14, 110, 'metal', { flat: true });
      d.rect(-14, -122, 28, 28, 'metal', { r: 4, when: { state: 'closed' } });
    },
  },
  'magic-wand': {
    colors: { wand: '#2E2621', tip: '#F4F2EC', spark: '#FFE27A' }, states: ['idle', 'sparkle'], bounds: [-40, -150, 80, 150], anchors: { grip: [0, -20] }, capabilities: ['grip', 'cast'], sounds: { 'state:sparkle': 'sfx.zip-pass@1', cast: 'sfx.zip-pass@1' },
    draw: (d) => {
      d.poly([[-4, 0], [4, 0], [2.5, -110], [-2.5, -110]], 'wand');
      d.rect(-3, -120, 6, 12, 'tip', { flat: true });
      for (const [x, y, r] of [[0, -135, 10], [-22, -120, 6], [20, -140, 7], [12, -110, 4]] as const) {
        d.poly([[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], 'spark', { flat: true, when: { state: 'sparkle' }, opParam: 'anim.fast' });
      }
    },
  },
  'potion-bottle': {
    colors: { glass: '#DDEFF4', potion: '#7A3EC8', cork: '#B98A5E', bubble: '#E8D4FF' }, states: ['still', 'bubbling'], bounds: [-35, -110, 70, 110], anchors: { grip: [0, -40] }, capabilities: ['grip', 'drink'], sounds: { drink: 'sfx.pour-drink@1' },
    draw: (d) => {
      d.ellipse(0, -36, 34, 34, 'glass', { opacity: 0.55, id: 'g' });
      d.rect(-10, -92, 20, 30, 'glass', { flat: true, opacity: 0.55 });
      d.ellipse(0, -30, 30, 26, 'potion', { flat: true, clip: 'g' });
      d.rect(-9, -106, 18, 16, 'cork', { r: 3 });
      for (const [x, k] of [[-10, 0], [8, 18]] as const) d.ellipse(x, -20 - k, 4, 4, 'bubble', { flat: true, when: { state: 'bubbling' }, d: rise(-40) });
    },
  },
  'crystal-ball': {
    colors: { ball: '#B9A6F2', glow: '#E4D9FF', base: '#5A3A28' }, bounds: [-70, -160, 140, 160], capabilities: ['glow'],
    draw: (d) => {
      d.ellipse(0, -100, 85, 85, 'glow', { flat: true, opacity: 0.4, opParam: 'anim.sin' });
      d.poly([[-55, 0], [55, 0], [40, -40], [-40, -40]], 'base');
      d.ellipse(0, -95, 60, 60, 'ball', { opacity: 0.9, id: 'b' });
      d.ellipse(-12, -100, 20, 14, 'glow', { flat: true, opacity: 0.7, clip: 'b', d: sway(18, 8) });
      d.poly([[-35, -125], [-20, -142], [-12, -138], [-28, -118]], '#FFFFFF', { flat: true, opacity: 0.7 });
    },
  },
  sword: {
    colors: { blade: '#D6DCE3', guard: '#C9A15B', grip: '#4A3326' }, bounds: [-30, -260, 60, 260], anchors: { grip: [0, -25] }, capabilities: ['grip', 'swing'], sounds: { swing: 'sfx.swish@1', hit: 'sfx.punch-impact@1' },
    draw: (d) => {
      d.rect(-6, -48, 12, 48, 'grip', { r: 3 });
      d.ellipse(0, -2, 8, 8, 'guard');
      d.rect(-30, -58, 60, 10, 'guard', { r: 4 });
      d.poly([[-9, -58], [9, -58], [8, -240], [0, -262], [-8, -240]], 'blade');
      d.stroke([[0, -62], [0, -240]], 'blade.shade', 2);
    },
  },
  shield: {
    colors: { face: '#2F5E8C', rim: '#C9A15B', emblem: '#F2C24F' }, bounds: [-70, -170, 140, 170], anchors: { grip: [0, -85] }, capabilities: ['grip', 'block'], sounds: { hit: 'sfx.bonk@1' },
    draw: (d) => {
      d.poly([[-70, -170], [70, -170], [66, -80], [0, 0], [-66, -80]], 'rim', { smooth: 0.2 });
      d.poly([[-58, -158], [58, -158], [55, -84], [0, -16], [-55, -84]], 'face', { smooth: 0.2 });
      d.poly([[0, -130], [12, -100], [42, -100], [18, -82], [26, -52], [0, -70], [-26, -52], [-18, -82], [-42, -100], [-12, -100]], 'emblem', { flat: true });
    },
  },

  /* ---------------------------------------------------------------- travel */
  suitcase: {
    colors: { case: '#3F6E8C', handle: '#2E3236', wheel: '#1E1F22', tag: '#F2C24F' }, states: ['standing', 'rolling'], bounds: [-70, -300, 140, 300], anchors: { grip: [0, -290] }, capabilities: ['grip', 'roll'], sounds: { 'state:rolling': 'sfx.footsteps-concrete@1' },
    draw: (d) => {
      d.stroke([[-20, -190], [-20, -290], [20, -290], [20, -190]], 'handle', 6, { when: { state: 'rolling' } });
      d.stroke([[-20, -190], [-20, -215], [20, -215], [20, -190]], 'handle', 6, { when: { state: 'standing' } });
      d.rect(-70, -195, 140, 180, 'case', { r: 14, id: 'c' });
      for (const x of [-35, 0, 35]) d.stroke([[x, -185], [x, -25]], 'case.shade', 3);
      d.rect(40, -150, 18, 26, 'tag', { r: 3, flat: true });
      d.ellipse(-50, -8, 9, 9, 'wheel');
      d.ellipse(50, -8, 9, 9, 'wheel');
    },
  },
  map: {
    colors: { paper: '#F2E2B8', land: '#B9D29A', route: '#C8453D', fold: '#D9C79A' }, states: ['closed', 'open'], bounds: [-90, -110, 180, 110], anchors: { grip: [0, -50] }, capabilities: ['grip', 'open', 'close'], sounds: { 'state:open': 'sfx.paper-rustle@1' },
    draw: (d) => {
      d.rect(-22, -70, 44, 70, 'paper', { r: 2, when: { state: 'closed' } });
      d.stroke([[-22, -35], [22, -35]], 'fold', 2, { when: { state: 'closed' } });
      d.poly([[-90, -100], [-30, -110], [30, -100], [90, -110], [90, 0], [30, 10], [-30, 0], [-90, 10]], 'paper', { when: { state: 'open' } });
      d.poly([[-70, -80], [-20, -90], [10, -50], [-40, -20], [-75, -30]], 'land', { smooth: 0.5, flat: true, when: { state: 'open' } });
      d.stroke([[-50, -50], [0, -60], [30, -30], [70, -70]], 'route', 3, { when: { state: 'open' } });
      d.ellipse(70, -70, 6, 6, 'route', { flat: true, when: { state: 'open' } });
      for (const x of [-30, 30]) d.stroke([[x, -106], [x, 6]], 'fold', 2, { when: { state: 'open' } });
    },
  },
  camera: {
    colors: { body: '#2E3236', lens: '#5A6672', flash: '#FFFFFF', strap: '#8C5A34' }, states: ['ready', 'flash'], bounds: [-60, -110, 120, 110], anchors: { grip: [-40, -40] }, capabilities: ['grip', 'shoot'], sounds: { shoot: 'sfx.camera-shutter@1', 'state:flash': 'sfx.camera-shutter@1' },
    draw: (d) => {
      d.ellipse(30, -95, 40, 30, 'flash', { flat: true, opacity: 0.8, when: { state: 'flash' } });
      d.rect(-55, -75, 110, 70, 'body', { r: 10 });
      d.rect(-35, -88, 30, 16, 'body', { r: 3 });
      d.ellipse(5, -40, 26, 26, 'lens');
      d.ellipse(5, -40, 14, 14, 'body', { flat: true });
      d.rect(30, -70, 16, 10, 'flash', { r: 2, flat: true });
    },
  },
  passport: {
    colors: { cover: '#7A2638', emblem: '#E3B23C' }, bounds: [-24, -66, 48, 66], anchors: { grip: [0, -20] }, capabilities: ['pinch', 'show'],
    draw: (d) => {
      d.rect(-24, -66, 48, 66, 'cover', { r: 3 });
      d.ellipse(0, -38, 12, 12, 'emblem', { flat: true });
      d.rect(-14, -16, 28, 4, 'emblem', { flat: true });
    },
  },

  /* ---------------------------------------------------------------- retail */
  'shopping-bag': {
    colors: { bag: '#E8D4B0', handle: '#8C5A34', logo: '#C8453D' }, bounds: [-55, -150, 110, 150], anchors: { grip: [0, -140] }, capabilities: ['grip'], sounds: { contact: 'sfx.paper-rustle@1' },
    draw: (d) => {
      d.stroke([[-22, -105], [-18, -142], [18, -142], [22, -105]], 'handle', 4, { smooth: true });
      d.poly([[-50, 0], [50, 0], [55, -110], [-55, -110]], 'bag', { id: 'b' });
      d.ellipse(0, -55, 22, 22, 'logo', { flat: true });
      d.shade([[25, -110], [55, -110], [50, 0], [25, 0]], 'b');
    },
  },
  'cash-register': {
    colors: { body: '#3A3D44', display: '#5ED38A', key: '#D9DCE1', drawer: '#2E3236', cash: '#7FB070' }, states: ['closed', 'open'], bounds: [-110, -200, 220, 200], capabilities: ['open', 'use'], sounds: { 'state:open': 'sfx.microwave-ding@1' },
    draw: (d) => {
      d.rect(-100, -60, 200, 60, 'drawer', { r: 4 });
      d.rect(-110, -40, 220, 50, 'drawer', { r: 4, when: { state: 'open' } });
      for (const x of [-80, -40, 0, 40]) d.rect(x, -36, 30, 14, 'cash', { flat: true, when: { state: 'open' } });
      d.poly([[-90, -60], [90, -60], [70, -150], [-70, -150]], 'body');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) d.rect(-55 + c * 22, -135 + r * 22, 16, 14, 'key', { r: 2, flat: true });
      d.rect(20, -200, 70, 40, 'body', { r: 4 });
      d.rect(28, -192, 54, 22, 'display', { r: 2, flat: true });
    },
  },
  'price-tag': {
    colors: { tag: '#F2C24F', string: '#8A8378', text: '#2E2B2A' }, bounds: [-50, -60, 100, 60], anchors: { text: [-30, -48, 70, 36] }, capabilities: ['text-slot'],
    draw: (d) => {
      d.stroke([[-60, -60], [-40, -30]], 'string', 2);
      d.poly([[-45, -30], [-25, -55], [50, -55], [50, -5], [-25, -5]], 'tag');
      d.ellipse(-28, -30, 5, 5, 'string', { flat: true });
      d.rect(-10, -40, 45, 8, 'text', { flat: true, r: 2 });
      d.rect(-10, -24, 30, 6, 'text', { flat: true, r: 2 });
    },
  },
  'shopping-cart': {
    colors: { wire: '#9AA0A8', handle: '#C8453D', wheel: '#1E1F22' }, states: ['still', 'rolling'], bounds: [-160, -260, 320, 260], anchors: { grip: [-150, -240] }, capabilities: ['push'],
    draw: (d) => {
      d.ground(280);
      d.poly([[-120, -240], [150, -240], [120, -100], [-100, -100]], 'wire', { opacity: 0.35 });
      for (let x = -100; x <= 120; x += 30) d.stroke([[x, -240], [x * 0.9, -100]], 'wire', 2);
      for (const y of [-200, -150]) d.stroke([[-112, y], [140, y]], 'wire', 2);
      d.stroke([[-120, -240], [-150, -250]], 'wire', 5);
      d.rect(-165, -258, 30, 14, 'handle', { r: 5 });
      d.stroke([[-100, -100], [-110, -40], [130, -40], [120, -100]], 'wire', 5);
      for (const x of [-100, 120]) {
        d.ellipse(x, -18, 16, 16, 'wheel');
        d.stroke([spinPt(x, -18, 10, 0), spinPt(x, -18, 10, Math.PI)], 'wire', 2, { when: { state: 'rolling' } });
      }
    },
  },

  /* ---------------------------------------------------------------- event */
  megaphone: {
    colors: { horn: '#F4F2EC', band: '#E5484D', grip: '#2E3236' }, bounds: [-30, -110, 190, 110], anchors: { grip: [0, -30] }, capabilities: ['grip', 'voice-effect'],
    draw: (d) => {
      d.rect(-10, -40, 20, 40, 'grip', { r: 4 });
      d.poly([[0, -70], [40, -78], [160, -110], [160, -10], [40, -42], [0, -50]], 'horn');
      d.rect(30, -82, 14, 44, 'band', { flat: true });
      d.ellipse(160, -60, 10, 50, 'horn.shade', { flat: true });
    },
  },
  'trophy-cup': {
    colors: { silver: '#C9CED6', base: '#2E2B2A', plaque: '#E3B23C' }, bounds: [-70, -200, 140, 200], anchors: { grip: [0, -50] }, capabilities: ['grip', 'raise'],
    draw: (d) => {
      d.rect(-50, -40, 100, 40, 'base', { r: 3 });
      d.rect(-25, -28, 50, 14, 'plaque', { flat: true, r: 2 });
      d.poly([[-20, -40], [20, -40], [8, -80], [-8, -80]], 'silver');
      d.poly([[-55, -200], [55, -200], [45, -130], [0, -90], [-45, -130]], 'silver', { smooth: 0.35, id: 'c' });
      d.stroke([[-50, -185], [-75, -170], [-45, -130]], 'silver', 7, { smooth: true });
      d.stroke([[50, -185], [75, -170], [45, -130]], 'silver', 7, { smooth: true });
      d.shade([[15, -200], [55, -200], [45, -130], [15, -100]], 'c');
    },
  },
  podium: {
    colors: { block: '#F4F2EC', gold: '#E3B23C', silver: '#C9CED6', bronze: '#C27A3A' }, bounds: [-300, -240, 600, 240], anchors: { stand1: [0, -240], stand2: [-200, -170], stand3: [200, -120] }, capabilities: ['stand'],
    draw: (d) => {
      d.ground(600);
      d.rect(-300, -170, 200, 170, 'block');
      d.rect(-100, -240, 200, 240, 'block');
      d.rect(100, -120, 200, 120, 'block');
      d.ellipse(0, -150, 34, 34, 'gold', { flat: true });
      d.ellipse(-200, -100, 30, 30, 'silver', { flat: true });
      d.ellipse(200, -65, 28, 28, 'bronze', { flat: true });
    },
  },
  'stage-spotlight': {
    colors: { body: '#2E3236', beam: '#FFF7D6', stand: '#1E1F22' }, states: ['on', 'off'], bounds: [-120, -700, 340, 700], capabilities: ['light'], sounds: { 'state:on': 'sfx.mouse-click@1' },
    draw: (d) => {
      d.ground(160);
      for (const x of [-70, 0, 70]) d.stroke([[0, -60], [x, 0]], 'stand', 6);
      d.rect(-5, -260, 10, 205, 'stand', { flat: true });
      // The beam sweeps slowly.
      d.poly([[40, -330], [220, -700, sway(40)], [340, -620, sway(40)], [60, -290]], 'beam', { flat: true, opacity: 0.3, when: { state: 'on' } });
      d.poly([[-50, -320], [40, -350], [60, -290], [-30, -260]], 'body', { smooth: 0.2 });
      d.ellipse(50, -320, 10, 32, 'beam', { flat: true, when: { state: 'on' } });
    },
  },
  'red-carpet': {
    colors: { carpet: '#B0222E', post: '#C9A15B', rope: '#7A1A24' }, bounds: [-330, -140, 660, 140], depth: 'ground',
    draw: (d) => {
      d.poly([[-240, -40], [240, -40], [330, 0], [-330, 0]], 'carpet', { flat: true });
      for (const x of [-300, -100, 100, 300]) {
        d.rect(x - 5, -130, 10, 120, 'post', { r: 4 });
        d.ellipse(x, -130, 9, 9, 'post');
      }
      for (const x of [-300, -100, 100]) d.stroke([[x, -120], [x + 100, -90], [x + 200, -120]], 'rope', 5, { smooth: true });
    },
  },
};
