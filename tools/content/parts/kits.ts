/**
 * More environment kits (I1): living room, classroom, office, newsroom, park and bedroom. Each is a few set pieces
 * on the back, ground and front planes, drawn in stage units like the podcast and coffee-shop kits.
 */
import type { PropDrawer, KitParts } from './props.js';

const WALL: [number, number, number, number] = [-1400, -800, 2800, 900];
const FLOOR: [number, number, number, number] = [-1400, -460, 2800, 480];

const wall = (name: string, colors: Record<string, string>, extra?: (d: PropDrawer) => void) => ({
  name, plane: 'back', order: 0, at: [960, 700] as [number, number],
  spec: { colors, bounds: WALL, draw: (d: PropDrawer) => {
    d.rect(-1400, -800, 2800, 900, 'wall', { flat: true });
    extra?.(d);
    d.rect(-1400, -24, 2800, 26, 'trim', { flat: true });
  } },
});
const floor = (name: string, colors: Record<string, string>, extra?: (d: PropDrawer) => void) => ({
  name, plane: 'ground', order: 0, at: [960, 1080] as [number, number],
  spec: { colors, bounds: FLOOR, draw: (d: PropDrawer) => {
    d.rect(-1400, -460, 2800, 480, 'floor', { flat: true });
    extra?.(d);
  } },
});
const windowAt = (d: PropDrawer, x: number, y: number, w: number, h: number, pane = 'sky', frame = 'frame') => {
  d.rect(x - 14, y - 14, w + 28, h + 28, frame, { flat: true });
  d.rect(x, y, w, h, pane, { flat: true });
  d.rect(x + w / 2 - 6, y, 12, h, frame, { flat: true });
  d.rect(x, y + h / 2 - 6, w, 12, frame, { flat: true });
};

export const LIVING_ROOM_KIT: KitParts = {
  wall: wall('Wallpaper', { wall: '#E9D8BF', stripe: '#E0CCAF', trim: '#9C7A5B' }, (d) => {
    for (let i = -14; i < 14; i++) d.rect(i * 100, -800, 40, 780, 'stripe', { flat: true });
  }),
  window: {
    name: 'Window', plane: 'back', order: 1, at: [1500, 560],
    spec: { colors: { sky: '#BFDCEB', frame: '#F4EEE4', curtain: '#B5553F' }, bounds: [-300, -420, 600, 440], draw: (d) => {
      windowAt(d, -200, -380, 400, 340);
      d.rect(-290, -420, 110, 440, 'curtain', { r: 20 });
      d.rect(180, -420, 110, 440, 'curtain', { r: 20 });
    } },
  },
  pictures: {
    name: 'Pictures', plane: 'back', order: 2, at: [760, 360],
    spec: { colors: { frame: '#6B4B34', a: '#7FA7A0', b: '#E1A95F', c: '#C9D6E3' }, bounds: [-320, -130, 640, 260], draw: (d) => {
      d.rect(-320, -110, 260, 200, 'frame', { flat: true }); d.rect(-300, -90, 220, 160, 'a', { flat: true });
      d.ellipse(-190, 30, 90, 40, 'b', { flat: true });
      d.rect(-20, -130, 160, 220, 'frame', { flat: true }); d.rect(0, -110, 120, 180, 'c', { flat: true });
      d.rect(180, -60, 140, 140, 'frame', { flat: true }); d.rect(198, -42, 104, 104, 'b', { flat: true });
    } },
  },
  sofa: {
    name: 'Sofa', plane: 'back', order: 3, at: [760, 1000],
    spec: { colors: { sofa: '#4F6D8A', cushion: '#6684A1', leg: '#3E2B20' }, bounds: [-460, -330, 920, 340], draw: (d) => {
      d.rect(-440, -330, 880, 200, 'sofa', { r: 40 });
      d.rect(-460, -190, 920, 150, 'sofa', { r: 30 });
      d.rect(-400, -210, 390, 70, 'cushion', { r: 24 });
      d.rect(10, -210, 390, 70, 'cushion', { r: 24 });
      d.rect(-500, -260, 90, 220, 'sofa', { r: 36 }); d.rect(410, -260, 90, 220, 'sofa', { r: 36 });
      d.rect(-430, -40, 30, 40, 'leg', { flat: true }); d.rect(400, -40, 30, 40, 'leg', { flat: true });
    } },
  },
  floor: floor('Wooden floor', { floor: '#A77D57', board: '#97704D', rug: '#C9A87C' }, (d) => {
    for (let i = 0; i < 6; i++) d.rect(-1400, -460 + i * 80, 2800, 4, 'board', { flat: true });
    d.ellipse(0, -160, 700, 110, 'rug', { flat: true });
  }),
};

export const CLASSROOM_KIT: KitParts = {
  wall: wall('Classroom wall', { wall: '#E6E1C9', trim: '#7E8C6A', panel: '#D5D0B4' }, (d) => {
    d.rect(-1400, -260, 2800, 240, 'panel', { flat: true });
  }),
  board: {
    name: 'Chalkboard', plane: 'back', order: 1, at: [760, 560],
    spec: { colors: { frame: '#8C6A45', board: '#2E4B3C', ledge: '#6E5235', chalk: '#F2F0E6' }, bounds: [-340, -420, 680, 440], draw: (d) => {
      d.rect(-340, -420, 680, 400, 'frame', { flat: true });
      d.rect(-316, -396, 632, 352, 'board', { flat: true });
      d.rect(-360, -30, 720, 26, 'ledge', { flat: true });
      d.rect(-200, -46, 40, 14, 'chalk', { flat: true });
    } },
  },
  windows: {
    name: 'Windows', plane: 'back', order: 2, at: [1560, 520],
    spec: { colors: { sky: '#BFDCEB', frame: '#F4EEE4' }, bounds: [-320, -360, 640, 380], draw: (d) => {
      windowAt(d, -300, -330, 260, 300); windowAt(d, 40, -330, 260, 300);
    } },
  },
  clock: {
    name: 'Clock', plane: 'back', order: 3, at: [1200, 200],
    spec: { colors: { rim: '#3A3A40', face: '#FAF7EF', hand: '#1F1F24' }, bounds: [-70, -70, 140, 140], draw: (d) => {
      d.ellipse(0, 0, 66, 66, 'rim', { flat: true }); d.ellipse(0, 0, 56, 56, 'face', { flat: true });
      d.stroke([[0, 0], [0, -40]], 'hand', 6); d.stroke([[0, 0], [28, 10]], 'hand', 6);
    } },
  },
  floor: floor('Linoleum floor', { floor: '#C8BFA8', tile: '#BDB39A' }, (d) => {
    for (let row = 0; row < 6; row++) for (let col = -14; col < 14; col++) if ((row + col) % 2) d.rect(col * 100, -460 + row * 80, 100, 80, 'tile', { flat: true });
  }),
};

export const OFFICE_KIT: KitParts = {
  wall: wall('Office wall', { wall: '#DCE3E8', trim: '#8796A3' }),
  windows: {
    name: 'Office windows', plane: 'back', order: 1, at: [960, 560],
    spec: { colors: { sky: '#C7DDEA', city: '#9FB4C3', frame: '#5D6B78' }, bounds: [-900, -440, 1800, 460], draw: (d) => {
      d.rect(-900, -440, 1800, 400, 'frame', { flat: true });
      d.rect(-880, -420, 1760, 360, 'sky', { flat: true, id: 'glass' });
      for (const [x, w, h] of [[-860, 160, 200], [-660, 120, 280], [-500, 200, 160], [-260, 140, 240], [-80, 180, 300], [140, 120, 180], [300, 200, 260], [540, 160, 220], [720, 140, 300]] as const) d.rect(x, -60 - h, w, h, 'city', { flat: true, clip: 'glass' });
      for (let i = 1; i < 5; i++) d.rect(-900 + i * 360 - 8, -440, 16, 400, 'frame', { flat: true });
    } },
  },
  plant: {
    name: 'Office plant', plane: 'back', order: 2, at: [180, 1000],
    spec: { colors: { pot: '#E8E4DC', leaf: '#4E8A5B', dark: '#3B6E47' }, bounds: [-120, -420, 240, 430], draw: (d) => {
      d.rect(-70, -140, 140, 140, 'pot', { r: 12 });
      for (const [x, y, r] of [[-60, -240, 70], [50, -280, 80], [0, -360, 70], [-20, -200, 60]] as const) d.ellipse(x, y, r, r * 0.7, (x + y) % 2 ? 'leaf' : 'dark', { flat: true });
    } },
  },
  floor: floor('Carpet', { floor: '#7B8794', fleck: '#717D89' }, (d) => {
    for (let i = 0; i < 40; i++) d.rect(-1400 + ((i * 337) % 2800), -440 + ((i * 113) % 440), 30, 6, 'fleck', { flat: true });
  }),
};

export const NEWSROOM_KIT: KitParts = {
  wall: wall('Studio backdrop', { wall: '#16243A', trim: '#0E1828', band: '#1F3456', glow: '#2C6BC4' }, (d) => {
    d.rect(-1400, -620, 2800, 120, 'band', { flat: true });
    d.ellipse(0, -400, 900, 300, 'glow', { flat: true, opacity: 0.25 });
  }),
  screens: {
    name: 'Video wall', plane: 'back', order: 1, at: [960, 520],
    spec: { colors: { bezel: '#0B111C', screen: '#2F5D9A', map: '#5C8FD1', red: '#C8323C' }, bounds: [-760, -360, 1520, 380], draw: (d) => {
      for (const x of [-760, -250, 260]) {
        d.rect(x, -340, 500, 300, 'bezel', { flat: true });
        d.rect(x + 14, -326, 472, 272, 'screen', { flat: true });
      }
      d.ellipse(-510, -190, 160, 90, 'map', { flat: true, opacity: 0.7 });
      d.rect(-236, -300, 300, 40, 'red', { flat: true });
      for (let i = 0; i < 4; i++) d.rect(274, -300 + i * 60, 200 + (i % 2) * 120, 26, 'map', { flat: true, opacity: 0.7 });
    } },
  },
  desk: {
    name: 'News desk', plane: 'front', order: 0, at: [960, 1080],
    spec: { colors: { desk: '#E6EBF2', front: '#24395C', edge: '#C8323C' }, bounds: [-520, -330, 1040, 340], draw: (d) => {
      d.poly([[-520, -330], [520, -330], [460, 0], [-460, 0]], 'front');
      d.rect(-540, -350, 1080, 34, 'desk', { r: 10 });
      d.rect(-460, -200, 920, 16, 'edge', { flat: true });
    } },
  },
  floor: floor('Studio floor', { floor: '#1B2638', shine: '#26344C' }, (d) => {
    d.ellipse(0, -200, 900, 120, 'shine', { flat: true });
  }),
};

export const PARK_KIT: KitParts = {
  sky: {
    name: 'Sky', plane: 'far', order: 0, at: [960, 700],
    spec: { colors: { sky: '#A9D6EE', cloud: '#F4FAFD', hill: '#8FBF73', far: '#A7CB8C' }, bounds: [-1600, -800, 3200, 900], draw: (d) => {
      d.rect(-1600, -800, 3200, 900, 'sky', { flat: true });
      for (const [x, y, w] of [[-900, -620, 260], [-200, -680, 340], [700, -600, 280], [1200, -700, 220]] as const) {
        d.ellipse(x, y, w / 2, 40, 'cloud', { flat: true }); d.ellipse(x + w / 5, y - 30, w / 3, 40, 'cloud', { flat: true });
      }
      d.ellipse(-700, 60, 1100, 260, 'far', { flat: true });
      d.ellipse(700, 80, 1200, 230, 'hill', { flat: true });
    } },
  },
  trees: {
    name: 'Trees', plane: 'back', order: 0, at: [960, 760],
    spec: { colors: { trunk: '#7A5236', leaf: '#4E8A5B', leaf2: '#5E9C66' }, bounds: [-1300, -520, 2600, 540], draw: (d) => {
      for (const [x, s] of [[-1100, 1], [-640, 0.8], [520, 1.1], [1100, 0.9]] as const) {
        d.rect(x - 20 * s, -200 * s, 40 * s, 220 * s, 'trunk', { flat: true });
        d.ellipse(x, -300 * s, 170 * s, 150 * s, 'leaf', { flat: true });
        d.ellipse(x + 60 * s, -360 * s, 110 * s, 100 * s, 'leaf2', { flat: true });
      }
    } },
  },
  bench: {
    name: 'Bench', plane: 'back', order: 1, at: [1540, 960],
    spec: { colors: { wood: '#A0693F', iron: '#2F2F36' }, bounds: [-240, -200, 480, 210], draw: (d) => {
      for (let i = 0; i < 3; i++) d.rect(-220, -190 + i * 40, 440, 26, 'wood', { r: 6 });
      d.rect(-230, -80, 460, 26, 'wood', { r: 6 });
      d.rect(-200, -60, 20, 60, 'iron', { flat: true }); d.rect(180, -60, 20, 60, 'iron', { flat: true });
    } },
  },
  floor: floor('Grass and path', { floor: '#7DB062', path: '#D9C8A3', tuft: '#6A9B52' }, (d) => {
    d.poly([[-1400, -160], [1400, -240], [1400, -80], [-1400, 0]], 'path', { flat: true });
    for (let i = 0; i < 30; i++) d.ellipse(-1380 + ((i * 263) % 2760), -420 + ((i * 97) % 200), 20, 8, 'tuft', { flat: true });
  }),
};

export const BEDROOM_KIT: KitParts = {
  wall: wall('Bedroom wall', { wall: '#C9C3E3', trim: '#8F86B8', star: '#F3E9B5' }, (d) => {
    for (let i = 0; i < 18; i++) d.ellipse(-1300 + ((i * 431) % 2600), -760 + ((i * 173) % 600), 8, 8, 'star', { flat: true, opacity: 0.6 });
  }),
  window: {
    name: 'Night window', plane: 'back', order: 1, at: [1500, 520],
    spec: { colors: { sky: '#26305E', frame: '#F4EEE4', moon: '#F7F1CF', curtain: '#5E5598' }, bounds: [-280, -400, 560, 420], draw: (d) => {
      d.rect(-214, -394, 428, 368, 'frame', { flat: true });
      d.rect(-200, -380, 400, 340, 'sky', { flat: true });
      d.ellipse(80, -260, 50, 50, 'moon', { flat: true });
      d.rect(-6, -380, 12, 340, 'frame', { flat: true });
      d.rect(-280, -400, 100, 420, 'curtain', { r: 20 }); d.rect(180, -400, 100, 420, 'curtain', { r: 20 });
    } },
  },
  bed: {
    name: 'Bed', plane: 'back', order: 2, at: [700, 1000],
    spec: { colors: { frame: '#8C6A45', sheet: '#F2EEF8', quilt: '#7A9CCF', pillow: '#FFFFFF' }, bounds: [-460, -380, 920, 390], draw: (d) => {
      d.rect(-460, -380, 60, 380, 'frame', { r: 10 });
      d.rect(-420, -190, 860, 150, 'sheet', { r: 20 });
      d.rect(-150, -210, 590, 170, 'quilt', { r: 24 });
      d.ellipse(-300, -210, 100, 40, 'pillow');
      d.rect(-440, -50, 880, 30, 'frame', { flat: true });
      d.rect(420, -240, 40, 240, 'frame', { r: 10 });
    } },
  },
  floor: floor('Bedroom floor', { floor: '#9C7A63', rug: '#B6A7D6' }, (d) => {
    d.ellipse(100, -140, 520, 80, 'rug', { flat: true });
  }),
};
