#!/usr/bin/env node
// Watches the popup in the dev harness after a send and prints each change:
// the route, the in-flight strip (components/outgoing-watch), the toasts, and
// one figure of the page's own, read with a selector.
//
//   node tools/pillar/strip-watch.js [--seconds 90] [--figure ".plasma-total"] [--instance name]
//
// For seeing a block followed to its momentum from the screen that sent it:
// the route should not change, the strip should go Sending, Unconfirmed,
// Confirmed, and the figure should move without the screen being reopened.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const harness = path.join(__dirname, '..', '..', 'utils', 'dev-harness.js');
const option = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? process.argv[at + 1] : fallback;
};
const instance = option('instance', '');
const seconds = Number(option('seconds', '90'));
const figure = option('figure', '');

const expression = `JSON.stringify({
  route: location.hash,
  strip: ((document.querySelector('.outgoing-strip') || {}).innerText || '').replace(/\\n/g, ' | '),
  toasts: [...document.querySelectorAll('.Toastify__toast')].map((toast) => toast.innerText.replace(/\\n/g, ' ')).join(' / '),
  figure: ${figure ? `((document.querySelector(${JSON.stringify(figure)}) || {}).innerText || '').replace(/\\n/g, ' ')` : "''"},
})`;
const read = () => {
  const result = spawnSync(process.execPath, [harness, 'eval', expression, ...(instance ? ['--instance', instance] : [])], { encoding: 'utf8' });
  const line = `${result.stdout || ''}`.trim().split('\n').pop();
  try { return JSON.parse(JSON.parse(line)); } catch (error) {
    try { return JSON.parse(line); } catch (inner) { return { error: line.slice(0, 120) }; }
  }
};

const started = Date.now();
let last = '';
while (Date.now() - started < seconds * 1000) {
  const state = read();
  const text = JSON.stringify(state);
  if (text !== last) {
    console.log(`${String(Math.round((Date.now() - started) / 1000)).padStart(3)}s ${text}`);
    last = text;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
}
