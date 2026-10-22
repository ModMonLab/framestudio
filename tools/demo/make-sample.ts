/**
 * Writes the M1 sample project (two hosts in the podcast kit, two lines) to a folder.
 * `--takes fixture` adds fixture takes (test signals, labelled as not real speech) so it plays and exports without
 * a worker; without it the lines have no takes and voices must be designed and takes generated in the Studio.
 * Usage: pnpm tsx tools/demo/make-sample.ts <folder> [--family illustrated] [--takes fixture]
 */
import path from 'node:path';
import { ProjectStore, encodeWav } from '../../packages/io/src/index.js';
import { buildSampleScene, fixtureSpeechPcm } from '../test/sample-scene.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('Usage: make-sample.ts <folder> [--family flat|illustrated] [--takes fixture]');
  process.exit(1);
}
const family = args.includes('--family') ? (args[args.indexOf('--family') + 1] as 'flat' | 'illustrated') : 'flat';
const withTakes = args.includes('--takes');
const { session } = buildSampleScene(family, { takes: withTakes });
const store = ProjectStore.create(path.resolve(dir), session.state);
if (withTakes) {
  for (const take of Object.values(session.state.takes)) {
    const pcm = fixtureSpeechPcm(take.durationS!, take.alignment!);
    const media = store.putMedia(encodeWav({ sampleRate: 24000, channels: 1, data: [pcm] }), { ext: 'wav', mime: 'audio/wav', durationS: take.durationS, sampleRate: 24000, channels: 1 });
    session.apply({ commands: [{ name: 'take.update', params: { id: take.id, set: { media } } }] });
  }
}
store.save(session.state, session.revision, ['*']);
console.log(`Wrote ${path.resolve(dir)}${withTakes ? ' (fixture takes: not real speech)' : ''}`);
