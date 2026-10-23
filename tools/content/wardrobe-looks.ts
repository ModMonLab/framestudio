/** Preset looks (Catalog B7) and the standard environment layer stack (I3), as data. */
const g = (...ids: string[]) => ids.map((x) => `${x}@1`);

export const PRESET_LOOKS: Record<string, { garments: string[]; accessories: string[]; colors: Record<string, string> }> = {
  everyday: { garments: g('top.t-shirt', 'bottom.jeans', 'shoe.canvas-sneakers'), accessories: [], colors: {} },
  'on-air': { garments: g('top.crewneck-sweater', 'bottom.trousers', 'shoe.canvas-sneakers'), accessories: g('acc.headphones'), colors: {} },
  office: { garments: g('top.button-up-shirt', 'bottom.chinos', 'shoe.loafers'), accessories: [], colors: {} },
  executive: { garments: g('top.button-up-shirt', 'outer.suit-jacket', 'bottom.suit-trousers', 'shoe.oxfords'), accessories: g('acc.tie'), colors: { outer: '#2B2D33', bottom: '#2B2D33' } },
  evening: { garments: g('dress.evening-gown', 'shoe.heels'), accessories: g('acc.drop-earrings'), colors: {} },
  sporty: { garments: g('dress.tracksuit', 'shoe.running-shoes'), accessories: [], colors: {} },
  outdoor: { garments: g('top.long-sleeve-tee', 'outer.parka', 'bottom.cargo-pants', 'shoe.work-boots'), accessories: g('acc.beanie'), colors: {} },
  student: { garments: g('top.hoodie', 'bottom.jeans', 'shoe.canvas-sneakers'), accessories: g('acc.backpack'), colors: {} },
  teacher: { garments: g('top.cardigan', 'bottom.chinos', 'shoe.loafers'), accessories: g('acc.round-glasses'), colors: {} },
  doctor: { garments: g('dress.hospital-scrubs', 'outer.lab-coat', 'shoe.canvas-sneakers'), accessories: g('acc.lanyard-badge'), colors: {} },
  barista: { garments: g('top.t-shirt', 'outer.apron', 'bottom.jeans', 'shoe.canvas-sneakers'), accessories: [], colors: {} },
  'news-anchor': { garments: g('top.blouse', 'outer.blazer', 'bottom.trousers', 'shoe.ballet-flats'), accessories: [], colors: {} },
  sleepwear: { garments: g('dress.pyjamas', 'shoe.slippers'), accessories: [], colors: {} },
  'rainy-day': { garments: g('top.long-sleeve-tee', 'outer.raincoat', 'bottom.jeans', 'shoe.knee-boots'), accessories: [], colors: { outer: '#D9A441' } },
};

/** Default depth plane and parallax per layer of the stack every kit and set uses. */
export const LAYERS: Record<string, { plane: string; parallax: number }> = {
  sky: { plane: 'far', parallax: 0.1 },
  'distant-background': { plane: 'far', parallax: 0.25 },
  background: { plane: 'back', parallax: 0.5 },
  'main-setting': { plane: 'back', parallax: 0.75 },
  floor: { plane: 'ground', parallax: 1 },
  'set-pieces': { plane: 'mid', parallax: 1 },
  characters: { plane: 'mid', parallax: 1 },
  props: { plane: 'mid', parallax: 1 },
  foreground: { plane: 'front', parallax: 1.3 },
  'atmosphere-overlay': { plane: 'screen', parallax: 0 },
};
