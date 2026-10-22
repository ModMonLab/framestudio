import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../src/index.js';

async function frame(args: string[], cwd: string, env: Record<string, string> = {}) {
  let out = '';
  let err = '';
  const code = await runCli([...args, '--json'], { stdout: (s) => (out += s), stderr: (s) => (err += s), cwd, env });
  return { code, json: JSON.parse(out) as any, err };
}

describe('frame assets / char / package (FR-CLI-05, FR-IMP-04, FR-DAT-10/11)', () => {
  it('creates a character, exports it as .framechar, imports it into another project, and moves a project as .frameproj', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-cli-pkg-'));
    const env = { FRAME_USER_DIR: path.join(dir, 'user-library') };
    await frame(['init', 'A.frame', '--name', 'A'], dir, env);
    await frame(['init', 'B.frame', '--name', 'B'], dir, env);
    const a = path.join(dir, 'A.frame');
    const created = await frame(['char', 'create', '--from', 'chr.aiko-tanaka', '--name', 'Robin', '--spec', '{"parts":{"hair":"hair.afro@1"}}'], a, env);
    expect(created.err).toBe('');
    expect(created.code).toBe(0);
    const ref = created.json.result.ref as string;
    expect(ref).toMatch(/^user\..+@1$/);

    const search = await frame(['assets', 'search', 'Robin'], a, env);
    expect(search.json.result.results[0]).toMatchObject({ ref, source: 'project' });

    const exp = await frame(['char', 'export', ref, '--out', path.join(dir, 'robin.framechar')], a, env);
    expect(exp.code).toBe(0);
    // The bundled cast's starter voice is not authored yet (CAT-09): reported, not fatal.
    expect(exp.json.result.unresolved).toEqual(expect.any(Array));
    expect(exp.json.result.requires).toBeGreaterThan(5);

    const b = path.join(dir, 'B.frame');
    const dry = await frame(['char', 'import', path.join(dir, 'robin.framechar'), '--dry-run'], b, env);
    expect(dry.json.result.added).toEqual([ref]);
    const imp = await frame(['char', 'import', path.join(dir, 'robin.framechar')], b, env);
    expect(imp.code).toBe(0);
    const show = await frame(['assets', 'show', ref], b, env);
    expect(show.json.result.source).toBe('project');
    // A voice package is refused by `char import`.
    expect((await frame(['voice', 'import', path.join(dir, 'robin.framechar')], b, env)).code).toBe(2);

    const pkg = await frame(['package', 'export', '--out', path.join(dir, 'a.frameproj')], a, env);
    expect(pkg.code).toBe(0);
    const opened = await frame(['package', 'import', path.join(dir, 'a.frameproj'), path.join(dir, 'Copy.frame')], dir, env);
    expect(opened.code).toBe(0);
    expect(opened.json.result.project.name).toBe('A');
    const v = await frame(['validate', '--project', path.join(dir, 'Copy.frame')], dir, env);
    expect(v.json.result.valid).toBe(true);
    expect((await frame(['assets', 'show', ref, '--project', path.join(dir, 'Copy.frame')], dir, env)).json.result.source).toBe('project');
  });

  it('validates manifests with the rig check', async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content/assets/hair');
    const r = await frame(['assets', 'validate', root], process.cwd());
    expect(r.code).toBe(0);
    expect(r.json.result.checked).toBeGreaterThan(5);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-cli-val-'));
    fs.writeFileSync(path.join(dir, 'bad.json'), '{"id":"x"}');
    expect((await frame(['assets', 'validate', dir], dir)).code).toBe(2);
  });
});
