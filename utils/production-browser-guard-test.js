'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute the fixture's actual guard with a controlled protocol transport.
// No browser, profile, application data or network is created here.
const guardSources = ['production-browser.js', 'production-browser-legacy.js'].map(name => {
  const source = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  const start = source.indexOf('  const guardTarget = async (');
  const end = source.indexOf('\n  const openTarget = async ', start);
  assert(start > 0 && end > start, 'Guard source boundary is present');
  return source.slice(start, end);
});
const cases = [];

// `code` is how the rejected command fails; `heardBefore` delivers a message on
// the session before that, and `speaksAfter` one after the guard has settled.
const run = async (guardSource, type, rejectedMethod, { code = 'BROWSER_PROTOCOL_FAILED', heardBefore, speaksAfter } = {}) => {
  const commands = [];
  const sessions = new Map();
  const targets = new Map();
  const stats = { guardedTargets: 0, guardedWorkers: 0, silentWorkers: 0, guardFailure: null };
  const sandbox = {
    sessions, targets, stats, setupScript: '', stopping: false, stopped: false, fatalError: null,
    failure: code => Object.assign(new Error('Controlled protocol rejection.'), { code }),
    cdp: async (method, params, sessionId) => {
      commands.push({ method, params, sessionId });
      if (method === rejectedMethod) {
        if (heardBefore) sandbox.heardFrom(sessionId);
        throw Object.assign(new Error('Controlled protocol rejection.'), { code });
      }
      if (type === 'worker' && method === 'Network.emulateNetworkConditions') {
        throw Object.assign(new Error('Controlled protocol rejection.'), { code: 'BROWSER_PROTOCOL_FAILED' });
      }
      return {};
    },
  };
  vm.runInNewContext(guardSource + '\nglobalThis.guard = guardTarget; globalThis.heardFrom = heardFrom;', sandbox);
  await sandbox.guard({ sessionId: 'owned-session', targetInfo: { targetId: 'owned-target', type, url: '' } });
  let rejected = false;
  try { await targets.get('owned-target').ready; } catch { rejected = true; }
  await Promise.resolve();
  if (speaksAfter) sandbox.heardFrom('owned-session');
  return { commands, stats, rejected, fatalError: sandbox.fatalError };
};

(async () => {
  for (const guardSource of guardSources) {
    const worker = await run(guardSource, 'worker');
    assert.equal(worker.rejected, false);
    assert.equal(worker.fatalError, null);
    assert.equal(worker.stats.guardedWorkers, 1);
    assert.deepEqual(worker.commands.map(command => command.method), ['Network.enable', 'Network.setBlockedURLs',
      'Runtime.enable', 'Target.setAutoAttach', 'Runtime.runIfWaitingForDebugger']);
    assert.deepEqual(Array.from(worker.commands[1].params.urls), ['http://*', 'https://*', 'ws://*', 'wss://*']);
    assert(worker.commands.every(command => command.sessionId === 'owned-session'));
    assert.equal(worker.commands[3].params.waitForDebuggerOnStart, true);
    cases.push('dedicated worker receives mandatory guards before resume');

    for (const method of ['Network.enable', 'Network.setBlockedURLs', 'Runtime.enable', 'Target.setAutoAttach']) {
      const failed = await run(guardSource, 'worker', method);
      assert(failed.rejected);
      assert.equal(failed.fatalError?.code, 'BROWSER_NETWORK_GUARD_FAILED');
      assert.equal(failed.stats.guardFailure.phase, method);
      assert(!failed.commands.some(command => command.method === 'Runtime.runIfWaitingForDebugger'));
      assert.equal(failed.stats.guardedWorkers, 0);
      cases.push('worker stays paused when ' + method + ' fails');
    }

    for (const type of ['page', 'service_worker', 'shared_worker', 'other']) {
      const guarded = await run(guardSource, type);
      const names = guarded.commands.map(command => command.method);
      assert.equal(guarded.rejected, false);
      assert(names.indexOf('Network.emulateNetworkConditions') > names.indexOf('Network.setBlockedURLs'));
      assert(names.indexOf('Network.emulateNetworkConditions') < names.indexOf('Runtime.runIfWaitingForDebugger'));
      assert.equal(guarded.commands.find(command => command.method === 'Network.emulateNetworkConditions').params.offline, true);
      const failed = await run(guardSource, type, 'Network.emulateNetworkConditions');
      assert(failed.rejected);
      assert.equal(failed.fatalError?.code, 'BROWSER_NETWORK_GUARD_FAILED');
      assert(!failed.commands.some(command => command.method === 'Runtime.runIfWaitingForDebugger'));
      cases.push(type + ' retains required offline override and fail-closed rejection');
    }

    // A dead service worker (the registration a reload replaced) never answers
    // and never speaks: set aside, never resumed, and not a failure.
    const timeout = { code: 'BROWSER_PROTOCOL_TIMEOUT' };
    const silent = await run(guardSource, 'service_worker', 'Network.enable', timeout);
    assert(silent.rejected);
    assert.equal(silent.fatalError, null);
    assert.equal(silent.stats.silentWorkers, 1);
    assert.equal(silent.stats.guardFailure, null);
    assert.deepEqual(silent.commands.map(command => command.method), ['Network.enable']);
    cases.push('silent service worker timeout is set aside, never resumed');

    const spoke = await run(guardSource, 'service_worker', 'Network.enable', { ...timeout, speaksAfter: true });
    assert.equal(spoke.fatalError?.code, 'BROWSER_NETWORK_GUARD_FAILED');
    assert.equal(spoke.stats.guardFailure.phase, 'silent target spoke');
    cases.push('a silent service worker that later speaks fails the run');

    for (const [label, type, options] of [
      ['service worker heard before its timeout', 'service_worker', { ...timeout, heardBefore: true }],
      ['page timeout', 'page', timeout],
      ['dedicated worker timeout', 'worker', timeout],
      ['service worker protocol error', 'service_worker', {}],
    ]) {
      const failed = await run(guardSource, type, 'Network.setBlockedURLs', options);
      assert(failed.rejected);
      assert.equal(failed.fatalError?.code, 'BROWSER_NETWORK_GUARD_FAILED', label);
      assert.equal(failed.stats.silentWorkers, 0);
      assert(!failed.commands.some(command => command.method === 'Runtime.runIfWaitingForDebugger'));
      cases.push(label + ' still fails closed');
    }
  }
  console.log(JSON.stringify({ guard_regression: true, cases: cases.length, passed: true }));
})().catch(() => { console.log(JSON.stringify({ guard_regression: true, passed: false })); process.exitCode = 1; });
