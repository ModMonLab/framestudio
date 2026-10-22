/** Per-item authoring specs for catalog lists produced by the parametric generators. */
import type { TopSpec, BottomSpec, ShoeSpec } from './parts/wardrobe.js';

const T = (o: Partial<TopSpec> & Pick<TopSpec, 'color'>): TopSpec => ({ sleeve: 0.38, neck: 'crew', hem: 1.05, fit: 1.07, ...o });

export const TOPS: Record<string, TopSpec> = {
  't-shirt': T({ color: '#4F8F87' }),
  'long-sleeve-tee': T({ sleeve: 0.95, cuff: true, color: '#5B6C8F' }),
  'v-neck-tee': T({ neck: 'v', color: '#7A5C8F' }),
  'tank-top': T({ sleeve: 0, neck: 'tank', color: '#D98E4A' }),
  polo: T({ neck: 'collar', buttons: true, color: '#2F5D8C' }),
  'button-up-shirt': T({ sleeve: 0.95, neck: 'collar', buttons: true, cuff: true, color: '#E8EEF4', options: { sleeves: ['down', 'rolled'] } }),
  blouse: T({ sleeve: 0.9, neck: 'v', fit: 1.1, cuff: true, color: '#F2D7D9' }),
  'ribbed-sweater': T({ sleeve: 0.95, ribs: true, cuff: true, fit: 1.08, color: '#C8653F' }),
  'crewneck-sweater': T({ sleeve: 0.95, cuff: true, fit: 1.09, color: '#8C9A6B' }),
  turtleneck: T({ sleeve: 0.95, neck: 'turtle', cuff: true, color: '#2F2F36' }),
  cardigan: T({ sleeve: 0.95, neck: 'v', buttons: true, cuff: true, fit: 1.1, color: '#B58A5A', options: { front: ['buttoned', 'open'] } }),
  hoodie: T({ sleeve: 0.95, hood: true, pocket: true, cuff: true, fit: 1.12, color: '#6E7A8A', options: { hood: ['down', 'up'] } }),
  sweatshirt: T({ sleeve: 0.95, cuff: true, fit: 1.12, color: '#9AA5B1' }),
  'crop-top': T({ hem: 0.62, color: '#E0A1B4' }),
  'graphic-tee': T({ print: true, color: '#2E2E33' }),
  henley: T({ sleeve: 0.95, neck: 'henley', buttons: true, color: '#C9B48F' }),
  'flannel-shirt': T({ sleeve: 0.95, neck: 'collar', buttons: true, check: true, cuff: true, color: '#A8433A', options: { sleeves: ['down', 'rolled'] } }),
  'uniform-shirt': T({ neck: 'collar', buttons: true, badge: true, pocket: true, color: '#5E7FA6' }),
};

const O = (o: Partial<TopSpec> & Pick<TopSpec, 'color'>): TopSpec => ({ sleeve: 0.95, neck: 'open', hem: 1.12, fit: 1.16, slot: 'outer', colorSlot: 'outer', open: true, cuff: true, ...o });

export const OUTERS: Record<string, TopSpec> = {
  blazer: O({ lapels: true, color: '#33405A', options: { front: ['open', 'closed'] } }),
  'suit-jacket': O({ lapels: true, buttons: true, color: '#2B2F3A', options: { front: ['open', 'closed'] } }),
  'denim-jacket': O({ neck: 'collar', buttons: true, pocket: true, hem: 0.95, color: '#4A6B92' }),
  'leather-jacket': O({ lapels: true, zip: true, hem: 0.95, color: '#2A2422' }),
  'bomber-jacket': O({ zip: true, puffy: false, ribs: true, hem: 0.95, color: '#5A6B4A' }),
  parka: O({ zip: true, hood: true, hem: 1.45, puffy: true, color: '#7A6A4F', options: { hood: ['down', 'up'] } }),
  'trench-coat': O({ lapels: true, buttons: true, belt: true, hem: 1.9, color: '#C2A57A' }),
  raincoat: O({ zip: true, hood: true, hem: 1.6, color: '#E8C342', options: { hood: ['down', 'up'] } }),
  'puffer-jacket': O({ zip: true, puffy: true, hem: 1.0, color: '#3F6E9A' }),
  vest: O({ sleeve: 0, vest: false, buttons: true, neck: 'v', hem: 1.0, fit: 1.1, color: '#5B4B3E' }),
  'lab-coat': O({ lapels: true, pocket: true, hem: 1.95, color: '#F4F6F8' }),
  apron: O({ apron: true, sleeve: 0, color: '#3A4F5C' }),
  'hi-vis-vest': O({ sleeve: 0, zip: true, hiVis: true, hem: 1.0, neck: 'v', color: '#E7E04A' }),
  cape: O({ cape: true, sleeve: 0, color: '#7A2E3A' }),
};

const B = (o: Partial<BottomSpec> & Pick<BottomSpec, 'color'>): BottomSpec => ({ leg: 0.97, width: 1.2, ...o });

export const BOTTOMS: Record<string, BottomSpec> = {
  trousers: B({ color: '#3B3F4A', seams: true }),
  jeans: B({ color: '#3E5E86', seams: true, pockets: true }),
  chinos: B({ color: '#B8A27A', pockets: true }),
  'cargo-pants': B({ width: 1.32, color: '#5C6448', pockets: true }),
  joggers: B({ width: 1.28, cuffs: true, color: '#55585F' }),
  shorts: B({ leg: 0.42, width: 1.38, color: '#7A8C6E' }),
  skirt: B({ leg: 0, skirt: 0.5, color: '#2F4858' }),
  'pencil-skirt': B({ leg: 0, skirt: 0.55, color: '#2B2B33' }),
  'pleated-skirt': B({ leg: 0, skirt: 0.5, pleats: true, color: '#7A3B4F' }),
  'long-skirt': B({ leg: 0, skirt: 0.95, color: '#5E7A6A' }),
  leggings: B({ width: 1.04, color: '#26262B' }),
  'suit-trousers': B({ color: '#2B2F3A', seams: true }),
  overalls: B({ bib: true, color: '#4A6B92', pockets: true }),
};

const D = (o: Partial<TopSpec> & Pick<TopSpec, 'color'>): TopSpec => ({ sleeve: 0.38, neck: 'scoop', hem: 1.05, fit: 1.08, slot: 'dress', colorSlot: 'dress', skirt: 0.55, ...o });

export const DRESSES: Record<string, TopSpec> = {
  'casual-dress': D({ color: '#D9845B' }),
  'shirt-dress': D({ neck: 'collar', buttons: true, belt: true, color: '#9FB5C9' }),
  'wrap-dress': D({ neck: 'v', wrap: true, color: '#7A3B5A' }),
  'evening-gown': D({ sleeve: 0, neck: 'tank', skirt: 1.0, color: '#2D2A4A' }),
  sundress: D({ sleeve: 0, neck: 'tank', color: '#F0C75E' }),
  jumpsuit: D({ legs: 0.97, sleeve: 0.95, neck: 'v', skirt: 0, belt: true, color: '#4F6B5A' }),
  'business-suit': D({ legs: 0.97, sleeve: 0.95, neck: 'open', lapels: true, buttons: true, skirt: 0, color: '#2B2F3A' }),
  tracksuit: D({ legs: 0.97, sleeve: 0.95, neck: 'collar', zip: true, skirt: 0, cuff: true, color: '#2F5D8C' }),
  'hospital-scrubs': D({ legs: 0.97, neck: 'v', pocket: true, skirt: 0, color: '#4FA3A0' }),
  pyjamas: D({ legs: 0.97, sleeve: 0.95, neck: 'collar', buttons: true, skirt: 0, stripes: true, color: '#8FA6C9' }),
  robe: D({ sleeve: 0.9, neck: 'v', belt: true, skirt: 0.8, fit: 1.15, color: '#B08FA6' }),
  kurta: D({ sleeve: 0.95, neck: 'henley', buttons: true, skirt: 0.45, color: '#E3D3B0' }),
  abaya: D({ sleeve: 0.97, neck: 'crew', skirt: 1.0, fit: 1.15, color: '#26262E' }),
  'kimono-style-robe': D({ sleeve: 0.9, neck: 'v', belt: true, skirt: 0.85, fit: 1.14, color: '#3F5E8C' }),
};

export const SHOES: Record<string, ShoeSpec> = {
  'canvas-sneakers': { base: 'sneaker', color: '#EFE6D6', sole: '#B8AE9C', laces: true },
  'running-shoes': { base: 'sneaker', color: '#4F7CC8', sole: '#F2F2F2', laces: true },
  loafers: { base: 'flat', color: '#5A3B2A', sole: '#2A1D16' },
  oxfords: { base: 'flat', color: '#2A1D16', sole: '#14100D', laces: true },
  'ballet-flats': { base: 'flat', color: '#C77E8A', sole: '#7A4B52' },
  sandals: { base: 'flat', color: '#8A5A3A', sole: '#3F2A1D', open: true },
  slippers: { base: 'flat', color: '#B7A9C9', sole: '#8A7FA0' },
  'ankle-boots': { base: 'boot', color: '#5A3B2A', sole: '#21160F', shaft: 0.15 },
  'knee-boots': { base: 'boot', color: '#2A1D16', sole: '#14100D', shaft: 0.5 },
  'work-boots': { base: 'boot', color: '#9A6B3A', sole: '#3A2A1D', shaft: 0.18, laces: true },
  heels: { base: 'heel', color: '#9A2E3A', sole: '#2A1012' },
  wedges: { base: 'heel', color: '#C9A57A', sole: '#8A6A4A' },
};
