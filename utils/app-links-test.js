'use strict';
// syrius:// links in the Android app (src/platform/linkRoutes.js): desktop
// Syrius's actions open the same screens with only their named arguments,
// requests carry a usable callback whose origin is the requester, and
// nothing else gets through.
//
//   node utils/app-links-test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

const filename = path.join(__dirname, '..', 'src/platform/linkRoutes.js');
const { code } = babel.transformFileSync(filename, { presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]], babelrc: false, configFile: false });
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const { parseLink, callbackOrigin, base64url } = mod.exports;

let passed = 0;
const check = (name, fn) => { try { fn(); passed += 1; } catch (error) { console.error(`FAIL ${name}`); throw error; } };
const z = 'z1qzal6c5s9rjnnxd2z7dvdhjxpmmj4fmw56a0mz';

check('desktop Syrius links', () => {
  assert.deepEqual(parseLink(`syrius://transfer?address=${z}&amount=1.5&zts=znn`),
    { kind: 'screen', path: `/tabs/dashboard/send?address=${z}&amount=1.5&zts=znn` });
  assert.deepEqual(parseLink('syrius://stake?amount=100&duration=3'), { kind: 'screen', path: '/tabs/stake?amount=100&duration=3' });
  assert.deepEqual(parseLink('syrius://delegate?pillar=Pillar1'), { kind: 'screen', path: '/tabs/delegate?pillar=Pillar1' });
  assert.deepEqual(parseLink(`syrius://fuse?address=${z}&amount=10`), { kind: 'screen', path: `/tabs/plasma?address=${z}&amount=10` });
  assert.deepEqual(parseLink('syrius://sentinel'), { kind: 'screen', path: '/tabs/sentinel' });
  assert.deepEqual(parseLink('syrius://pillar'), { kind: 'screen', path: '/tabs/pillar' });
});

check('link shapes desktop Syrius also accepts', () => {
  // Windows passes syrius://transfer/?…; some apps send syrius:transfer?…
  assert.equal(parseLink('syrius://transfer/?amount=1').path, '/tabs/dashboard/send?amount=1');
  assert.equal(parseLink('syrius:transfer?amount=1').path, '/tabs/dashboard/send?amount=1');
  assert.equal(parseLink('SYRIUS://Receive').path, '/tabs/dashboard/receive');
});

check('only named arguments, bounded', () => {
  assert.equal(parseLink('syrius://transfer?amount=1&callback=https://x.test&password=p').path, '/tabs/dashboard/send?amount=1');
  assert.equal(parseLink(`syrius://transfer?address=${'z'.repeat(300)}`).path, '/tabs/dashboard/send');
  assert.equal(parseLink(`syrius://sign-message?message=${'a'.repeat(5000)}`).path.length > 5000, true);
  assert.equal(parseLink('syrius://receive?address=z1').path, '/tabs/dashboard/receive');
});

check('unknown and foreign links are nothing', () => {
  for (const raw of ['syrius://wc?uri=x', 'syrius://', 'syrius://unknown', 'https://transfer?amount=1', 'not a url', '', null]) {
    assert.equal(parseLink(raw), null, String(raw));
  }
});

check('requests', () => {
  const params = { accountBlock: { blockType: 2, toAddress: z, amount: '1' } };
  const encoded = base64url.encode(JSON.stringify(params));
  const link = parseLink(`syrius://request?method=znn_signAndSendBlock&id=7&params=${encoded}&callback=${encodeURIComponent('https://dapp.example/done?x=1')}`);
  assert.deepEqual(link, { kind: 'request', method: 'znn_signAndSendBlock', params, id: '7',
    callback: 'https://dapp.example/done?x=1', origin: 'https://dapp.example' });
  const plain = parseLink(`syrius://request?method=znn_sign&params=${encodeURIComponent('{"message":"hi"}')}&callback=myapp://cb`);
  assert.deepEqual(plain.params, { message: 'hi' });
  assert.equal(plain.origin, 'myapp://cb');
  assert.match(plain.id, /^syrius-\d+$/);
});

check('requests refused', () => {
  const cb = encodeURIComponent('https://dapp.example/');
  assert.equal(parseLink(`syrius://request?method=znn_unknown&callback=${cb}`), null);
  assert.equal(parseLink('syrius://request?method=znn_sign&params=%7B%22message%22%3A%22x%22%7D'), null, 'no callback');
  assert.equal(parseLink(`syrius://request?method=znn_sign&params=%7Bnope&callback=${cb}`), null, 'bad params');
});

check('callback origins', () => {
  assert.equal(callbackOrigin('https://a.example:8443/x?y'), 'https://a.example:8443');
  assert.equal(callbackOrigin('MyApp://Return/path'), 'myapp://return');
  for (const refused of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc', 'syrius://transfer',
    'intent://x#Intent;end', 'content://x', 'not a url']) {
    assert.equal(callbackOrigin(refused), null, refused);
  }
});

check('http callbacks only to private hosts', () => {
  for (const [allowed, origin] of [['http://192.168.1.20:8787/?x', 'http://192.168.1.20:8787'],
    ['http://10.0.0.2/', 'http://10.0.0.2'], ['http://172.16.0.1/', 'http://172.16.0.1'],
    ['http://172.31.255.1/', 'http://172.31.255.1'], ['http://127.0.0.1:3000/', 'http://127.0.0.1:3000'],
    ['http://LOCALHOST:8080/', 'http://localhost:8080'], ['http://pc.local/', 'http://pc.local'],
    ['http://[::1]:9/', 'http://[::1]:9'], ['http://0x7f.1/', 'http://127.0.0.1']]) {
    assert.equal(callbackOrigin(allowed), origin, allowed);
  }
  for (const refused of ['http://a.example/', 'http://8.8.8.8/', 'http://172.32.0.1/', 'http://172.15.0.1/',
    'http://192.169.0.1/', 'http://11.0.0.1/', 'http://local/', 'http://evil.local.example/',
    'http://192.168.1.1.nip.io/', 'http://[2001:db8::1]/']) {
    assert.equal(callbackOrigin(refused), null, refused);
  }
});

check('base64url round trip', () => {
  const text = JSON.stringify({ message: 'héllo ✓', n: [1, 2] });
  assert.equal(base64url.decode(base64url.encode(text)), text);
  assert.doesNotMatch(base64url.encode('???>>>'), /[+/=]/);
});

console.log(`app-links: desktop actions, argument filtering, requests and callbacks: ${passed} passed`);
