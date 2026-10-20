'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute each fixture's actual command transport with a controlled socket.
// No browser, profile, evaluated page expression or network is created here.
const files = ['fixtures/production-browser.js', 'fixtures/production-browser-legacy.js', 'open-tab-injection-browser-test.js'];
// An unresolved controlled promise must fail rather than let Node exit zero.
const watchdog = setTimeout(() => {
  console.log(JSON.stringify({ browser_protocol_regression: true, passed: false, failure_code: 'TEST_TIMEOUT' }));
  process.exit(1);
}, 5000);
const section = (source, start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert(first >= 0 && last > first, 'Transport source boundaries are present');
  return source.slice(first, last);
};
const transport = name => {
  const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
  const openTabs = name === 'open-tab-injection-browser-test.js';
  const commands = [], timers = new Map();
  let timerId = 0;
  const failure = code => Object.assign(new Error('Controlled transport failure.'), { code });
  const socket = {
    readyState: 1,
    send: raw => commands.push(JSON.parse(raw)),
    close() { this.readyState = 3; this.onclose(); },
  };
  const sandbox = {
    socket, WebSocket: { OPEN: 1 }, sequence: 0, pending: new Map(), detached: new Set(),
    sessions: new Map(), targets: new Map(), stats: {}, fatalError: null, failure,
    heardFrom: () => {},
    assertUsable: () => { if (socket.readyState !== 1) throw failure('BROWSER_NOT_AVAILABLE'); },
    setTimeout: (callback, milliseconds) => { timers.set(++timerId, { callback, milliseconds }); return timerId; },
    clearTimeout: id => timers.delete(id),
  };
  const send = section(source, 'const cdp = ', openTabs ? '\nconst cleanup = ' : '\n  const evaluateWithLimit = ');
  const close = section(source, 'socket.onclose = ', '\n    socket.onmessage = ');
  const receiveEnd = openTabs ? '\n    const open = '
    : name.includes('-legacy') ? '\n    const earlyTargets = ' : "\n    await cdp('Target.setAutoAttach'";
  const receive = section(source, 'socket.onmessage = ', receiveEnd);
  vm.runInNewContext(send + '\n' + close + '\n' + receive + '\nglobalThis.command = cdp;', sandbox);
  return { ...sandbox, commands, timers,
    emit: message => socket.onmessage({ data: JSON.stringify(message) }),
    expire: () => { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
  };
};

(async () => {
  let cases = 0;
  for (const file of files) {
    let client = transport(file);
    const success = client.command('Runtime.evaluate', { expression: 'owned constant' }, 'owned-a');
    assert.equal(client.commands[0].sessionId, 'owned-a');
    client.emit({ id: client.commands[0].id, result: { value: 'owned' } });
    assert.equal(JSON.stringify(await success), '{"value":"owned"}');
    assert.equal(client.pending.size, 0); assert.equal(client.timers.size, 0); cases++;

    client = transport(file);
    const failed = assert.rejects(client.command('Runtime.evaluate', {}, 'owned-a'), error =>
      error.code === 'BROWSER_PROTOCOL_FAILED' && !error.message.includes('private diagnostic'));
    client.emit({ id: client.commands[0].id, error: { message: 'private diagnostic' } });
    await failed;
    assert.equal(client.timers.size, 0); cases++;

    client = transport(file);
    const departed = assert.rejects(client.command('Runtime.evaluate', {}, 'owned-a'), { code: 'BROWSER_PROTOCOL_FAILED' });
    const other = client.command('Runtime.evaluate', {}, 'owned-b');
    const root = client.command('Target.getTargets');
    client.emit({ method: 'Target.detachedFromTarget', params: { sessionId: 'unknown-session' } });
    assert.equal(client.pending.size, 3);
    client.emit({ method: 'Target.detachedFromTarget', params: { sessionId: 'owned-a' } });
    await departed;
    assert.equal(client.pending.size, 2); assert.equal(client.timers.size, 2);
    client.emit({ id: client.commands[1].id, result: {} });
    client.emit({ id: client.commands[2].id, result: {} });
    await Promise.all([other, root]); cases++;

    client = transport(file);
    const timeout = assert.rejects(client.command('Runtime.evaluate', { expression: 'private parameter' }, 'owned-a', 25), error =>
      error.code === 'BROWSER_PROTOCOL_TIMEOUT' && error.method === 'Runtime.evaluate' && !error.message.includes('private parameter'));
    assert.equal([...client.timers.values()][0].milliseconds, 25);
    client.expire(); await timeout;
    assert.equal(client.pending.size, 0); assert.equal(client.timers.size, 0); cases++;

    client = transport(file);
    const disconnected = [
      assert.rejects(client.command('Runtime.evaluate', {}, 'owned-a'), { code: 'BROWSER_PROTOCOL_FAILED' }),
      assert.rejects(client.command('Target.getTargets'), { code: 'BROWSER_PROTOCOL_FAILED' }),
    ];
    client.socket.close(); await Promise.all(disconnected);
    assert.equal(client.pending.size, 0); assert.equal(client.timers.size, 0); cases++;

    client = transport(file); client.socket.readyState = 3;
    await assert.rejects(client.command('Target.getTargets'), { code: 'BROWSER_NOT_AVAILABLE' });
    assert.equal(client.commands.length, 0); assert.equal(client.timers.size, 0); cases++;

    client = transport(file); client.socket.send = () => { throw new Error('private socket diagnostic'); };
    await assert.rejects(client.command('Target.getTargets'), { code: 'BROWSER_PROTOCOL_FAILED' });
    assert.equal(client.pending.size, 0); assert.equal(client.timers.size, 0); cases++;
  }
  let client = transport('open-tab-injection-browser-test.js');
  const crashed = assert.rejects(client.command('Runtime.evaluate', {}, 'owned-a'), { code: 'BROWSER_PROTOCOL_FAILED' });
  const root = client.command('Target.getTargets');
  client.emit({ method: 'Inspector.targetCrashed', sessionId: 'owned-a' });
  await crashed;
  assert.equal(client.pending.size, 1); assert(client.detached.has('owned-a'));
  client.emit({ id: client.commands[1].id, result: {} });
  await root; cases++;
  client = transport('open-tab-injection-browser-test.js');
  const malformed = assert.rejects(client.command('Target.getTargets'), { code: 'BROWSER_PROTOCOL_FAILED' });
  client.socket.onmessage({ data: 'invalid protocol JSON' });
  await malformed;
  assert.equal(client.pending.size, 0); assert.equal(client.timers.size, 0); cases++;
  console.log(JSON.stringify({ browser_protocol_regression: true, transports: files.length, cases, passed: true }));
})().catch(() => { console.log(JSON.stringify({ browser_protocol_regression: true, passed: false })); process.exitCode = 1; })
  .finally(() => clearTimeout(watchdog));
