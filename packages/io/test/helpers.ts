import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sequentialIds } from '@frame/core';
import { OpenProject } from '../src/index.js';

export const OUTPUT = { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] };
export const CHAR = { look: 'default', view: 'three' as const, posture: 'standing' as const, auto: { idle: true, listening: true, blinks: true, talkingGestures: false } };

export function tmpdir(name = 'frame-io-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

export function newProject(dir = path.join(tmpdir(), 'Show.frame'), seed = 0) {
  return OpenProject.create(dir, { name: 'Show', styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', newId: sequentialIds(seed), seed: 3, debounceMs: 10_000 });
}
