#!/usr/bin/env node
// Draws the in-flight strip (components/outgoing-watch) in the dev harness
// without sending anything: it puts one made-up row in the popup's store, takes
// a screenshot per state, and removes the row.
//
//   node tools/pillar/strip-probe.js [--instance port]
//
// For looking at the strip when the chain cannot confirm a real block. It says
// nothing about the watcher itself, which is checked in
// utils/operator-mode-test.js.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { jsLiteral } = require('../../utils/js-literal');

const harness = path.join(__dirname, '..', '..', 'utils', 'dev-harness.js');
const at = process.argv.indexOf('--instance');
const instance = at !== -1 ? ['--instance', process.argv[at + 1]] : [];
const run = (...args) => {
  const result = spawnSync(process.execPath, [harness, ...args, ...instance], { encoding: 'utf8' });
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
};
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The store, found from the React root: the popup does not expose it.
const store = `(() => {
  const root = document.querySelector('#app-container') || document.body.firstElementChild;
  const key = Object.keys(root).find((name) => name.startsWith('__reactContainer'));
  let fiber = root[key];
  const seen = [];
  const stack = [fiber];
  while (stack.length) {
    const node = stack.pop();
    if (!node || seen.includes(node)) continue;
    seen.push(node);
    const candidate = node.memoizedProps && node.memoizedProps.store;
    if (candidate && typeof candidate.dispatch === 'function') return candidate;
    stack.push(node.sibling, node.child);
  }
  return null;
})()`;
const dispatch = (action) => run('eval', `(() => { const store = ${store}; if (!store) return 'no store'; store.dispatch(${jsLiteral(action)}); return 'ok'; })()`);
const measure = () => run('eval', `JSON.stringify({ strip: (document.querySelector('.outgoing-strip') || {}).innerText || null, overflowX: document.documentElement.scrollWidth - window.innerWidth, height: (document.querySelector('.outgoing-strip') || { offsetHeight: 0 }).offsetHeight })`);

const owner = run('eval', `(() => { const store = ${store}; return store ? store.getState().wallet.address : ''; })()`).split('\n').pop().replace(/"/g, '');
const row = { id: 'strip-probe', owner, label: 'Cancel 3 fuses', type: 'plasma', icon: 'plasma' };

run('route', 'tabs/plasma');
wait(1200);
console.log(dispatch({ type: 'pendingTransactions/startPendingTransaction', payload: { ...row, status: 'generating-plasma' } }));
wait(600);
console.log('generating plasma:', measure().split('\n').pop());
run('shot', '--out', 'strip-plasma.png');
console.log(dispatch({ type: 'pendingTransactions/updatePendingTransaction', payload: { id: row.id, status: 'sending' } }));
wait(400);
console.log('sending:', measure().split('\n').pop());
run('shot', '--out', 'strip-sending.png');
run('route', 'tabs/dashboard');
wait(1200);
console.log('on Home:', measure().split('\n').pop());
run('route', 'tabs/settings');
wait(1000);
console.log('on Settings:', measure().split('\n').pop());
console.log(dispatch({ type: 'pendingTransactions/clearPendingTransaction', payload: row.id }));
wait(400);
console.log('cleared:', measure().split('\n').pop());
