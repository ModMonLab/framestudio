/**
 * Performance measurement (AC-14; NFR-01, NFR-02, NFR-05): builds the reference project — four characters, 30 props,
 * atmosphere and captions — and measures edit latency, preview frame rate and export speed on this machine.
 * Writes docs/acceptance/performance.md (`pnpm bench:perf`). Results on any machine other than the reference
 * laptop are indicative only; AC-14 is decided on the reference machine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { evaluateFrame, secondsToTicks as s, trackFor, type ProjectSession } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import { ProjectStore, encodeWav } from '@frame/io';
import { createNodeRenderer } from '../../packages/render/src/node.js';
import { runCli } from '../../packages/cli/src/index.js';
import { buildSampleScene, fixtureSpeechPcm } from '../test/sample-scene.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lib = bundledLibrary(path.join(repo, 'content'));
const styles = loadStyles(path.join(repo, 'content'));
const assets = { manifest: (r: string) => lib.manifest(r) };
const DURATION = Math.max(12, Number(process.env.BENCH_SECONDS ?? 30));
const EXPORT_SECONDS = Number(process.env.BENCH_EXPORT_SECONDS ?? 10);

/** The AC-14 reference scene: the podcast sample plus two more characters, 30 props in all, rain at night and captions. */
export function referenceScene(family: 'flat' | 'illustrated') {
  const built = buildSampleScene(family);
  const { session, scene } = built;
  const apply = (commands: { name: string; params: Record<string, unknown> }[]) => session.apply({ commands });
  apply([{ name: 'scene.setDuration', params: { id: scene, durationS: DURATION } }]);
  for (const [i, ref] of ['chr.priya-nair@1', 'chr.sam-ortiz@1'].entries()) {
    const look = (lib.manifest(ref)!.data as { defaultLook: string }).defaultLook;
    const id = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: ref, name: ref, transform: { x: 300 + i * 1320, y: 1010, scale: 0.9, flipX: i === 1 }, character: { look, view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }]).commands[0]!.params.id as string;
    apply([{ name: 'clip.add', params: { scene, track: trackFor(session.state.scenes[scene]!, id, 'acting')!.id, start: 0, end: s(DURATION), asset: 'act.breathe@1' } }]);
  }
  const props = lib.search('', { kind: 'prop', limit: 500 }).map((h) => h.ref).filter((r) => (lib.manifest(r)!.data as { slot?: string }).slot === 'prop');
  const have = session.state.scenes[scene]!.instances.filter((i) => i.kind === 'prop').length;
  apply(props.slice(0, 30 - have).map((asset, i) => ({ name: 'instance.add', params: { scene, kind: 'prop', asset, name: asset, transform: { x: 80 + (i % 11) * 175, y: i < 11 ? 640 : i < 22 ? 900 : 1070, scale: 0.35 }, depthPlane: i < 11 ? 'back' : i < 22 ? 'mid' : 'front' } })));
  const fx = session.state.scenes[scene]!.tracks.find((t) => t.kind === 'effect' && t.owner === 'scene')!.id;
  apply([
    { name: 'clip.add', params: { scene, track: fx, start: 0, end: s(DURATION), asset: 'atmo.night@1' } },
    { name: 'clip.add', params: { scene, track: fx, start: 0, end: s(DURATION), asset: 'atmo.heavy-rain@1' } },
    { name: 'project.setSettings', params: { captions: { enabled: true, burnIn: true, speakerLabels: true, style: 'txt.boxed-captions@1' } } },
  ]);
  return built;
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

async function main() {
  const r = await createNodeRenderer({ fontsDir: path.join(repo, 'content/fonts') });
  const out: string[] = [];
  const results: Record<string, { value: string; target: string; pass: boolean }> = {};
  const { session, scene, maya } = referenceScene('flat');
  const counts = session.state.scenes[scene]!.instances.reduce<Record<string, number>>((m, i) => ({ ...m, [i.kind]: (m[i.kind] ?? 0) + 1 }), {});

  // NFR-01: an ordinary edit (move a character) applied, evaluated and drawn at preview size — 50 interactions.
  const frame = (sess: ProjectSession, t: number, w = 960, h = 540) => r.rgba(evaluateFrame(sess.state, scene, s(t), { assets, styles, width: w, height: h, captions: true }).frame);
  frame(session, 1);
  const edits: number[] = [];
  for (let i = 0; i < 50; i++) {
    const t0 = performance.now();
    session.apply({ commands: [{ name: 'instance.update', params: { scene, id: maya, set: { transform: { x: 640 + (i % 5) * 4 } } } }] });
    frame(session, 1);
    edits.push(performance.now() - t0);
  }
  const p95 = pct(edits, 95);
  results['NFR-01 edit → canvas, p95 of 50 (ms)'] = { value: p95.toFixed(1), target: '≤ 100', pass: p95 <= 100 };

  // NFR-02: playback at preview resolution (960×540) over the whole scene at 24 fps.
  const frames = DURATION * 24;
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) frame(session, f / 24);
  const fps = frames / ((performance.now() - t0) / 1000);
  results[`NFR-02 preview playback, ${DURATION} s at 960×540 (fps)`] = { value: fps.toFixed(1), target: '≥ 24', pass: fps >= 24 };

  // NFR-05: offline export at 1080p24, Flat and Illustrated (with atmosphere), through the CLI.
  for (const family of ['flat', 'illustrated'] as const) {
    const { session: ex, scene: exScene } = referenceScene(family);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-bench-'));
    const store = ProjectStore.create(dir, ex.state);
    for (const take of Object.values(ex.state.takes)) {
      const media = store.putMedia(encodeWav({ sampleRate: 24000, channels: 1, data: [fixtureSpeechPcm(take.durationS!, take.alignment!)] }), { ext: 'wav', mime: 'audio/wav', durationS: take.durationS, sampleRate: 24000, channels: 1 });
      ex.apply({ commands: [{ name: 'take.update', params: { id: take.id, set: { media } } }] });
    }
    store.save(ex.state, ex.revision, ['*']);
    let log = '';
    const e0 = performance.now();
    const code = await runCli(['render', 'video', '--project', dir, '--scene', exScene, '--preset', 'out.landscape-hd', '--from', '0', '--to', String(EXPORT_SECONDS), '--out', path.join(dir, 'bench.mp4'), '--json'], { stdout: (x) => (log += x), stderr: (x) => (log += x), cwd: dir, env: {} });
    const secs = (performance.now() - e0) / 1000;
    if (code !== 0) throw new Error(`export failed: ${log}`);
    const rt = EXPORT_SECONDS / secs;
    const target = family === 'flat' ? 1 : 0.5;
    results[`NFR-05 export 1080p24 ${family === 'flat' ? 'Flat' : 'Illustrated with effects'}, ${EXPORT_SECONDS} s (× real time)`] = { value: rt.toFixed(2), target: `≥ ${target}`, pass: rt >= target };
    fs.rmSync(dir, { recursive: true, force: true });
  }
  r.dispose();

  const cpu = os.cpus()[0];
  out.push(
    '# Performance measurements (AC-14)',
    '',
    `Generated by \`pnpm bench:perf\` on ${new Date().toISOString().slice(0, 10)}. **Indicative only:** AC-14 is decided on the reference laptop (owner checklist); this run used the machine below.`,
    '',
    `Machine: ${os.type()} ${os.release()} · ${os.cpus().length} × ${cpu?.model ?? 'unknown CPU'} · ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB RAM · Node ${process.version} · CPU rendering (CanvasKit), no GPU.`,
    '',
    `Reference scene: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ')}; night lighting and heavy rain; burned-in captions; ${DURATION} s.`,
    '',
    '| Measurement | Result | Target | Pass |',
    '|---|---|---|---|',
    ...Object.entries(results).map(([k, v]) => `| ${k} | ${v.value} | ${v.target} | ${v.pass ? 'yes' : 'no'} |`),
    '',
    'NFR-01 here times the engine and renderer path of an edit (apply, evaluate, draw); the Studio adds React and the browser on top.',
    'NFR-02 here renders every frame at preview size in Node with the same renderer the Studio uses in the browser.',
    '',
  );
  fs.mkdirSync(path.join(repo, 'docs/acceptance'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs/acceptance/performance.md'), out.join('\n'));
  console.log(out.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
