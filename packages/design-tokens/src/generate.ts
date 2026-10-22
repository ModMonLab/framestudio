import fs from 'node:fs';
import path from 'node:path';
import { tokensCss, tokensJson } from './index.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.writeFileSync(path.join(root, 'tokens.css'), tokensCss());
fs.writeFileSync(path.join(root, 'tokens.json'), JSON.stringify(tokensJson(), null, 2) + '\n');
console.log('wrote tokens.css and tokens.json');
