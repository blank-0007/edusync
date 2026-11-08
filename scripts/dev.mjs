#!/usr/bin/env node
// Run server + web together with prefixed logs.
import { spawn } from 'node:child_process';

const procs = [
  { name: 'server', color: '\x1b[36m', args: ['-w', '@edusync/server', 'run', 'dev'] },
  { name: 'web   ', color: '\x1b[35m', args: ['-w', '@edusync/web', 'run', 'dev'] },
].map(({ name, color, args }) => {
  const p = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(tag + line + '\n');
    });
  };
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  return p;
});

const shutdown = () => { for (const p of procs) p.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
