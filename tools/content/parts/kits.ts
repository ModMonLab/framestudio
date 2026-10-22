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

export const KITCHEN_KIT: KitParts = {
  wall: wall('Tiled wall', { wall: '#E9E4D8', tile: '#DCD6C8', trim: '#8A9A8E' }, (d) => {
    for (let r = 0; r < 4; r++) for (let c = -14; c < 14; c++) d.rect(c * 100 + 2, -300 + r * 70 + 2, 96, 66, 'tile', { flat: true });
  }),
  cabinets: {
    name: 'Wall cabinets', plane: 'back', order: 1, at: [700, 320],
    spec: { colors: { wood: '#9FB7A4', handle: '#3A3F48' }, bounds: [-520, -140, 1040, 280], draw: (d) => {
      for (let i = 0; i < 4; i++) { d.rect(-520 + i * 260, -140, 250, 260, 'wood', { r: 6 }); d.rect(-520 + i * 260 + 110, -20, 30, 8, 'handle', { flat: true }); }
    } },
  },
  window: {
    name: 'Kitchen window', plane: 'back', order: 2, at: [1500, 420],
    spec: { colors: { sky: '#BFDCEB', frame: '#F4EEE4', plant: '#5E9C66' }, bounds: [-240, -240, 480, 260], draw: (d) => {
      windowAt(d, -200, -220, 400, 220);
      for (const x of [-120, 0, 120]) d.ellipse(x, 0, 40, 30, 'plant', { flat: true });
    } },
  },
  counter: {
    name: 'Counter and stove', plane: 'mid', order: 0, at: [700, 1010],
    spec: { colors: { front: '#9FB7A4', top: '#E8E2D6', stove: '#3A3F48', knob: '#C9CED6', pot: '#B5553F' }, bounds: [-560, -420, 1120, 420], draw: (d) => {
      d.rect(-560, -300, 1120, 300, 'front');
      for (let i = 0; i < 4; i++) d.rect(-540 + i * 280, -270, 260, 240, 'front', { r: 6 });
      d.rect(-580, -320, 1160, 30, 'top', { r: 6 });
      d.rect(120, -326, 300, 12, 'stove', { flat: true });
      for (let i = 0; i < 4; i++) d.ellipse(150 + i * 80, -150, 14, 14, 'knob', { flat: true });
      d.rect(160, -420, 140, 100, 'pot', { r: 14 });
    } },
  },
  floor: floor('Checked floor', { floor: '#E5DCCB', check: '#C8BBA6' }, (d) => {
    for (let row = 0; row < 6; row++) for (let col = -14; col < 14; col++) if ((row + col) % 2) d.rect(col * 100, -460 + row * 80, 100, 80, 'check', { flat: true });
  }),
};

export const CITY_STREET_KIT: KitParts = {
  sky: {
    name: 'Skyline', plane: 'far', order: 0, at: [960, 700],
    spec: { colors: { sky: '#BFD6E6', far: '#9FB0C0', near: '#8698AA', lit: '#F2E6B0' }, bounds: [-1600, -800, 3200, 900], draw: (d) => {
      d.rect(-1600, -800, 3200, 900, 'sky', { flat: true });
      for (let i = 0; i < 16; i++) { const x = -1600 + i * 200; const h = 300 + ((i * 137) % 350); d.rect(x, -h, 190, h + 100, i % 2 ? 'far' : 'near', { flat: true }); for (let r = 0; r < Math.floor(h / 80); r++) d.rect(x + 30, -h + 30 + r * 80, 40, 30, 'lit', { flat: true, opacity: (i + r) % 3 ? 0.4 : 0.9 }); }
    } },
  },
  shopfront: {
    name: 'Shop fronts', plane: 'back', order: 0, at: [960, 760],
    spec: { colors: { brick: '#B4775A', glass: '#A9C9DA', awning: '#2F6B57', door: '#3E2B20', sign: '#F2E6C8' }, bounds: [-1400, -640, 2800, 660], draw: (d) => {
      d.rect(-1400, -640, 2800, 660, 'brick', { flat: true });
      for (const x of [-1200, -500, 200, 900]) {
        d.rect(x, -380, 460, 300, 'glass', { flat: true });
        for (let k = 0; k < 6; k++) d.rect(x - 20 + k * 83, -440, 83, 60, k % 2 ? 'sign' : 'awning', { flat: true });
        d.rect(x + 470, -340, 110, 340, 'door', { flat: true });
      }
    } },
  },
  lamp: {
    name: 'Street lamp', plane: 'mid', order: 0, at: [1640, 1000],
    spec: { colors: { pole: '#2F3640', glow: '#FFE9B8' }, bounds: [-80, -620, 160, 630], draw: (d) => {
      d.rect(-12, -600, 24, 600, 'pole', { flat: true });
      d.rect(-50, -640, 100, 50, 'pole', { r: 10 });
      d.ellipse(0, -580, 60, 30, 'glow', { flat: true, opacity: 0.5 });
    } },
  },
  floor: floor('Pavement and road', { floor: '#A8A39A', kerb: '#C9C3B8', road: '#4A4E58', line: '#E8E4D8' }, (d) => {
    d.rect(-1400, -460, 2800, 30, 'kerb', { flat: true });
    d.rect(-1400, -160, 2800, 180, 'road', { flat: true });
    for (let i = -14; i < 14; i++) d.rect(i * 200, -80, 110, 12, 'line', { flat: true });
  }),
};

export const HOSPITAL_KIT: KitParts = {
  wall: wall('Ward wall', { wall: '#E4EEF0', trim: '#7FA7A0', stripe: '#BFD8D4' }, (d) => { d.rect(-1400, -320, 2800, 40, 'stripe', { flat: true }); }),
  window: {
    name: 'Ward window', plane: 'back', order: 1, at: [1500, 500],
    spec: { colors: { sky: '#CFE4EE', frame: '#F4F6F6', blind: '#E2E6E8' }, bounds: [-260, -320, 520, 340], draw: (d) => {
      windowAt(d, -220, -300, 440, 300);
      for (let i = 0; i < 5; i++) d.rect(-220, -300 + i * 24, 440, 14, 'blind', { flat: true, opacity: 0.8 });
    } },
  },
  bed: {
    name: 'Hospital bed', plane: 'back', order: 2, at: [700, 1000],
    spec: { colors: { frame: '#B9C2CA', sheet: '#F7F8F8', blanket: '#8FB6C9', wheel: '#3A3F48' }, bounds: [-460, -360, 920, 370], draw: (d) => {
      d.rect(-460, -360, 40, 320, 'frame', { r: 8 }); d.rect(420, -260, 40, 220, 'frame', { r: 8 });
      d.rect(-430, -200, 860, 70, 'sheet', { r: 16 }); d.rect(-200, -215, 620, 90, 'blanket', { r: 20 });
      d.rect(-440, -130, 880, 30, 'frame', { flat: true });
      for (const x of [-400, 400]) { d.rect(x - 6, -100, 12, 70, 'frame', { flat: true }); d.ellipse(x, -18, 18, 18, 'wheel', { flat: true }); }
    } },
  },
  monitor: {
    name: 'Monitor', plane: 'back', order: 3, at: [1180, 640],
    spec: { colors: { case: '#3A3F48', screen: '#13282C', trace: '#4FD18B' }, bounds: [-110, -90, 220, 380], draw: (d) => {
      d.rect(-100, -90, 200, 150, 'case', { r: 10 }); d.rect(-84, -76, 168, 110, 'screen', { flat: true });
      d.stroke([[-80, -20], [-40, -20], [-30, -60], [-15, 20], [0, -20], [80, -20]], 'trace', 3);
      d.rect(-6, 60, 12, 300, 'case', { flat: true });
    } },
  },
  floor: floor('Vinyl floor', { floor: '#CFD8D6', fleck: '#BAC5C2' }, (d) => {
    for (let i = 0; i < 40; i++) d.rect(-1400 + ((i * 331) % 2800), -440 + ((i * 97) % 440), 26, 6, 'fleck', { flat: true });
  }),
};

export const STAGE_KIT: KitParts = {
  wall: wall('Stage backdrop', { wall: '#2A1F3D', trim: '#120D1A', curtain: '#8C1F2E', fold: '#6E1622' }, (d) => {
    for (let i = -14; i < 14; i++) d.rect(i * 100, -800, 60, 780, i % 2 ? 'curtain' : 'fold', { flat: true });
  }),
  lights: {
    name: 'Stage lights', plane: 'back', order: 1, at: [960, 0],
    spec: { colors: { rig: '#1A1A20', beam: '#FFF2C8' }, bounds: [-900, 0, 1800, 900], draw: (d) => {
      d.rect(-900, 10, 1800, 24, 'rig', { flat: true });
      for (const x of [-600, -200, 200, 600]) { d.rect(x - 30, 34, 60, 60, 'rig', { r: 10 }); d.poly([[x - 30, 94], [x + 30, 94], [x + 220, 900], [x - 220, 900]], 'beam', { flat: true, opacity: 0.12 }); }
    } },
  },
  stage: {
    name: 'Stage front', plane: 'front', order: 0, at: [960, 1080],
    spec: { colors: { edge: '#3E2B20', seat: '#5A1622', head: '#1A1214' }, bounds: [-1400, -160, 2800, 170], draw: (d) => {
      d.rect(-1400, -160, 2800, 40, 'edge', { flat: true });
      for (let i = -13; i < 13; i++) { d.ellipse(i * 110 + 55, -40, 42, 44, 'head', { flat: true }); d.rect(i * 110 + 15, -10, 80, 30, 'seat', { r: 8 }); }
    } },
  },
  floor: floor('Stage boards', { floor: '#7A5236', board: '#6B4730' }, (d) => {
    for (let i = 0; i < 8; i++) d.rect(-1400, -460 + i * 60, 2800, 4, 'board', { flat: true });
  }),
};

export const LIBRARY_KIT: KitParts = {
  wall: wall('Library wall', { wall: '#C8B48F', trim: '#6B4B34' }),
  shelves: {
    name: 'Bookshelves', plane: 'back', order: 1, at: [960, 1000],
    spec: { colors: { wood: '#6B4B34', b1: '#8C2F3A', b2: '#2F5E8C', b3: '#3F6E5A', b4: '#C9A74A', b5: '#5E4A7A' }, bounds: [-1100, -820, 2200, 830], draw: (d) => {
      d.rect(-1100, -820, 2200, 820, 'wood', { flat: true });
      const cols = ['b1', 'b2', 'b3', 'b4', 'b5'];
      for (let r = 0; r < 5; r++) {
        d.rect(-1080, -800 + r * 160, 2160, 140, 'wood', { flat: true });
        for (let x = -1070, k = r * 7; x < 1060; k++) { const w = 22 + (k * 13) % 18; const h = 100 + (k * 7) % 34; d.rect(x, -800 + r * 160 + 140 - h, w, h, cols[k % 5]!, { flat: true }); x += w + 3; }
        d.rect(-1100, -800 + r * 160 + 140, 2200, 20, 'wood', { flat: true });
      }
    } },
  },
  table: {
    name: 'Reading table', plane: 'mid', order: 0, at: [960, 1010],
    spec: { colors: { top: '#8C6A45', leg: '#5A3E2B', lamp: '#2F6B57', glow: '#FFE9B8' }, bounds: [-420, -380, 840, 390], draw: (d) => {
      d.rect(-420, -240, 840, 30, 'top', { r: 6 });
      d.rect(-380, -210, 30, 210, 'leg', { flat: true }); d.rect(350, -210, 30, 210, 'leg', { flat: true });
      d.rect(180, -330, 10, 90, 'leg', { flat: true }); d.poly([[140, -330], [240, -330], [215, -380], [165, -380]], 'lamp');
      d.ellipse(190, -310, 80, 30, 'glow', { flat: true, opacity: 0.4 });
    } },
  },
  floor: floor('Library carpet', { floor: '#7A2E35', pattern: '#6B2730' }, (d) => {
    for (let i = -7; i < 7; i++) d.ellipse(i * 200 + 100, -230, 60, 20, 'pattern', { flat: true });
  }),
};

export const GYM_KIT: KitParts = {
  wall: wall('Gym wall', { wall: '#DCE3E8', trim: '#C8323C', band: '#2F5E8C' }, (d) => { d.rect(-1400, -420, 2800, 60, 'band', { flat: true }); }),
  rack: {
    name: 'Weights rack', plane: 'back', order: 1, at: [500, 1000],
    spec: { colors: { metal: '#3A3F48', plate: '#202024', grip: '#C9CED6' }, bounds: [-300, -420, 600, 430], draw: (d) => {
      d.rect(-280, -420, 20, 420, 'metal', { flat: true }); d.rect(260, -420, 20, 420, 'metal', { flat: true });
      for (const y of [-340, -220, -100]) { d.rect(-260, y, 520, 12, 'grip', { flat: true }); d.rect(-250, y - 40, 30, 90, 'plate', { r: 6 }); d.rect(220, y - 40, 30, 90, 'plate', { r: 6 }); }
    } },
  },
  mirror: {
    name: 'Mirror wall', plane: 'back', order: 2, at: [1350, 620],
    spec: { colors: { glass: '#CFE0EA', frame: '#9AA5AE', shine: '#FFFFFF' }, bounds: [-420, -340, 840, 360], draw: (d) => {
      d.rect(-420, -340, 840, 360, 'frame', { flat: true }); d.rect(-400, -320, 800, 320, 'glass', { flat: true });
      d.poly([[-300, -320], [-220, -320], [-380, 0], [-400, 0], [-400, -120]], 'shine', { flat: true, opacity: 0.4 });
    } },
  },
  floor: floor('Rubber floor', { floor: '#3A3F48', mat: '#4A5058', line: '#C8323C' }, (d) => {
    for (let c = -7; c < 7; c++) d.rect(c * 200 + 4, -456, 192, 472, 'mat', { flat: true });
    d.rect(-1400, -300, 2800, 10, 'line', { flat: true });
  }),
};

export const TRAIN_KIT: KitParts = {
  wall: wall('Carriage wall', { wall: '#D9DDE2', trim: '#2F5E8C', panel: '#C6CCD3' }, (d) => { d.rect(-1400, -240, 2800, 220, 'panel', { flat: true }); }),
  windows: {
    name: 'Carriage windows', plane: 'back', order: 1, at: [960, 520],
    spec: { colors: { sky: '#A9D6EE', hill: '#8FBF73', frame: '#8A939C' }, bounds: [-1200, -300, 2400, 320], draw: (d) => {
      for (const x of [-1150, -550, 50, 650]) {
        d.rect(x - 14, -294, 528, 288, 'frame', { r: 30 });
        d.rect(x, -280, 500, 260, 'sky', { r: 24, id: `w${x}` });
        d.ellipse(x + 250, -20, 360, 90, 'hill', { flat: true, clip: `w${x}` });
      }
    } },
  },
  seats: {
    name: 'Seats', plane: 'mid', order: 0, at: [960, 1010],
    spec: { colors: { seat: '#2F5E8C', cushion: '#3B6FA0', leg: '#5A636C' }, bounds: [-1000, -340, 2000, 350], draw: (d) => {
      for (const x of [-900, 500]) { d.rect(x, -340, 60, 280, 'seat', { r: 16 }); d.rect(x, -120, 360, 70, 'cushion', { r: 14 }); d.rect(x + 20, -50, 16, 50, 'leg', { flat: true }); d.rect(x + 320, -50, 16, 50, 'leg', { flat: true }); }
    } },
  },
  floor: floor('Carriage floor', { floor: '#5A636C', strip: '#E8C64A' }, (d) => { d.rect(-1400, -460, 2800, 10, 'strip', { flat: true }); }),
};

export const FOREST_KIT: KitParts = {
  sky: {
    name: 'Enchanted sky', plane: 'far', order: 0, at: [960, 700],
    spec: { colors: { sky: '#2E3F6B', glow: '#7FD3C4', moon: '#F7F1CF', far: '#24456A' }, bounds: [-1600, -800, 3200, 900], draw: (d) => {
      d.rect(-1600, -800, 3200, 900, 'sky', { flat: true });
      d.ellipse(700, -560, 70, 70, 'moon', { flat: true });
      d.ellipse(0, -100, 1600, 300, 'glow', { flat: true, opacity: 0.25 });
      for (let i = 0; i < 14; i++) d.poly([[-1600 + i * 240, 100], [-1480 + i * 240, -380 - (i % 3) * 60], [-1360 + i * 240, 100]], 'far', { flat: true });
    } },
  },
  trees: {
    name: 'Giant trees', plane: 'back', order: 0, at: [960, 1000],
    spec: { colors: { trunk: '#4A3A5A', leaf: '#2F6B57', leaf2: '#3F8C6E', mush: '#C94F6D', dot: '#F4EEE4' }, bounds: [-1300, -900, 2600, 910], draw: (d) => {
      for (const [x, s] of [[-1050, 1.2], [-500, 0.9], [600, 1.1], [1150, 1]] as const) {
        d.poly([[x - 50 * s, 0], [x - 30 * s, -500 * s], [x + 30 * s, -500 * s], [x + 50 * s, 0]], 'trunk');
        d.ellipse(x, -600 * s, 220 * s, 170 * s, 'leaf', { flat: true }); d.ellipse(x + 90 * s, -700 * s, 140 * s, 110 * s, 'leaf2', { flat: true });
      }
      for (const x of [-800, 300, 900]) { d.rect(x - 8, -60, 16, 60, 'dot', { flat: true }); d.ellipse(x, -66, 50, 30, 'mush', { flat: true }); d.ellipse(x - 15, -72, 7, 6, 'dot', { flat: true }); d.ellipse(x + 18, -64, 6, 5, 'dot', { flat: true }); }
    } },
  },
  floor: floor('Mossy ground', { floor: '#2F5E4A', moss: '#3F7A5E', glow: '#7FD3C4' }, (d) => {
    for (let i = 0; i < 26; i++) d.ellipse(-1380 + ((i * 263) % 2760), -420 + ((i * 97) % 380), 40, 12, 'moss', { flat: true });
    for (let i = 0; i < 18; i++) d.ellipse(-1380 + ((i * 419) % 2760), -440 + ((i * 151) % 400), 4, 4, 'glow', { flat: true, opacity: 0.8 });
  }),
};
