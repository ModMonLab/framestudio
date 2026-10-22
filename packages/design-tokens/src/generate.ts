import fs from 'node:fs';
import path from 'node:path';
import { tokensCss, tokensJson } from './index.js';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.writeFileSync(path.join(root, 'tokens.css'), tokensCss());
fs.writeFileSync(path.join(root, 'tokens.json'), JSON.stringify(tokensJson(), null, 2) + '\n');
console.log('wrote tokens.css and tokens.json');
