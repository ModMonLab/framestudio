/**
 * Privacy network audit (NFR-10, AC-21): during an ordinary session — open a project, edit, render frames and
 * thumbnails, check the worker, save a version, export a package and a video — the server connects only to localhost
 * and the configured Voice Worker, and resolves no other host names. No telemetry.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sequentialIds } from '@frame/core';
import { OpenProject } from '@frame/io';
import { createServer, type FrameServer } from '../src/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const connects: string[] = [];
const lookups: string[] = [];
const origConnect = net.Socket.prototype.connect;
const origLookup = dns.lookup;

let srv: FrameServer;
let worker: http.Server;
let base = '';
let workerHost = '';

beforeAll(async () => {
  // Record every outgoing socket (fetch, http, WebSocket all end here) and every name resolution.
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const a = (Array.isArray(args[0]) ? args[0][0] : args[0]) as { host?: string; port?: number; path?: string } | number;
    if (typeof a === 'number') connects.push(`${typeof args[1] === 'string' ? args[1] : 'localhost'}:${a}`);
    else if (a && !a.path) connects.push(`${a.host ?? 'localhost'}:${a.port}`);
    return (origConnect as (...x: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;
  (dns as { lookup: unknown }).lookup = ((host: string, ...rest: unknown[]) => {
    lookups.push(host);
    return (origLookup as (...x: unknown[]) => void)(host, ...rest);
  }) as typeof dns.lookup;
  // A stand-in Voice Worker on this machine (it only answers that it is unavailable).
  worker = http.createServer((_req, res) => res.writeHead(503, { 'content-type': 'application/json' }).end('{"error":"busy"}'));
  await new Promise<void>((r) => worker.listen(0, '127.0.0.1', r));
  workerHost = `127.0.0.1:${(worker.address() as net.AddressInfo).port}`;
  srv = await createServer({ contentDir: path.join(repo, 'content'), debounceMs: 20, workerUrl: `http://${workerHost}` });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as net.AddressInfo).port}`;
});

afterAll(async () => {
  net.Socket.prototype.connect = origConnect;
  (dns as { lookup: unknown }).lookup = origLookup;
  await srv.close();
  await new Promise((r) => worker.close(r));
});

const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, json: (type.includes('json') ? await res.json() : await res.arrayBuffer()) as any };
};

it('an ordinary session talks only to localhost and the configured worker (NFR-10)', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-privacy-')), 'Show.frame');
  OpenProject.create(dir, { name: 'Show', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-720p@1', width: 1280, height: 720, aspectRatios: ['16:9'] }, appVersion: '0.1.0', newId: sequentialIds(), seed: 1 }).close();
  const pid = (await api('POST', '/api/projects/open', { path: dir })).json.id as string;
  const scene = Object.keys((await api('GET', `/api/projects/${pid}/state`)).json.state.scenes)[0]!;
  expect((await api('POST', `/api/projects/${pid}/commands`, { commands: [
    { name: 'scene.setDuration', params: { id: scene, durationS: 0.5 } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.mug@1', name: 'Mug', transform: { x: 600, y: 800 } } },
  ] })).status).toBe(200);
  expect((await api('GET', `/api/projects/${pid}/frame?scene=${scene}&t=0&w=320&h=180`)).status).toBe(200);
  expect((await api('GET', '/api/library?q=chair&limit=5')).status).toBe(200);
  expect((await api('GET', `/api/library/thumbnail?ref=${encodeURIComponent('prop.sofa@1')}&family=flat&w=64`)).status).toBe(200);
  expect((await api('GET', `/api/worker/status?project=${pid}`)).json.state).not.toBe('connected');
  expect((await api('POST', `/api/projects/${pid}/versions`, { name: 'Draft' })).status).toBeLessThan(300);
  expect((await api('GET', `/api/projects/${pid}/package`)).status).toBeLessThan(500);
  const job = await api('POST', `/api/projects/${pid}/renders`, { scene, width: 320, height: 180 });
  expect(job.status).toBe(202);
  await expect.poll(async () => (await api('GET', `/api/jobs/${job.json.id}`)).json.state, { timeout: 60_000, interval: 200 }).toMatch(/succeeded/);
  expect((await api('POST', `/api/projects/${pid}/save`, {})).status).toBeLessThan(300);

  const local = /^(127\.0\.0\.1|localhost|::1|\[::1\]):\d+$/;
  const elsewhere = connects.filter((c) => !local.test(c));
  expect(elsewhere, 'connections to other hosts').toEqual([]);
  expect(connects.some((c) => c === workerHost), 'the configured worker was contacted').toBe(true);
  expect(lookups.filter((h) => !/^(localhost|127\.0\.0\.1|::1)$/.test(h)), 'name lookups').toEqual([]);
}, 120_000);

it('the Studio and its components load nothing from the internet: no external URLs in their sources (NFR-10)', () => {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|html|css)$/.test(e.name)) for (const m of fs.readFileSync(p, 'utf8').matchAll(/https?:\/\/[A-Za-z0-9.-]+/g)) if (!/\/\/(localhost|127\.0\.0\.1|www\.w3\.org|x)$/.test(m[0])) found.push(`${path.relative(repo, p)}: ${m[0]}`);
    }
  };
  for (const d of ['apps/studio/src', 'packages/ui/src', 'packages/render/src']) walk(path.join(repo, d));
  for (const m of fs.readFileSync(path.join(repo, 'apps/studio/index.html'), 'utf8').matchAll(/https?:\/\/[A-Za-z0-9.-]+/g)) found.push(`apps/studio/index.html: ${m[0]}`);
  expect(found).toEqual([]);
});
