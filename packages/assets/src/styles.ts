import fs from 'node:fs';
import path from 'node:path';
import type { FamilyStyle } from '@frame/rig';

/** Family style guides from content/families (Vision §7). */
export function loadStyles(contentDir: string): Record<'flat' | 'illustrated', FamilyStyle> {
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(contentDir, 'families', `${f}.json`), 'utf8')) as FamilyStyle;
  return { flat: read('flat'), illustrated: read('illustrated') };
}
