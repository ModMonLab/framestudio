import './project-commands.js';
import './structure-commands.js';
import { FrameError } from '@frame/schema';
import { bindArgs, exitCodeFor, helpFor, overview, parseArgv, resolve, toFrameError, type CliIO } from './framework.js';

export { commands } from './framework.js';
export type { CliIO } from './framework.js';

/** Runs the CLI in-process and returns the exit code (FR-CLI-01..07). */
export async function runCli(argv: string[], io: CliIO): Promise<number> {
  let json = argv.includes('--json');
  try {
    const parsed = parseArgv(argv);
    json = parsed.opts.json;
    const words = parsed.words[0] === 'help' ? parsed.words.slice(1) : parsed.words;
    const wantHelp = parsed.help || parsed.words[0] === 'help';
    if (words.length === 0) {
      if (json) io.stdout(JSON.stringify({ ok: true, result: { help: overview() } }) + '\n');
      else io.stdout(overview() + '\n');
      return wantHelp ? 0 : 1;
    }
    const { cmd, rest } = resolve(words);
    if (!cmd) throw new FrameError('USAGE', `Unknown command "${words.join(' ')}"`, undefined, 'Run `frame help` to list commands.');
    if (wantHelp) {
      io.stdout((json ? JSON.stringify({ ok: true, result: { help: helpFor(cmd) } }) : helpFor(cmd)) + '\n');
      return 0;
    }
    if (parsed.opts.server) {
      throw new FrameError('UNSUPPORTED', 'Server mode is not available in this build yet', undefined, 'Omit --server to run in local mode on the project folder.');
    }
    const args = bindArgs(cmd, rest, parsed.flags);
    const log = (s: string) => {
      if (!parsed.opts.quiet) io.stderr(s + '\n');
    };
    const result = await cmd.run({ args, opts: parsed.opts, io, log });
    if (json) io.stdout(JSON.stringify({ ok: true, result }) + '\n');
    else if (!parsed.opts.quiet) io.stdout((cmd.human ? cmd.human(result) : JSON.stringify(result, null, 2)) + '\n');
    return 0;
  } catch (e) {
    const err = toFrameError(e);
    if (json) io.stdout(JSON.stringify({ ok: false, error: err.toJSON() }) + '\n');
    else {
      io.stderr(`Error: ${err.message}\n`);
      const d = err.details as { problems?: { severity: string; message: string }[]; issues?: { path: string; message: string }[] } | undefined;
      for (const p of d?.problems ?? []) if (p.severity !== 'info') io.stderr(`  ${p.severity}: ${p.message}\n`);
      for (const i of d?.issues ?? []) io.stderr(`  ${i.path}: ${i.message}\n`);
      if (err.hint) io.stderr(`${err.hint}\n`);
    }
    return exitCodeFor[err.code] ?? 10;
  }
}
