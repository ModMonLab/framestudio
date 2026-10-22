/**
 * MCP server (FR-AGT-01..04, AC-13 path) driven by the SDK's own Client over an in-memory transport against a real
 * Frame Server. Voice steps run when FRAME_TEST_WORKER_URL is set (CI: fixture engine).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type FrameServer } from '@frame/server';
import { createFrameMcp, frameApi } from '../src/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKER = process.env.FRAME_TEST_WORKER_URL;
const REQUIRED = ['describe_capabilities', 'list_projects', 'open_project', 'get_project', 'get_scene', 'search_assets', 'get_asset', 'apply_commands', 'validate', 'create_character', 'design_voice', 'generate_takes', 'render_frame', 'render_video', 'job_status', 'undo', 'diff_revisions'];

describe('Frame MCP server (FR-AGT-01..04)', () => {
  let srv: FrameServer;
  let base = '';
  let client: Client;
  beforeAll(async () => {
    srv = await createServer({ contentDir: path.join(repo, 'content'), ...(WORKER ? { workerUrl: WORKER } : {}), debounceMs: 20 });
    base = await srv.app.listen({ port: 0, host: '127.0.0.1' });
    const mcp = createFrameMcp({ api: frameApi({ url: base, session: 'test-agent' }), waitMs: 120_000 });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await mcp.connect(a);
    client = new Client({ name: 'frame-test', version: '1.0.0' });
    await client.connect(b);
  });
  afterAll(async () => {
    await client?.close();
    await srv?.close();
  });

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text?: string; data?: string; mimeType?: string }[] };
    const text = r.content.find((c) => c.type === 'text')?.text;
    return { error: r.isError === true, json: text && text.startsWith('{') ? JSON.parse(text) : undefined, content: r.content };
  };
  const readJson = async (uri: string) => {
    const c = (await client.readResource({ uri })).contents[0]!;
    return JSON.parse('text' in c ? c.text : '');
  };
  const human = async (method: string, url: string, body?: unknown) => {
    const r = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, json: (await r.json()) as any };
  };

  it('lists every required tool with JSON Schema inputs and read-only hints (FR-AGT-01/02)', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of REQUIRED) expect(names).toContain(n);
    for (const t of tools) expect(t.inputSchema.type).toBe('object');
    expect(tools.find((t) => t.name === 'get_project')!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'apply_commands')!.annotations?.readOnlyHint).toBe(false);
    const caps = (await call('describe_capabilities')).json;
    expect(caps.session).toBe('agent:test-agent');
    expect(caps.commands.some((c: string) => c.startsWith('line.add'))).toBe(true);
  });

  it('creates a project, a character and lines; dry runs, conflicts, tagging, undo rules and revert (FR-AGT-02/04, AC-13 path)', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-mcp-')), 'Agent.frame');
    const created = await call('create_project', { path: dir, name: 'Agent show' });
    expect(created.error, JSON.stringify(created.json)).toBe(false);
    const pid = created.json.id as string;
    expect((await call('list_projects')).json.projects.map((p: any) => p.id)).toContain(pid);

    const summary = (await call('get_project')).json;
    expect(summary.name).toBe('Agent show');
    const scene = summary.episodes[0].scenes[0].id as string;

    // A character from a library base, placed in the scene; bad refs are rejected with reasons.
    const chars = (await call('search_assets', { kind: 'chr', limit: 2 })).json.results;
    expect(chars.length).toBeGreaterThan(0);
    const bad = await call('create_character', { name: 'Nope', from: chars[0].ref, parts: { hair: 'hair.does-not-exist@1' } });
    expect(bad.error).toBe(true);
    expect(bad.json.error.code).toBe('VALIDATION_FAILED');
    const hair = (await call('search_assets', { kind: 'hair', limit: 3 })).json.results.at(-1).ref as string;
    const made = await call('create_character', { name: 'Robin', from: chars[0].ref, role: 'Host', parts: { hair }, colors: { hair: '#3A2A1A' }, place: { scene, x: 700 } });
    expect(made.error, JSON.stringify(made.json)).toBe(false);
    const robin = made.json.instance as string;
    const asset = (await call('get_asset', { ref: made.json.ref })).json;
    expect(asset.data.parts.hair).toBe(hair);

    // Dry run changes nothing; a real apply with base_revision succeeds.
    const rev0 = (await call('get_project')).json.revision as number;
    const dry = await call('apply_commands', { dry_run: true, commands: [{ name: 'line.add', params: { scene, speaker: robin, text: 'Welcome back to the show.', start: 0, durationS: 2 } }] });
    expect(dry.json.dryRun).toBe(true);
    expect((await call('get_project')).json.revision).toBe(rev0);
    const applied = await call('apply_commands', { base_revision: rev0, label: 'Opening line', commands: [{ name: 'line.add', params: { scene, speaker: robin, text: 'Welcome back to the show.', start: 0, durationS: 2 } }] });
    expect(applied.error, JSON.stringify(applied.json)).toBe(false);
    const line = applied.json.commands[0].params.id as string;
    const sc = (await call('get_scene', { scene })).json.scene;
    expect(sc.clips.find((c: any) => c.id === line).source).toBe('agent:test-agent');

    // A person edits the same line meanwhile: the agent's stale write conflicts; re-reading resolves it (AC-13).
    const stale = (await call('get_project')).json.revision as number;
    const hu = await human('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'line.setText', params: { scene, id: line, text: 'Welcome back, everyone.' } }] });
    expect(hu.status).toBe(200);
    const conflict = await call('apply_commands', { base_revision: stale, commands: [{ name: 'line.setText', params: { scene, id: line, text: 'Hello again.' } }] });
    expect(conflict.error).toBe(true);
    expect(conflict.json.error.code).toBe('REVISION_CONFLICT');
    // Undo would reverse the person's edit: refused.
    const undoOther = await call('undo');
    expect(undoOther.json.error.code).toBe('CONFLICT');
    const fresh = (await call('get_project')).json.revision as number;
    const retry = await call('apply_commands', { base_revision: fresh, commands: [{ name: 'line.setDelivery', params: { scene, id: line, delivery: { emotion: 'happy' } } }] });
    expect(retry.error, JSON.stringify(retry.json)).toBe(false);

    // Undo of its own latest change is allowed.
    expect((await call('undo')).error).toBe(false);

    // Diff shows who changed what.
    const diff = (await call('diff_revisions', { from: 0 })).json;
    expect(diff.bySource['agent:test-agent']).toBeGreaterThanOrEqual(3);
    expect(diff.bySource.user).toBeGreaterThanOrEqual(1);

    // Frames come back as PNG images.
    const frame = await call('render_frame', { scene, t: 0.5, width: 320, height: 180 });
    const img = frame.content.find((c) => c.type === 'image')!;
    expect(img.mimeType).toBe('image/png');
    expect(Buffer.from(img.data!, 'base64').subarray(1, 4).toString()).toBe('PNG');

    const problems = (await call('validate')).json.problems as { code: string }[];
    expect(Array.isArray(problems)).toBe(true);

    // Agents cannot change their own permissions or revert sessions; a person can revert the agent's work as a group.
    const perm = await call('apply_commands', { commands: [{ name: 'project.setPermissions', params: { agent: { deleteProjects: true, deleteVoices: true, cloneVoices: true, exposeWorker: true } } }] });
    expect(perm.json.error.code).toBe('PERMISSION_REQUIRED');
    const agentRevert = await fetch(`${base}/api/projects/${pid}/revert-source`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-frame-agent': 'test-agent' }, body: JSON.stringify({ source: 'agent:test-agent' }) });
    expect(agentRevert.status).toBe(403);
    // A person reverts the whole agent session as one step: the agent's character and line are gone.
    const rv = await human('POST', `/api/projects/${pid}/revert-source`, { source: 'agent:test-agent' });
    expect(rv.status, JSON.stringify(rv.json)).toBe(200);
    const after = (await human('GET', `/api/projects/${pid}/state`)).json.state;
    expect(after.scenes[scene].instances).toEqual([]);
    expect(after.scenes[scene].clips.filter((c: any) => c.kind === 'line')).toEqual([]);
    expect(after.project.cast).toEqual([]);

    // Resources (FR-AGT-03).
    const res = (await client.listResources()).resources.map((r) => r.uri);
    expect(res).toEqual(expect.arrayContaining(['frame://schemas', 'frame://catalog', 'frame://commands', `frame://project/${pid}/summary`]));
    const catalog = await readJson('frame://catalog');
    expect(catalog.count).toBeGreaterThan(400);
    expect(catalog.items[0]).toHaveProperty('capabilities');
    const types = (await readJson('frame://schemas')).types as string[];
    const schema = await readJson(`frame://schemas/${types[0]}`);
    expect(schema).toHaveProperty('type');
    const cmds = await readJson('frame://commands');
    expect(cmds.commands.length).toBeGreaterThan(40);
    const sum = await readJson(`frame://project/${pid}/summary`);
    expect(sum.name).toBe('Agent show');
  });

  it.skipIf(!WORKER)('designs a voice, generates takes and renders a video through MCP (AC-13 voice path)', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-mcp-')), 'Voice.frame');
    await call('create_project', { path: dir });
    const scene = (await call('get_project')).json.episodes[0].scenes[0].id as string;
    const chr = (await call('search_assets', { kind: 'chr', limit: 1 })).json.results[0].ref;
    const made = (await call('create_character', { name: 'Sam', from: chr, place: { scene } })).json;
    const v = await call('design_voice', { name: 'Sam voice', description: 'Calm, low narrator voice', seed: 3, assign_to: [{ scene, instance: made.instance }] });
    expect(v.error, JSON.stringify(v.json)).toBe(false);
    const fixture = v.json.fixture as boolean;
    if (fixture) expect(v.json.note).toMatch(/not real speech/);
    const line = (await call('apply_commands', { commands: [{ name: 'line.add', params: { scene, speaker: made.instance, text: 'This is a short narration line for the test.', start: 0, durationS: 3 } }] })).json.commands[0].params.id;
    const takes = await call('generate_takes', { scene, lines: [line] });
    expect(takes.json.state, JSON.stringify(takes.json)).toBe('succeeded');
    const scn = (await call('get_scene', { scene })).json;
    const take = Object.values(scn.chosenTakes)[0] as { fixture: boolean; status: string };
    expect(take).toMatchObject({ status: 'ready', fixture });
    const r = await call('render_video', { scenes: [scene], to: 2, width: 320, height: 180 });
    const done = await call('job_status', { job: r.json.job, wait_seconds: 120 });
    expect(done.json.state, JSON.stringify(done.json)).toBe('succeeded');
    expect(fs.existsSync(done.json.result.output)).toBe(true);
  });
});
