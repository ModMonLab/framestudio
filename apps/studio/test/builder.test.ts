import { describe, expect, it } from 'vitest';
import { randomise, type Draft, type RandomiseOptions } from '../src/lib/builder.js';

const draft = (): Draft => ({ name: 'Ana', data: { parts: { hair: 'hair.a@1', eyes: 'eyes.a@1' }, colors: { skin: '#111111', hair: '#222222' }, bodyBase: 'body.a@1', body: { height: 1 }, lifeStage: 'stage.adult@1', looks: [], defaultLook: 'l1', controls: {} } as never });
const opts = (keep: RandomiseOptions['keep']): RandomiseOptions => ({ parts: { hair: ['hair.b@1', 'hair.c@1'], eyes: ['eyes.b@1'] }, skins: ['#AAAAAA'], hairColors: ['#BBBBBB'], bodies: ['body.b@1'], lifeStages: ['stage.child@1'], keep });

describe('randomise within constraints (FR-BLD-05)', () => {
  it('keeps what is kept and varies the rest, deterministically per seed', () => {
    const a = randomise(draft(), opts({ lifeStage: true, body: true, palette: true, family: true }), 3);
    expect(a.data.lifeStage).toBe('stage.adult@1');
    expect(a.data.bodyBase).toBe('body.a@1');
    expect(a.data.colors).toEqual({ skin: '#111111', hair: '#222222' });
    expect(a.data.parts.eyes).toBe('eyes.b@1');
    expect(a.name).toBe('Ana');
    const b = randomise(draft(), opts({ lifeStage: false, body: false, palette: false, family: true }), 3);
    expect(b.data.lifeStage).toBe('stage.child@1');
    expect(b.data.bodyBase).toBe('body.b@1');
    expect(b.data.colors).toEqual({ skin: '#AAAAAA', hair: '#BBBBBB' });
    expect(randomise(draft(), opts({ lifeStage: false, body: false, palette: false, family: true }), 3)).toEqual(b);
  });
});
