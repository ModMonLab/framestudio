/** Bundled content media (library sounds, CAT-08): `<content>/media/<hash>.<ext>`, content-addressed like project media. */
import fs from 'node:fs';
import path from 'node:path';

const HASH = /^sha256-[0-9a-f]{64}$/;

export function bundledMediaFile(contentDir: string, hash: string): string | undefined {
  if (!HASH.test(hash)) return undefined;
  const dir = path.join(contentDir, 'media');
  if (!fs.existsSync(dir)) return undefined;
  const f = fs.readdirSync(dir).find((n) => n.startsWith(`${hash}.`));
  return f ? path.join(dir, f) : undefined;
}
