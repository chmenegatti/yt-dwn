#!/usr/bin/env node

import { program } from '../src/cli.js';

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
