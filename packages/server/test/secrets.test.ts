/**
 * Secrets (NFR-09, AC-21): the server token and the Voice Worker token never appear in request logs, API responses,
 * project files or exported packages. The worker token is kept only in the user's settings file.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type net from 'node:net';
import { sequentialIds } from '@frame/core';
import { OpenProject, readPackage } from '@frame/io';
import { createServer, redactToken, type FrameServer } from '../src/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SERVER_TOKEN = 'srv-SECRET-7f3a91';
const WORKER_TOKEN = 'wrk-SECRET-c41d02';
const NEW_WORKER_TOKEN = 'wrk-SECRET-9e88b7';
let log = '';
let srv: FrameServer;
let base = '';
let profile = '';

beforeAll(async () => {
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-secrets-'));
  const stream = new Writable({ write(chunk, _enc, cb) { log += String(chunk); cb(); } });
  srv = await createServer({ contentDir: path.join(repo, 'content'), debounceMs: 20, token: SERVER_TOKEN, workerToken: WORKER_TOKEN, workerUrl: 'http://127.0.0.1:9', logger: true, logStream: stream, userDir: path.join(profile, 'library') });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as net.AddressInfo).port}`;
});
afterAll(async () => srv.close());

const api = async (method: string, url: string, body?: unknown, viaQuery = false) => {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(base + url + (viaQuery ? `${sep}token=${SERVER_TOKEN}` : ''), { method, headers: { ...(viaQuery ? {} : { authorization: `Bearer ${SERVER_TOKEN}` }), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, text: type.includes('json') ? await res.text() : '', bytes: type.includes('json') ? new Uint8Array() : new Uint8Array(await res.arrayBuffer()) };
};

const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const leaks = (text: string) => [SERVER_TOKEN, WORKER_TOKEN, NEW_WORKER_TOKEN].filter((t) => text.includes(t));

it('redacts token query values for logs', () => {
  expect(redactToken('/api/projects?token=abc&x=1')).toBe('/api/projects?token=[redacted]&x=1');
  expect(redactToken('/api/x?a=1&TOKEN=abc')).toBe('/api/x?a=1&TOKEN=[redacted]');
});

it('tokens never reach logs, responses, project files or packages (NFR-09, AC-21)', async () => {
  expect((await fetch(`${base}/api/projects`)).status).toBe(401);
  const dir = path.join(profile, 'Show.frame');
  OpenProject.create(dir, { name: 'Show', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-720p@1', width: 1280, height: 720, aspectRatios: ['16:9'] }, appVersion: '0.1.0', newId: sequentialIds(), seed: 1 }).close();
  const opened = await api('POST', '/api/projects/open', { path: dir }, true);
  expect(opened.status).toBe(200);
  const pid = JSON.parse(opened.text).id as string;
  const state = JSON.parse((await api('GET', `/api/projects/${pid}/state`, undefined, true)).text).state;
  const scene = Object.keys(state.scenes)[0]!;
  await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.mug@1', name: 'Mug', transform: { x: 600, y: 800 } } }] });
  const responses: string[] = [];
  const set = await api('POST', '/api/settings', { workerToken: NEW_WORKER_TOKEN });
  expect(set.status).toBe(200);
  responses.push(set.text, (await api('GET', '/api/settings')).text, (await api('GET', `/api/worker/status?project=${pid}`)).text, (await api('GET', `/api/projects/${pid}/state`)).text);
  expect(JSON.parse(responses[1]!).settings.workerTokenSet).toBe(true);
  await api('POST', `/api/projects/${pid}/versions`, { name: 'Draft' });
  await api('POST', `/api/projects/${pid}/save`, {});
  const pkg = await api('GET', `/api/projects/${pid}/package`, undefined, true);
  expect(pkg.bytes.length).toBeGreaterThan(100);

  expect(log.length, 'request logging is on').toBeGreaterThan(100);
  expect(log).toContain('token=[redacted]');
  expect(leaks(log), 'request log').toEqual([]);
  expect(responses.flatMap(leaks), 'API responses').toEqual([]);
  for (const f of files(dir)) expect(leaks(fs.readFileSync(f, 'latin1')), path.relative(dir, f)).toEqual([]);
  for (const [name, bytes] of readPackage(pkg.bytes).files) expect(leaks(Buffer.from(bytes).toString('latin1')), `package ${name}`).toEqual([]);
}, 60_000);
