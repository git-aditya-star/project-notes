'use strict';

// Zero-dependency test runner: spawns each tests/*.test.js as its own process
// (node:test files self-execute) and aggregates exit codes.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let failed = 0;
for (const file of files) {
  console.log('\n=== ' + file + ' ===');
  const res = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: 'inherit',
  });
  if (res.status !== 0) failed++;
}

if (failed > 0) {
  console.error('\n' + failed + ' test file(s) failed');
  process.exit(1);
}
console.log('\nAll ' + files.length + ' test file(s) passed');
