/** Facial hair (A11) and fringes (A10): every style passes the rig check; facial hair follows the speech mouth shapes. */
import { expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledLibrary } from '@frame/assets/node';
import { rigCheck, rigCheckPasses, type PartData } from '@frame/rig';

const lib = bundledLibrary(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content'));

it('every fringe and facial-hair style is in the library and passes the rig check', () => {
  const fh = lib.byKind('facial-hair');
  const fr = lib.byKind('fringe');
  expect(fh.length).toBe(15);
  expect(fr.length).toBe(8);
  for (const e of [...fh, ...fr]) expect(rigCheckPasses(rigCheck(e.manifest.data as PartData)), e.manifest.id).toBe(true);
});

it('beards and moustaches have art for all nine mouth shapes in every drawn view, so they follow speech', () => {
  for (const id of ['facial-hair.full-beard', 'facial-hair.moustache', 'facial-hair.goatee', 'facial-hair.soul-patch']) {
    const d = lib.byKind('facial-hair').find((x) => x.manifest.id === id)!.manifest.data as PartData;
    for (const fam of ['flat', 'illustrated'] as const) for (const view of ['front', 'three', 'side'] as const) {
      const letters = new Set(d.families[fam]!.views[view]!.layers.flatMap((l) => (l.when?.mouth ? [l.when.mouth].flat() : [])));
      expect([...letters].sort(), `${id} ${fam} ${view}`).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']);
    }
  }
});
