// Child process for the NFR-08 crash test: performs random edits and prints "<revision> <stateHash>" after each commit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { prng } from '@frame/core';
import { OpenProject, stableStringify } from '../../src/index.js';

const [dir, seedArg, countArg, logFile] = process.argv.slice(2);
const log = fs.openSync(logFile!, 'a');
// Synchronous writes reach the kernel before the next edit, so SIGKILL cannot lose them.
const emit = (s: string) => fs.writeSync(log, s);
const rand = prng(Number(seedArg));
const p = OpenProject.open(dir!, { debounceMs: 5 });
const hash = () => crypto.createHash('sha256').update(stableStringify(p.state)).digest('hex');
const CHAR = { look: 'default', view: 'front', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } };
emit(`${p.session.revision} ${hash()}\n`);
let n = 0;
const step = () => {
  if (n++ >= Number(countArg)) return p.close();
  const scenes = Object.keys(p.state.scenes);
  const scene = scenes[Math.floor(rand() * scenes.length)]!;
  const ep = p.state.sceneEpisode[scene]!;
  const sc = p.state.scenes[scene]!;
  const r = rand();
  const cmds =
    r < 0.25 ? [{ name: 'scene.rename', params: { id: scene, name: `S${Math.floor(rand() * 1e6)}` } }]
    : r < 0.4 ? [{ name: 'scene.add', params: { episode: ep, name: 'New' } }]
    : r < 0.5 && scenes.length > 1 && p.state.episodes[ep]!.scenes.length > 1 ? [{ name: 'scene.delete', params: { id: scene } }]
    : r < 0.7 ? [{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.test-a@1', name: 'C', character: CHAR, transform: { x: Math.floor(rand() * 1900) } } }]
    : r < 0.9 && sc.instances.length ? [{ name: 'instance.update', params: { scene, id: sc.instances[Math.floor(rand() * sc.instances.length)]!.id, set: { transform: { x: Math.floor(rand() * 1900), y: Math.floor(rand() * 1000) } } } }]
    : [{ name: 'scene.setNotes', params: { id: scene, notes: 'n'.repeat(Math.floor(rand() * 200)) } }];
  try {
    p.session.apply({ commands: cmds });
    emit(`${p.session.revision} ${hash()}\n`);
  } catch (e) {
    if (process.env.DBG) console.error(String(e));
    /* invalid random edit: skipped */
  }
  setImmediate(step);
};
step();
