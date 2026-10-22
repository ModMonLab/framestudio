import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { duplicateProject, moveToTrash, RecentProjects, ProjectStore } from '../src/index.js';
import { newProject, tmpdir } from './helpers.js';

describe('project browser support (FR-PRJ-06)', () => {
  it('keeps recent projects newest first, keeps pins, forgets, and flags missing folders', () => {
    const r = new RecentProjects(path.join(tmpdir(), 'recent.json'), 3);
    const a = newProject();
    a.flush();
    const b = newProject();
    b.flush();
    r.touch(a.store.root, a.state, '2026-01-01T00:00:00Z');
    r.touch(b.store.root, b.state, '2026-01-02T00:00:00Z');
    expect(r.list().map((e) => e.root)).toEqual([b.store.root, a.store.root]);
    expect(r.list()[0]).toMatchObject({ name: 'Show', episodes: 1, scenes: 1, exists: true });
    r.update(a.store.root, { pinned: true });
    // Over the limit, unpinned entries drop; the pin stays.
    for (let i = 0; i < 4; i++) r.touch(`/nowhere/${i}`, b.state, `2026-02-0${i + 1}T00:00:00Z`);
    const roots = r.list().map((e) => e.root);
    expect(roots).toContain(a.store.root);
    expect(roots).toHaveLength(3);
    expect(r.list().find((e) => e.root === '/nowhere/3')!.exists).toBe(false);
    r.forget(a.store.root);
    expect(r.list().some((e) => e.root === a.store.root)).toBe(false);
  });

  it('duplicates a project with a new id, its media, and refuses a non-empty target', () => {
    const a = newProject();
    const m = a.store.putMedia(new TextEncoder().encode('sound'), { ext: 'wav', mime: 'audio/wav' });
    a.flush();
    const dest = path.join(tmpdir(), 'Copy.frame');
    duplicateProject(a.store.root, dest, { projectId: 'prj_copy01', name: 'Show copy' });
    const st = new ProjectStore(dest).load().state;
    expect(st.project).toMatchObject({ id: 'prj_copy01', name: 'Show copy' });
    expect(Object.keys(st.scenes)).toEqual(Object.keys(a.state.scenes));
    expect(fs.readdirSync(path.join(dest, 'assets/media')).some((f) => f.includes(m.hash.replace('sha256-', '')))).toBe(true);
    expect(() => duplicateProject(a.store.root, dest, { projectId: 'prj_copy02', name: 'x' })).toThrow(/not empty/);
  });

  it('moves a folder to the freedesktop trash with a restore record', () => {
    const data = tmpdir();
    const a = newProject();
    a.flush();
    a.close();
    const where = moveToTrash(a.store.root, { env: { XDG_DATA_HOME: data }, platform: 'linux', now: new Date('2026-10-22T10:00:00Z') });
    expect(fs.existsSync(a.store.root)).toBe(false);
    expect(fs.existsSync(path.join(where, 'project.json'))).toBe(true);
    const info = fs.readFileSync(path.join(data, 'Trash/info', `${path.basename(where)}.trashinfo`), 'utf8');
    expect(info).toContain(`Path=${encodeURI(a.store.root)}`);
    expect(info).toContain('DeletionDate=2026-10-22T10:00:00');
  });
});
