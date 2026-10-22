import { FrameError, exitCodeFor } from '@frame/schema';

/** Global options (FR-CLI-02). */
export interface GlobalOptions {
  project?: string;
  json: boolean;
  dryRun: boolean;
  baseRevision?: number;
  yes: boolean;
  quiet: boolean;
  verbose: boolean;
  server?: string;
  token?: string;
}

export interface ArgSpec {
  name: string;
  description: string;
  type?: 'string' | 'number' | 'boolean' | 'json' | 'list';
  required?: boolean;
  positional?: boolean;
  /** For repeated positionals (e.g. `takes generate <line…>`). */
  variadic?: boolean;
}

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  stdin?: () => Promise<string>;
  cwd: string;
  env: Record<string, string | undefined>;
}

export interface CommandContext {
  args: Record<string, unknown>;
  opts: GlobalOptions;
  io: CliIO;
  /** Human-readable progress/log line (stderr; suppressed by --quiet). */
  log: (s: string) => void;
}

export interface CliCommand {
  path: string[];
  summary: string;
  args: ArgSpec[];
  examples: string[];
  mutating: boolean;
  run: (ctx: CommandContext) => Promise<unknown> | unknown;
  /** Human formatting of the result; JSON mode prints the result as-is. */
  human?: (result: any) => string;
}

export const commands: CliCommand[] = [];

export function command(c: Omit<CliCommand, 'examples' | 'mutating'> & { examples?: string[]; mutating?: boolean }): void {
  commands.push({ examples: [], mutating: false, ...c });
}

const globalFlags: Record<string, { key: keyof GlobalOptions; type: 'string' | 'number' | 'boolean' }> = {
  '--project': { key: 'project', type: 'string' },
  '-p': { key: 'project', type: 'string' },
  '--json': { key: 'json', type: 'boolean' },
  '--dry-run': { key: 'dryRun', type: 'boolean' },
  '--base-revision': { key: 'baseRevision', type: 'number' },
  '--yes': { key: 'yes', type: 'boolean' },
  '-y': { key: 'yes', type: 'boolean' },
  '--quiet': { key: 'quiet', type: 'boolean' },
  '-q': { key: 'quiet', type: 'boolean' },
  '--verbose': { key: 'verbose', type: 'boolean' },
  '--server': { key: 'server', type: 'string' },
  '--token': { key: 'token', type: 'string' },
};

export interface Parsed {
  opts: GlobalOptions;
  words: string[];
  flags: Record<string, string | true>;
  help: boolean;
}

export function parseArgv(argv: string[]): Parsed {
  const opts: GlobalOptions = { json: false, dryRun: false, yes: false, quiet: false, verbose: false };
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') {
      words.push(...argv.slice(i + 1));
      break;
    }
    if (a === '--help' || a === '-h') {
      help = true;
      continue;
    }
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const g = globalFlags[flag];
    if (g) {
      if (g.type === 'boolean') (opts as any)[g.key] = true;
      else {
        const v = inline ?? argv[++i];
        if (v === undefined) throw new FrameError('USAGE', `${flag} needs a value`);
        (opts as any)[g.key] = g.type === 'number' ? Number(v) : v;
        if (g.type === 'number' && !Number.isFinite((opts as any)[g.key])) throw new FrameError('USAGE', `${flag} must be a number`);
      }
      continue;
    }
    if (a.startsWith('--')) {
      const name = flag.slice(2);
      if (inline !== undefined) flags[name] = inline;
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--')) flags[name] = argv[++i]!;
      else flags[name] = true;
      continue;
    }
    words.push(a);
  }
  return { opts, words, flags, help };
}

/** Finds the longest matching command path. */
export function resolve(words: string[]): { cmd?: CliCommand; rest: string[] } {
  let best: CliCommand | undefined;
  for (const c of commands) {
    if (c.path.length <= words.length && c.path.every((p, i) => words[i] === p)) {
      if (!best || c.path.length > best.path.length) best = c;
    }
  }
  return { cmd: best, rest: best ? words.slice(best.path.length) : words };
}

function coerce(spec: ArgSpec, v: string | true): unknown {
  switch (spec.type ?? 'string') {
    case 'boolean':
      return v === true || v === 'true' || v === '1' || v === 'yes';
    case 'number': {
      const n = Number(v);
      if (v === true || !Number.isFinite(n)) throw new FrameError('USAGE', `--${spec.name} must be a number`);
      return n;
    }
    case 'json':
      if (v === true) throw new FrameError('USAGE', `--${spec.name} needs a JSON value`);
      try {
        return JSON.parse(v);
      } catch {
        throw new FrameError('USAGE', `--${spec.name} is not valid JSON`);
      }
    case 'list':
      return v === true ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean);
    default:
      if (v === true) throw new FrameError('USAGE', `--${spec.name} needs a value`);
      return v;
  }
}

export function bindArgs(cmd: CliCommand, rest: string[], flags: Record<string, string | true>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const positionals = cmd.args.filter((a) => a.positional);
  let i = 0;
  for (const p of positionals) {
    if (p.variadic) {
      args[p.name] = rest.slice(i);
      i = rest.length;
    } else if (rest[i] !== undefined) args[p.name] = coerce(p, rest[i++]!);
  }
  if (i < rest.length) throw new FrameError('USAGE', `Unexpected argument "${rest[i]}"`, undefined, `Run \`frame ${cmd.path.join(' ')} --help\`.`);
  for (const [k, v] of Object.entries(flags)) {
    const spec = cmd.args.find((a) => a.name === k && !a.positional) ?? cmd.args.find((a) => a.name === k);
    if (!spec) throw new FrameError('USAGE', `Unknown option --${k}`, undefined, `Run \`frame ${cmd.path.join(' ')} --help\`.`);
    args[spec.name] = coerce(spec, v);
  }
  for (const a of cmd.args) {
    if (a.required && (args[a.name] === undefined || (a.variadic && (args[a.name] as unknown[]).length === 0))) {
      throw new FrameError('USAGE', `Missing ${a.positional ? `<${a.name}>` : `--${a.name}`}`, undefined, `Run \`frame ${cmd.path.join(' ')} --help\`.`);
    }
  }
  return args;
}

export function helpFor(cmd: CliCommand): string {
  const usage = ['frame', ...cmd.path, ...cmd.args.filter((a) => a.positional).map((a) => (a.required ? `<${a.name}${a.variadic ? '…' : ''}>` : `[${a.name}]`))].join(' ');
  const lines = [cmd.summary, '', `Usage: ${usage} [options]`];
  const opts = cmd.args.filter((a) => !a.positional);
  if (opts.length) {
    lines.push('', 'Options:');
    for (const a of opts) lines.push(`  --${a.name}${a.type === 'boolean' ? '' : ` <${a.type ?? 'string'}>`}${a.required ? ' (required)' : ''}  ${a.description}`);
  }
  lines.push('', 'Global options: --project <path> --json --dry-run --base-revision <n> --yes --quiet --verbose --server <url> --token <t>');
  if (cmd.examples.length) lines.push('', 'Examples:', ...cmd.examples.map((e) => `  ${e}`));
  return lines.join('\n');
}

export function overview(): string {
  const groups = new Map<string, CliCommand[]>();
  for (const c of commands) {
    const g = c.path[0]!;
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const lines = ['Frame — 2D animation directing studio (command line)', '', 'Usage: frame <command> [options]', '', 'Commands:'];
  for (const c of [...commands].sort((a, b) => a.path.join(' ').localeCompare(b.path.join(' ')))) {
    lines.push(`  ${c.path.join(' ').padEnd(26)} ${c.summary}`);
  }
  lines.push('', 'Run `frame <command> --help` for details, `frame describe --json` for a machine-readable reference.');
  return lines.join('\n');
}

export function toFrameError(e: unknown): FrameError {
  if (e instanceof FrameError) return e;
  const err = e as NodeJS.ErrnoException;
  if (err?.code === 'ENOENT') return new FrameError('NOT_FOUND', err.message);
  if (err?.code === 'ENOSPC' || err?.code === 'EACCES' || err?.code === 'EPERM') return new FrameError('IO_ERROR', err.message);
  return new FrameError('INTERNAL', err?.message ?? String(e));
}

export { exitCodeFor };
