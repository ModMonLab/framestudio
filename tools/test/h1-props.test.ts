/** The full prop library (Catalog H1): every prop exists, its states look different, its anchors and sound cues resolve. */
import { expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import { propClock } from '@frame/core';
import { bundledLibrary } from '@frame/assets/node';
import type { PartData, ShapeDef } from '@frame/rig';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lib = bundledLibrary(path.join(repo, 'content'));
const list = yaml.parse(fs.readFileSync(path.join(repo, 'catalog/lists/37-h1-prop.yaml'), 'utf8')) as { items: { id: string; categoryType: string }[] };

const visible = (shapes: ShapeDef[], state: string) => shapes.filter((s) => !s.when?.state || [s.when.state].flat().includes(state));

it('every catalog prop is in the library with Flat and Illustrated art', () => {
  for (const { id } of list.items) {
    const m = lib.manifest(`${id}@1`);
    expect(m, id).toBeTruthy();
    expect(m!.families.sort(), id).toEqual(['flat', 'illustrated']);
  }
});

it('each state of a prop draws something and differs from its other states; anchors match capabilities', () => {
  for (const { id, categoryType } of list.items) {
    const m = lib.manifest(`${id}@1`)!;
    const d = m.data as PartData;
    if (d.slot !== 'prop') continue; // worn props (party hat, backpack) are rig parts
    const states = d.options?.state ?? [];
    for (const fam of ['flat', 'illustrated'] as const) {
      const shapes = d.families[fam]!.views.front!.layers.flatMap((l) => l.shapes ?? []);
      expect(visible(shapes, states[0] ?? 'default').length, id).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const st of states) {
        const key = JSON.stringify(visible(shapes, st));
        expect(seen.has(key), `${id} state ${st} looks like another state`).toBe(false);
        seen.add(key);
      }
    }
    const anchors = m.anchors as Record<string, unknown>;
    if (/seat anchor/.test(categoryType)) expect(Object.keys(anchors).some((k) => /^seat/.test(k) && k !== 'seatFacing'), `${id} seat`).toBe(true);
    if (/\(grip/.test(categoryType)) expect(anchors.grip, `${id} grip`).toBeTruthy();
    if (/lie anchor/.test(categoryType)) expect(anchors.lie, `${id} lie`).toBeTruthy();
    if (/open\/closed|closed\/open/.test(categoryType)) expect(states.some((s) => s === 'open'), `${id} open state`).toBe(true);
  }
});

it('sofas and benches offer several seats', () => {
  for (const [id, n] of [['prop.sofa', 3], ['prop.bench', 2], ['prop.park-bench', 2]] as const) {
    const a = lib.manifest(`${id}@1`)!.anchors as Record<string, unknown>;
    expect(Object.keys(a).filter((k) => /^seat/.test(k) && k !== 'seatFacing').length, id).toBe(n);
  }
});

it('prop sound cues point at sounds in the library', () => {
  for (const { id } of list.items) {
    const sounds = (lib.manifest(`${id}@1`)!.data as PartData).sounds ?? {};
    for (const [ev, ref] of Object.entries(sounds)) expect(lib.manifest(ref), `${id} ${ev} → ${ref}`).toBeTruthy();
  }
});

it('animation drivers rest at zero, tick once a second and cycle in three steps', () => {
  const at0 = propClock(0, 0);
  expect(at0['anim.spinC1']).toBeCloseTo(0);
  expect(at0['anim.spinS']).toBeCloseTo(0);
  expect(propClock(0.4, 0)['anim.tickS']).toBe(0);
  expect(propClock(15, 0)['anim.tickS']).toBeCloseTo(1);
  const lit = [0, 2, 4].map((s) => [0, 1, 2].map((i) => propClock(s, 0)[`anim.cycle${i}`]));
  expect(lit).toEqual([[1, -1, -1], [-1, 1, -1], [-1, -1, 1]]);
});
