/**
 * String extraction (NFR-16). Studio components show text through `tt()` (`t` from @frame/ui, gettext style: the
 * English text is the message key, so a locale only adds a table). This tool
 *  - `--fix`: wraps remaining hard-coded JSX text and user-facing attribute strings in `tt()`;
 *  - `--write`: writes the catalogue of every `tt()` message to docs/i18n/studio.en.json for translators;
 *  - default: reports hard-coded strings (tools/test/i18n.test.ts fails on any).
 * Scope: JSX text and the attributes in ATTRS. Strings built in code (toasts, undo labels) are not checked yet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STUDIO_SRC = path.join(repo, 'apps/studio/src');
const ATTRS = new Set(['label', 'title', 'aria-label', 'placeholder', 'disabledReason', 'description', 'emptyText', 'summary', 'hint', 'alt', 'tooltip']);
const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', rarr: '→', larr: '←', middot: '·', hellip: '…', times: '×', mdash: '—', ndash: '–', bull: '•' };

const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  const v = ENTITIES[e];
  if (v === undefined) throw new Error(`Unknown entity ${m}`);
  return v;
});

/** What React renders for a JSX text node (lines trimmed and joined with spaces). */
function jsxValue(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  if (lines.length === 1) return raw;
  const out: string[] = [];
  lines.forEach((l, i) => {
    let x = l.replace(/\t/g, ' ');
    if (i > 0) x = x.replace(/^ +/, '');
    if (i < lines.length - 1) x = x.replace(/ +$/, '');
    if (x) out.push(x);
  });
  return out.join(' ');
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const hasWords = (s: string) => /[A-Za-z]{2,}/.test(s);

export interface Found { file: string; line: number; text: string }

export function files(dir = STUDIO_SRC): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []));
}

/** Hard-coded strings in one file, with the edits that would wrap them. */
export function scan(file: string, src = fs.readFileSync(file, 'utf8')): { found: Found[]; edits: { start: number; end: number; text: string }[]; messages: string[] } {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Found[] = [];
  const edits: { start: number; end: number; text: string }[] = [];
  const messages: string[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) {
      const v = jsxValue(n.getFullText(sf));
      const core = v.trim();
      if (core && hasWords(core)) {
        const text = decode(core);
        found.push({ file, line: at(n), text });
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: `${v.startsWith(' ') ? ' ' : ''}{tt(${quote(text)})}${v.endsWith(' ') ? ' ' : ''}` });
      }
    } else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATTRS.has(n.name.getText(sf)) && hasWords(n.initializer.text)) {
      const text = decode(n.initializer.text);
      found.push({ file, line: at(n), text });
      edits.push({ start: n.initializer.getStart(sf), end: n.initializer.getEnd(), text: `{tt(${quote(text)})}` });
    } else if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tt' && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
      messages.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { found, edits, messages };
}

/** Applies the wrapping edits and adds the `tt` import. */
export function fix(file: string): number {
  let src = fs.readFileSync(file, 'utf8');
  const { edits } = scan(file, src);
  if (!edits.length) return 0;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  if (!/\bt as tt\b/.test(src)) {
    const m = /import \{([^}]*)\} from '@frame\/ui';/.exec(src);
    if (m) src = src.replace(m[0], `import {${m[1]!.replace(/\s*$/, '')}, t as tt } from '@frame/ui';`.replace('{ ', '{ ').replace(/,\s*,/, ','));
    else {
      const last = [...src.matchAll(/^import .*;$/gm)].pop();
      const pos = last ? last.index! + last[0].length : 0;
      src = `${src.slice(0, pos)}\nimport { t as tt } from '@frame/ui';${src.slice(pos)}`;
    }
  }
  fs.writeFileSync(file, src);
  return edits.length;
}

export function catalogue(): Record<string, string> {
  const all = new Set<string>();
  for (const f of files()) for (const m of scan(f).messages) all.add(m);
  return Object.fromEntries([...all].sort().map((m) => [m, m]));
}

export const CATALOGUE = path.join(repo, 'docs/i18n/studio.en.json');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === '--fix') {
    let n = 0;
    for (const f of files()) n += fix(f);
    console.log(`wrapped ${n} strings`);
  } else if (mode === '--write') {
    fs.mkdirSync(path.dirname(CATALOGUE), { recursive: true });
    const c = catalogue();
    fs.writeFileSync(CATALOGUE, `${JSON.stringify(c, null, 2)}\n`);
    console.log(`${Object.keys(c).length} messages → docs/i18n/studio.en.json`);
  } else {
    const found = files().flatMap((f) => scan(f).found);
    for (const x of found) console.log(`${path.relative(repo, x.file)}:${x.line}  ${x.text}`);
    console.log(`${found.length} hard-coded strings`);
  }
}
