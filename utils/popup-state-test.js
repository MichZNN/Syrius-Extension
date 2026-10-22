'use strict';
// Popup state (src/services/utils/popupState.js): what a closed popup reopens
// on, and when it must not.
//
//   node utils/popup-state-test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');

// One browser: a session storage area and a vault whose lease can end.
const browser = () => {
  const stored = new Map();
  const lockListeners = new Set();
  const vault = { lease: 'lease-1', getLeaseId: () => vault.lease, onLock: (fn) => { lockListeners.add(fn); return () => lockListeners.delete(fn); } };
  const session = {
    get: async (key) => (stored.has(key) ? { [key]: JSON.parse(stored.get(key)) } : {}),
    set: async (values) => { for (const [key, value] of Object.entries(values)) stored.set(key, JSON.stringify(value)); },
    remove: async (key) => { stored.delete(key); },
  };
  return { stored, vault, chrome: { storage: { session } }, lock: () => { vault.lease = null; lockListeners.forEach((fn) => fn({})); } };
};

// A popup: its own copy of the module, as each opening of the popup is.
const popup = (shared) => {
  const { code } = babel.transformFileSync(path.join(root, 'src/services/utils/popupState.js'), {
    presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]], babelrc: false, configFile: false,
  });
  const mod = { exports: {} };
  const resolve = (name) => {
    if (name === 'react') return { useState: () => [], useEffect: () => {}, useCallback: (fn) => fn };
    throw new Error(`Unexpected import ${name}`);
  };
  const listeners = {};
  const fakeWindow = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  const fakeDocument = { visibilityState: 'visible', addEventListener: () => {} };
  new Function('module', 'exports', 'require', 'chrome', 'window', 'document', code)(mod, mod.exports, resolve, shared.chrome, fakeWindow, fakeDocument);
  return { ...mod.exports, load: () => mod.exports.load(shared.vault), close: () => listeners.pagehide?.() };
};

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed += 1; } catch (error) { console.error(`FAIL ${name}`); throw error; }
};

(async () => {
  await test('the same unlock reopens on the same screen with what was typed', async () => {
    const shared = browser();
    const first = popup(shared);
    await first.load();
    first.saveRoute('/tabs/dashboard', null, 0);
    first.saveRoute('/tabs/send', { currentSelectedToken: 'zts1znnxxxxxxxxxxxxx9z4ulx' }, 1);
    first.writeField('send.amount', '1.5');
    first.writeField('send.recipient', 'z1qq…');
    first.close();
    await new Promise((resolve) => setImmediate(resolve));

    const second = popup(shared);
    await second.load();
    // The whole trail, so Back walks it again after reopening.
    assert.deepEqual(second.savedTrail(), [
      { pathname: '/tabs/dashboard', state: null },
      { pathname: '/tabs/send', state: { currentSelectedToken: 'zts1znnxxxxxxxxxxxxx9z4ulx' } },
    ]);
    assert.equal(second.readField('send.amount'), '1.5');
    assert.equal(second.readField('send.recipient'), 'z1qq…');
  });

  await test('a lock clears it, and the next unlock is a new lease with nothing to restore', async () => {
    const shared = browser();
    const first = popup(shared);
    await first.load();
    first.saveRoute('/tabs/plasma', null, 0);
    first.writeField('plasma.amount', '10');
    first.close();
    await new Promise((resolve) => setImmediate(resolve));
    // The inactivity lock happens in the worker while no popup is open: the
    // record is still stored, but under a lease that has ended.
    shared.vault.lease = 'lease-2';
    const second = popup(shared);
    await second.load();
    assert.deepEqual(second.savedTrail(), []);
    assert.equal(second.readField('plasma.amount'), undefined);
    assert.equal(shared.stored.has('popupState'), false, 'the stale record is removed');

    // A lock while a popup is open clears memory and storage at once.
    second.writeField('stake.amount', '5');
    second.close();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shared.stored.has('popupState'), true);
    shared.lock();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shared.stored.has('popupState'), false);
    assert.equal(second.readField('stake.amount'), undefined);
    second.writeField('stake.amount', '6');
    assert.equal(second.readField('stake.amount'), undefined, 'nothing is kept while locked');
  });

  await test('the trail follows history: back then elsewhere drops what was ahead', async () => {
    const shared = browser();
    const page = popup(shared);
    await page.load();
    page.saveRoute('/tabs/dashboard', null, 0);
    page.saveRoute('/tabs/settings', null, 1);
    page.saveRoute('/tabs/settings/about', null, 2);
    page.saveRoute('/tabs/settings', null, 1);
    page.saveRoute('/tabs/plasma', null, 2);
    assert.deepEqual(page.savedTrail().map((entry) => entry.pathname), ['/tabs/dashboard', '/tabs/settings', '/tabs/plasma']);
    for (let index = 0; index < 20; index += 1) page.saveRoute(`/tabs/x${index}`, null, index);
    assert.equal(page.savedTrail().length, 12, 'kept to the last twelve');
  });

  await test('only what survives JSON is kept', async () => {
    const shared = browser();
    const page = popup(shared);
    await page.load();
    const cyclic = {}; cyclic.self = cyclic;
    page.saveRoute('/tabs/az/phase', cyclic, 0);
    assert.deepEqual(page.savedTrail(), [{ pathname: '/tabs/az/phase', state: null }]);
    page.writeField('az.add.p1', { name: 'One', znn: '1' });
    assert.deepEqual(page.readField('az.add.p1'), { name: 'One', znn: '1' });
  });

  await test('no screen keeps a secret', () => {
    const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.jsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
    const keys = [];
    for (const file of files(path.join(root, 'src'))) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/usePopupState\(\s*[`'"]([^`'"]+)[`'"]/g)) keys.push(match[1]);
    }
    assert.ok(keys.length >= 12, `${keys.length} kept fields`);
    for (const key of keys) assert.ok(!/password|phrase|mnemonic|seed|secret|confirm/i.test(key), key);
  });

  console.log(`popup state: same-lease restore, lock and new-lease discard, JSON-only values and no secrets: ${passed} passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
