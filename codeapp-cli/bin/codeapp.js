#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(typeof err?.exitCode === 'number' ? err.exitCode : 1);
});
