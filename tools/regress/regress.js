#!/usr/bin/env node
// Deliberate regressions: breaks the source one way at a time, runs a suite,
// restores the file, and reports whether the suite noticed.
//
//   node tools/regress/regress.js <suite.js> <cases.json>
//
// A case is [name, file, from, to]: `from` must occur exactly once in `file`
// (line endings ignored) and is replaced by `to` for one run of the suite. A
// case whose anchor is not found is reported as SKIP, so a list that has
// drifted from the source does not pass for the wrong reason. Exit status is 0
// only when every case ran and was caught.
//
// The handoff rule this serves: a check counts once it has been seen to fail.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.join(__dirname, '..', '..');
const [suite, casesFile] = process.argv.slice(2);
if (!suite || !casesFile) {
  console.error('usage: regress.js <suite.js> <cases.json>');
  process.exit(2);
}
const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));

let caught = 0;
let skipped = 0;
for (const [name, file, from, to] of cases) {
  const full = path.join(repo, file);
  const original = fs.readFileSync(full, 'utf8');
  const text = original.replace(/\r\n/g, '\n');
  const found = text.split(from).length - 1;
  if (found !== 1) {
    console.log(`SKIP ${name}: anchor found ${found} times`);
    skipped += 1;
    continue;
  }
  fs.writeFileSync(full, text.replace(from, () => to));
  let run;
  try {
    run = spawnSync(process.execPath, [suite], { cwd: repo, encoding: 'utf8' });
  } finally {
    fs.writeFileSync(full, original);
  }
  const failed = run.status !== 0;
  const which = (run.stderr.match(/^FAIL (.*)$/m) || [])[1] || '';
  console.log(`${failed ? 'caught' : 'MISSED'}: ${name}${which ? ` -> ${which}` : ''}`);
  if (failed) caught += 1;
}
console.log(`${caught} of ${cases.length} caught${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(caught === cases.length ? 0 : 1);
