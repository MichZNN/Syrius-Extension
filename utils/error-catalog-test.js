// The numbered errors (src/services/utils/errorCatalog.js, errors.js).
//
// Three things are held here. The catalogue is well formed: numbers and texts
// are unique, read from the source because a repeated key in an object literal
// silently wins. Every error made anywhere in `src` comes from it: a scan of
// each `throw`, each `new Error` and each toast. And whatever is thrown, by
// the wallet or at it, what reaches the screen is one short line with a
// number: no stack, no JSON, no hex dump.
//
//   node utils/error-catalog-test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const toasts = [];
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args);

const load = (file, cache = new Map()) => {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename);
  const mod = { exports: {} };
  cache.set(filename, mod.exports);
  const { code } = babel.transformFileSync(filename, {
    presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-react'], babelrc: false, configFile: false,
  });
  const resolve = (name) => {
    if (name === 'react-toastify') return { toast: Object.assign((content, options) => { toasts.push({ content, options }); return toasts.length; }, { dismiss() {} }) };
    return name.startsWith('.') ? load(path.resolve(path.dirname(filename), name) + (path.extname(name) ? '' : '.js'), cache) : require(name);
  };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, resolve);
  cache.set(filename, mod.exports);
  return mod.exports;
};

const cache = new Map();
const catalog = load('src/services/utils/errorCatalog.js', cache).default;
const errors = load('src/services/utils/errors.js', cache);
const { notify } = load('src/services/utils/notify.js', cache);
const { fail, relay, describe, readableError, brief, isPlain } = errors;

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; } catch (error) { console.error(`FAIL ${name}`); throw error; }
};

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return files(full);
  return /\.(js|jsx)$/.test(entry.name) ? [full] : [];
});
const sources = files(path.join(root, 'src')).map((full) => ({
  file: path.relative(root, full).replace(/\\/g, '/'),
  text: fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n'),
}));
// Code only: a comment may say "throw" or quote a message.
const codeLines = (text) => text.split('\n')
  .map((line, index) => ({ line, number: index + 1 }))
  .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line));

//
// The catalogue
//
const catalogSource = read('src/services/utils/errorCatalog.js');
const entries = [...catalogSource.matchAll(/^ {2}(\d+): '((?:[^'\\]|\\.)*)',$/gm)].map((m) => ({ id: Number(m[1]), text: m[2].replace(/\\'/g, "'") }));

test('catalogue: every number once, every text once, in order', () => {
  assert.ok(entries.length >= 80, `${entries.length} entries`);
  assert.equal(entries.length, Object.keys(catalog).length, 'a line the scan missed, or a repeated number');
  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'a number is used twice');
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'numbers ascend');
  const texts = entries.map((entry) => entry.text);
  const twice = texts.filter((text, index) => texts.indexOf(text) !== index);
  assert.deepEqual(twice, [], 'the same wording under two numbers');
  for (const { id, text } of entries) {
    assert.ok(id >= 100 && id <= 899, `${id} is outside 100-899`);
    assert.equal(catalog[id], text);
  }
});

test('catalogue: short, one line, no em dash, a reason only at the end', () => {
  for (const { id, text } of entries) {
    assert.ok(text.trim() === text && text.length > 0, `${id} is empty or padded`);
    assert.ok(text.length <= 150, `${id} is ${text.length} characters`);
    assert.ok(!/[\n\r—]/.test(text), `${id} has a line break or an em dash`);
    const at = text.indexOf('{reason}');
    if (at >= 0) {
      assert.equal(text.lastIndexOf('{reason}'), at, `${id} has two reasons`);
      assert.ok(/^[).]*$/.test(text.slice(at + 8)), `${id}: the reason is not last`);
      assert.ok(text.slice(0, at).replace(/[\s:(]+$/, '').length > 10, `${id} says nothing without its reason`);
    }
  }
  assert.equal(catalog[100], 'Something went wrong. Try again.');
});

//
// Every error in src is one of them
//
const usedIds = new Map();
for (const { file, text } of sources) {
  for (const m of text.matchAll(/\bfail\(\s*([^,)]+?)\s*[,)]/g)) {
    const numbers = /^\d+$/.test(m[1]) ? [m[1]] : (m[1].match(/\b\d{3}\b/g) || []);
    for (const number of numbers) usedIds.set(Number(number), [...(usedIds.get(Number(number)) || []), file]);
  }
  for (const m of text.matchAll(/\brelay\([^;]*?,\s*(\d{3})\)/g)) usedIds.set(Number(m[1]), [...(usedIds.get(Number(m[1])) || []), file]);
}

test('src: every fail() names a catalogue number and fills its braces', () => {
  let calls = 0;
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/\bfail\(\s*(\d+)\s*([,)])([^\n]*)/g)) {
      calls += 1;
      const id = Number(m[1]);
      assert.ok(Object.hasOwn(catalog, id), `${file}: fail(${id}) is not in the catalogue`);
      const wanted = [...catalog[id].matchAll(/\{(\w+)\}/g)].map((key) => key[1]);
      if (!wanted.length) continue;
      assert.equal(m[2], ',', `${file}: fail(${id}) needs ${wanted.join(', ')}`);
      for (const key of wanted) assert.ok(new RegExp(`\\b${key}\\b`).test(m[3]), `${file}: fail(${id}) does not pass ${key}`);
    }
  }
  assert.ok(calls >= 90, `${calls} calls`);
});

test('src: no entry is dead', () => {
  // Read by describe() itself: the fallback, the wrong password, what a node
  // said, and the node messages it recognises.
  const byDescribe = [100, 200, 300, 302, 303, 304, 305, 306, 321];
  const errorsSource = read('src/services/utils/errors.js');
  for (const id of byDescribe) assert.ok(new RegExp(`\\b${id}\\b`).test(errorsSource), `errors.js no longer uses ${id}`);
  for (const { id } of entries) {
    assert.ok(usedIds.has(id) || byDescribe.includes(id), `${id} "${catalog[id]}" is used nowhere`);
  }
});

// `new Error` lives in errors.js.
test('src: no Error is made outside the catalogue', () => {
  const allowed = {
    'src/services/utils/errors.js': null,
  };
  for (const { file, text } of sources) {
    const made = codeLines(text).filter(({ line }) => /(?<![A-Za-z])Error\(/.test(line));
    if (allowed[file] === null) continue;
    assert.deepEqual(made.map(({ line }) => line.trim()), allowed[file] || [], file);
  }
});

// What may follow `throw`. Anything else is a new error that skipped the catalogue.
const anywhere = [
  /^(fail|relay)\(/,
  /^Object\.assign\(fail\(/,
  // Factories, each checked below to return a catalogue error.
  /^(ended|changed|invalid|busy|unavailable|requestEnded|approvalEnded)\(\)/,
  // The update's archive refusals carry what was wrong with the archive.
  /^refuse\('[^']*'\);|^refuse\(`[^`]*`\);/,
  /^(session|selection)\.(ended|changed)\(\)/,
  // Something caught, or kept, and passed on.
  /^(error|err|nonce|block|afterError);/,
];
// Answered to a web page as JSON-RPC, never shown in the wallet.
const toSites = [
  /^(invalid|invalidParams)\(/,
  /^errors\.(disconnected|unauthorized)\b/,
];

test('src: every throw is a catalogue error, a rethrow, or an answer to a site', () => {
  let count = 0;
  for (const { file, text } of sources) {
    if (file === 'src/services/utils/errors.js') continue;
    const forms = [...anywhere,
      ...(/^src\/sections\/(Background|Inpage|Content)\//.test(file) ? toSites : [])];
    for (const { line, number } of codeLines(text)) {
      for (const m of line.matchAll(/\bthrow\s+(.*)/g)) {
        count += 1;
        // Several throws can share a line; each is judged from its own start.
        const rest = m[1];
        assert.ok(forms.some((form) => form.test(rest)), `${file}:${number}: throw ${rest.slice(0, 80)}`);
      }
    }
  }
  assert.ok(count >= 140, `${count} throws seen`);
});

test('src: the factories behind those throws return catalogue errors', () => {
  const definitions = {
    'src/services/wallet/sessionLease.js': ["const ended = () => Object.assign(fail(201), { code: 'WALLET_LOCKED' });", 'const unavailable = () => Object.assign(fail(202), {', 'const changed = () => Object.assign(fail(203), {'],
    'src/services/wallet/removal.js': ['const changed = () => fail(213);', 'const invalid = () => fail(214);'],
    'src/services/wallet/blockApproval.js': ['const changed = () => fail(820);'],
    'src/services/update/zip.js': ["const refuse = (detail) => fail(129, { detail }, { code: 'UPDATE_ARCHIVE' });"],
    'src/services/wallet/journal.js': ["const unavailable = () => fail(322, undefined, { code: 'JOURNAL_UNAVAILABLE' });"],
    'src/services/wallet/approvalOperation.js': ['const ended = () => fail(814);'],
    'src/services/utils/approvalLimits.js': ['const invalid = () => Object.assign(fail(810), { code: -32602 });', 'const busy = () => Object.assign(fail(811), { code: -32005 });'],
    'src/services/utils/approvalIdentity.js': ['const approvalEnded = () => fail(809);'],
    'src/services/utils/documentBinding.js': ['const requestEnded = () => Object.assign(fail(812), { code: 4900 });'],
    'src/services/utils/approvalContractCalls.js': ['const invalid = () => { throw fail(806); };'],
    'src/services/wallet/session.js': ['ended: lease.ended, changed: lease.changed,'],
    'src/services/wallet/selection.js': ['changed: ended } = lease;'],
  };
  for (const [file, lines] of Object.entries(definitions)) {
    const text = read(file);
    for (const line of lines) assert.ok(text.includes(line), `${file}: ${line}`);
  }
  // No other definition of those names exists to be thrown instead.
  const names = /^const (ended|changed|invalid|busy|unavailable|requestEnded|approvalEnded) = \(/;
  for (const { file, text } of sources) {
    for (const { line } of codeLines(text)) {
      if (!names.test(line)) continue;
      const known = (definitions[file] || []).some((definition) => line.startsWith(definition.slice(0, 24)));
      assert.ok(known, `${file}: ${line.trim()}`);
    }
  }
});

test('src: a toast is never given a bare string', () => {
  let count = 0;
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/notify\.error\(\s*([^\n]{0,60})/g)) {
      count += 1;
      assert.ok(!/^['"`]/.test(m[1]), `${file}: notify.error(${m[1]}`);
      assert.ok(/^(fail\(|[A-Za-z_][\w.]*\)|describe|a\.|error =>|value =>)/.test(m[1]) || /^[A-Za-z_]\w*\(/.test(m[1]), `${file}: notify.error(${m[1]}`);
    }
  }
  assert.ok(count >= 50, `${count} toasts`);
});

test('src: the worker sends an error\'s number with its text, and the popup keeps it', () => {
  assert.ok(read('src/sections/Background/index.js').includes("sendResponse({ error: err?.message || 'Internal error', ...(Number.isInteger(err?.errorId) ? { errorId: err.errorId } : {}) })"));
  assert.ok(read('src/services/utils/messaging.js').includes('settle(reject, relay(response.error, response.errorId));'));
});

//
// What reaches the screen
//
const onScreen = (described, label) => {
  const { id, code, text, line } = described;
  assert.ok(Object.hasOwn(catalog, id), `${label}: ${id} is not in the catalogue`);
  assert.equal(code, `E${id}`);
  assert.equal(line, `${text} (E${id})`);
  assert.ok(text.length > 0 && text.length <= 260, `${label}: ${text.length} characters`);
  assert.ok(!/[\r\n]/.test(text), `${label}: more than one line`);
  assert.ok(!/[{}]|"\s*:/.test(text), `${label}: JSON on screen: ${text}`);
  assert.ok(!/\bat \S+ \(|\.js:\d+/.test(text), `${label}: a stack on screen: ${text}`);
  assert.ok(!/[0-9a-fA-F]{65,}/.test(text), `${label}: a hex dump on screen`);
  assert.ok(!/\[object |undefined|null\b/.test(text), `${label}: ${text}`);
  return described;
};

test('fail: the catalogue text, its number, the fields asked for', () => {
  const plain = fail(307);
  assert.ok(plain instanceof Error);
  assert.equal(plain.message, 'The signing account changed.');
  assert.equal(plain.errorId, 307);
  assert.equal(plain.code, undefined, 'code is left for JSON-RPC and session codes');
  assert.equal(fail(433, { sent: 'ZNN', failed: 'QSR' }).message, 'Only part of the zap was sent: the ZNN left, the QSR did not.');
  const refused = fail(300, { reason: 'account chain is not ready' }, { code: -32000, refused: true });
  assert.equal(refused.message, 'The node refused this: account chain is not ready');
  assert.deepEqual([refused.code, refused.refused, refused.errorId], [-32000, true, 300]);
  for (const unknown of [99, 9999, '307', null, undefined, 3.5, 'constructor', '__proto__']) {
    assert.equal(fail(unknown).errorId, 100, String(unknown));
    assert.equal(fail(unknown).message, catalog[100]);
  }
  assert.equal(fail(110, { text: '' }).errorId, 100, 'an entry that came out empty is the fallback');
  assert.equal(fail(110, { text: 'Use at least 8 characters.' }).message, 'Use at least 8 characters.');
});

test('fail: what fills a brace is cut to one short line; an unshowable reason ends the sentence', () => {
  const dump = `0x${'ab'.repeat(900)}`;
  assert.equal(brief('a\nb'), 'a');
  assert.equal(brief('  a   b  '), 'a b');
  assert.ok(brief(dump).length < 30 && brief(dump).includes('…'));
  assert.ok(brief('x'.repeat(500)).length <= 160);
  for (const value of [null, undefined, {}, [], () => {}]) assert.equal(brief(value), '');
  assert.equal(brief(69), '69');

  assert.ok(isPlain('execution reverted: UniswapV2: K'));
  for (const bad of ['', 'x'.repeat(121), '{"code":-32000}', 'a\nb', 'TypeError\n    at f (popup.bundle.js:1:2)', `block ${'c'.repeat(64)}`, '<html>']) assert.ok(!isPlain(bad), bad);

  warnings.length = 0;
  for (const hidden of ['{"code":-32000,"message":"x"}', dump, 'TypeError: x\n    at f (a.js:1:1)']) {
    assert.equal(fail(300, { reason: hidden }).message, 'The node refused this.');
  }
  assert.equal(fail(300, {}).message, 'The node refused this.');
  assert.equal(warnings.length, 3, 'each hidden reason went to the console');
  assert.equal(warnings[0][0], '[E300]');
  const withReason = entries.filter(({ text }) => text.includes('{reason}')).map(({ id }) => id);
  assert.ok(withReason.includes(300));
  for (const id of withReason) {
    onScreen(describe(fail(id, { reason: dump })), `fail(${id}) with a dump`);
    onScreen(describe(fail(id, { reason: 'a short reason' })), `fail(${id})`);
    assert.ok(fail(id, { reason: 'a short reason' }).message.includes('a short reason'));
  }
  assert.ok(fail(433, { sent: dump, failed: 'QSR' }).message.length < 120);
});

test('describe: the wallet\'s own errors keep their number', () => {
  for (const { id } of entries) {
    const params = { text: 'A form message.', reason: 'a reason', method: 'm', status: 500, name: 'n', contract: 'c', count: 2, chainId: 5, reported: 5, wanted: 7, host: 'rpc.example', state: 'did not answer in time', network: 'ZVM Devnet', inbox: 'z1in', known: 'z1known', signing: 1, bytes: 9, chunks: 4, vault: 'z1v', sent: 'ZNN', failed: 'QSR', done: 2, total: 3, version: '0.3.7', found: '0.3.5', detail: 'no central directory' };
    for (const key of catalog[id].matchAll(/\{(\w+)\}/g)) assert.ok(key[1] in params, `${id}: this test has no value for {${key[1]}}`);
    const error = fail(id, params);
    assert.equal(error.errorId, id);
    assert.ok(!/[{}]/.test(error.message), `${id} left a brace unfilled: ${error.message}`);
    const described = onScreen(describe(error), `E${id}`);
    assert.equal(described.id, id);
    assert.equal(described.text, error.message);
  }
});

test('describe: errors that crossed a channel as text are found by their text', () => {
  assert.equal(describe(relay('Approval expired during finalization.')).id, 801);
  assert.equal(describe('Approval expired during finalization.').id, 801);
  assert.equal(describe(new Error('Error: Error: The signing account changed.')).id, 307);
  assert.equal(describe(relay('Only part of the zap was sent: the ZNN left, the QSR did not.', 433)).line, 'Only part of the zap was sent: the ZNN left, the QSR did not. (E433)');
  assert.equal(relay('whatever', 9999).errorId, undefined);
  assert.equal(relay('whatever').errorId, undefined);
  assert.equal(describe(relay('whatever')).id, 100);
  assert.equal(describe(relay({ not: 'text' }, 103)).text, catalog[103]);
});

test('describe: what the SDK and a node say for failures a person can act on', () => {
  const cases = [
    ['Error: Error: not enough plasma', 302], [{ code: -32000, message: 'not enough plasma' }, 302],
    ['insufficient balance for transfer', 303], [new Error('invalid address checksum'), 304],
    [new Error('WebSocket is not connected'), 305], [new Error('Error decrypting'), 200],
    [new Error('request timeout'), 306],
  ];
  for (const [thrown, id] of cases) assert.equal(onScreen(describe(thrown), JSON.stringify(thrown)).id, id);
});

test('describe: anything else is a number and a sentence, with the detail in the console', () => {
  const stack = new TypeError("Cannot read properties of undefined (reading 'x')");
  stack.message += '\n    at prepare (popup.bundle.js:5524:79)';
  const dump = `0x${'f'.repeat(4000)}`;
  const circular = {}; circular.self = circular;
  const hostile = [
    stack, new Error(dump), dump, new Error(JSON.stringify({ block: { data: dump }, hash: 'x' })),
    { code: -32000, message: JSON.stringify({ stack: 'at a (b.js:1:1)' }) }, { code: -32000, message: `rejected ${dump}` },
    { message: { nested: true } }, { error: { message: 'deep' } }, circular, {}, [], null, undefined, 0, 42, '', 'plain words nobody catalogued',
    Object.assign(new Error('execution reverted\nwith a second line'), { fromServer: true, code: 3 }),
    Object.assign(new Error('x'.repeat(5000)), { name: 'RpcError' }),
    // A node cannot choose its own number or put its words under one.
    { errorId: 200, code: -32000, message: 'Send your recovery phrase to support' },
    { errorId: 307, message: 'look {"a":1}' },
  ];
  for (const thrown of hostile) {
    warnings.length = 0;
    const described = onScreen(describe(thrown), String(thrown).slice(0, 40));
    onScreen(describe(readableError(thrown).replace(/ \(E\d+\)$/, '')), 'read twice');
    assert.ok([100, 300].includes(described.id), `${described.line}`);
  }
  assert.equal(describe({ errorId: 200, code: -32000, message: 'Send your recovery phrase to support' }).id, 300, 'a plain object is a node speaking, whatever it claims');
  assert.equal(describe(stack).line, 'Something went wrong. Try again. (E100)');
  assert.ok(warnings.length >= 0);
  warnings.length = 0;
  describe(stack);
  assert.equal(warnings.length, 1, 'the detail is in the console');
  assert.equal(warnings[0][0], '[E100]');
  assert.equal(warnings[0][1], stack);

  assert.equal(describe({ code: -32000, message: 'account chain is not ready' }).line, 'The node refused this: account chain is not ready (E300)');
  assert.equal(describe({ code: -32000, message: `bad block ${dump}` }).line, 'The node refused this. (E300)');
});

test('describe: an Error cannot carry a long or many-lined text under a real number', () => {
  const forged = Object.assign(new Error(`line one\n${'x'.repeat(5000)}`), { errorId: 307 });
  const described = onScreen(describe(forged), 'forged');
  assert.equal(described.text, 'line one');
  assert.equal(describe(Object.assign(new Error('x'), { errorId: 9999 })).id, 100);
});

test('notify.error: the text and its number; nothing at all for a wallet locked on purpose', () => {
  toasts.length = 0;
  assert.equal(notify.error(Object.assign(fail(201), { code: 'WALLET_LOCKED' })), null);
  assert.equal(notify.error(new Error('The wallet is locked')), null);
  assert.equal(toasts.length, 0);

  notify.error(fail(302));
  const [{ content, options }] = toasts;
  assert.equal(options.type, 'error');
  const [text, , chip] = content.props.children;
  assert.equal(text, catalog[302]);
  assert.equal(chip.props.className, 'error-code');
  assert.equal(chip.props.children, 'E302');

  notify.error({ code: -32000, message: JSON.stringify({ stack: 'x' }) });
  assert.equal(toasts[1].content.props.children[0], 'The node refused this.');
  assert.equal(toasts[1].content.props.children[2].props.children, 'E300');
});

test('the stylesheet styles the number', () => {
  assert.match(read('src/sections/Popup/Popup.scss'), /\.error-code \{[^}]*font-family: var\(--font-mono\);/);
});

console.warn = realWarn;
console.log(`error-catalog-test: ${passed} passed`);
