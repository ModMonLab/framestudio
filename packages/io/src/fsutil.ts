import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Deterministic JSON: sorted object keys, 2-space indent, trailing newline (FR-DAT-08). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

/** Compact deterministic JSON (sorted keys, no indentation) for large bundled content files. */
export function stableCompact(value: unknown): string {
  return JSON.stringify(sortKeys(value)) + '\n';
}

/** Writes a file atomically: temp file in the same folder, fsync, rename (FR-DAT-08). */
export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

export function writeJsonAtomic(file: string, value: unknown): void {
  writeFileAtomic(file, stableStringify(value));
}

export function readJson<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function sha256(data: Uint8Array | string): string {
  return 'sha256-' + crypto.createHash('sha256').update(data).digest('hex');
}

export function sha256File(file: string): string {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20);
  try {
    let n: number;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return 'sha256-' + h.digest('hex');
}

/** Appends a line and fsyncs: the commit point of the journal (NFR-08). */
export function appendLineDurable(file: string, line: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'a');
  try {
    fs.writeSync(fd, line.endsWith('\n') ? line : line + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
