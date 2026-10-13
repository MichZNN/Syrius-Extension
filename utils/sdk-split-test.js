'use strict';

// The Firefox build splits two string constants out of the prebundled SDK
// (utils/sdk-split-loader.js, issue #44). This checks that the split is exact:
// putting each part back where its require stands gives the SDK's own bytes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const loader = require('./sdk-split-loader');

const resourcePath = require.resolve('znn-ts-sdk');
const run = (source, resourceQuery = '') => loader.call({ resourcePath, resourceQuery }, source);
const requestOf = (name) => `require(${JSON.stringify(`!!${require.resolve('./sdk-split-loader')}!${resourcePath}?literal=${name}`)})`;
const valueOf = (part) => { const module = { exports: null }; vm.runInNewContext(part, { module }); return module.exports; };

let passed = 0;
const check = (name, body) => { body(); passed++; };

const sdk = fs.readFileSync(resourcePath, 'utf8');
assert.equal(path.basename(resourcePath), 'index.js');

check('the real SDK splits and reassembles byte for byte', () => {
  const main = run(sdk);
  let rebuilt = main;
  for (const name of loader.literals) {
    const request = requestOf(name);
    assert.equal(main.split(request).length, 2, `${name} is required exactly once`);
    const part = run(sdk, `?literal=${name}`);
    assert(part.startsWith('module.exports=') && part.endsWith(';'));
    assert.equal(typeof valueOf(part), 'string');
    rebuilt = rebuilt.replace(request, () => part.slice('module.exports='.length, -1));
  }
  assert.equal(rebuilt, sdk);
});

check('every part and the remainder are under the parse limit', () => {
  const limit = 5 * 1024 * 1024;
  assert(Buffer.byteLength(sdk) >= limit, 'the SDK no longer needs splitting; remove the loader');
  assert(Buffer.byteLength(run(sdk)) < limit);
  for (const name of loader.literals) assert(Buffer.byteLength(run(sdk, `?literal=${name}`)) < limit);
});

check('the parts are what the SDK names them', () => {
  assert(valueOf(run(sdk, '?literal=base64Wasm')).startsWith('data:application/octet-stream;base64,'));
  assert(valueOf(run(sdk, '?literal=stringPow')).includes('Module'));
});

const tiny = (pow, wasm) => `var t={1:(_,A)=>{A.stringPow=void 0,A.stringPow=${pow}},2:(_,$a)=>{$a.base64Wasm=void 0,$a.base64Wasm=${wasm}}};`;

check('escaped quotes and backslashes stay inside the constant', () => {
  const pow = "'a\\'b\\\\'", wasm = '"c\\"d"';
  const source = tiny(pow, wasm);
  assert.equal(valueOf(run(source, '?literal=stringPow')), "a'b\\");
  assert.equal(valueOf(run(source, '?literal=base64Wasm')), 'c"d');
  assert.equal(run(source), tiny(requestOf('stringPow'), requestOf('base64Wasm')));
});

check('a missing, repeated or computed constant fails the build', () => {
  assert.throws(() => run('var t={};'), /expected one stringPow constant/);
  assert.throws(() => run(tiny("'a'", '"b"') + tiny("'a'", '"b"')), /found 2/);
  assert.throws(() => run(tiny('`a`', '"b"')), /not a plain string literal/);
  assert.throws(() => run(tiny("'a'", 'x+"b"')), /not a plain string literal/);
  assert.throws(() => run(tiny("'a", '"b"')), /not a plain string literal/);
  assert.throws(() => run(tiny("'a'", '"b"'), '?literal=other'), /unknown constant/);
});

console.log(`sdk-split: exact reassembly of the real SDK, part sizes, escapes and refusals: ${passed} passed`);
