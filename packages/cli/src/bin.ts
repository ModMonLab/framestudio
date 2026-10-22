#!/usr/bin/env -S node --import tsx
import { runCli } from './index.js';

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const code = await runCli(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  stdin: readStdin,
  cwd: process.cwd(),
  env: process.env,
});
process.exitCode = code;
