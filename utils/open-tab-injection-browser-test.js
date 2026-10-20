'use strict';
// Pages open before the extension is installed get the wallet without a reload
// (src/sections/Background/openTabs.js). Drives the built Chrome package in a
// disposable profile against loopback pages; every other host goes to a closed
// proxy port. Reads only: no wallet, no approval, no node.
//
//   CHROMIUM_PATH=... node utils/open-tab-injection-browser-test.js [extension dir]
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const executable = process.env.CHROMIUM_PATH;
const extension = path.resolve(process.argv[2] || path.join(__dirname, '..', 'build'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [];
let stage = 'setup', browser, server, profile;

const pages = {
  // A page and a same-origin frame, both open before the install.
  '/top': '<!doctype html><title>Open before install</title><iframe src="/frame"></iframe>',
  '/frame': '<!doctype html><title>Frame</title>',
  // A page with a `zenon` of its own, which must be left as it is.
  '/taken': '<!doctype html><title>Taken</title><script>Object.defineProperty(window,"zenon",{value:{mine:true},configurable:false})</script>',
};

(async () => {
  try {
    assert(executable && fs.existsSync(executable), 'Set CHROMIUM_PATH');
    assert(fs.existsSync(path.join(extension, 'manifest.json')), 'Build the Chrome package first');
    server = http.createServer((request, response) => {
      const body = pages[request.url];
      response.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
      response.end(body || '');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'syrius-open-tabs-'));
    browser = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
      '--enable-unsafe-extension-debugging', '--proxy-server=http://127.0.0.1:9', '--no-first-run',
      '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', 'about:blank'],
    { stdio: 'ignore' });
    let port;
    for (let i = 0; i < 300 && !port; i++) {
      try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); }
      catch { await sleep(50); }
    }
    assert(port, 'Browser endpoint');
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0; const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data), waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      message.error ? waiting.reject(new Error(message.error.message)) : waiting.resolve(message.result);
    };
    const cdp = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const open = async url => {
      const { targetId } = await cdp('Target.createTarget', { url });
      const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
      return { targetId, sessionId };
    };
    const evaluate = async (tab, expression) => {
      const { result, exceptionDetails } = await cdp('Runtime.evaluate',
        { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true }, tab.sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    };
    const until = async (tab, expression, label, ms = 10000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) { if (await evaluate(tab, expression).catch(() => false)) return; await sleep(100); }
      throw new Error('Timed out: ' + label);
    };
    // Counts the relay's replies to the page, so a doubled relay shows as two.
    const countReplies = '(()=>{window.__replies=0;addEventListener("message",e=>{if(e.source===window&&e.data?.target==="znn-inpage"&&e.data.kind==="response")window.__replies++;});return true})()';
    const oneRoundTrip = async (tab, frame = 'window') => {
      const before = await evaluate(tab, `${frame}.__replies`);
      const accounts = await evaluate(tab, `${frame}.zenon.getAccounts()`);
      await sleep(300);
      assert.deepEqual(accounts, [], 'An unconnected site reads no accounts');
      assert.equal(await evaluate(tab, `${frame}.__replies`) - before, 1, 'One reply per request');
    };

    stage = 'pages open before install';
    const early = await open(origin + '/top');
    const taken = await open(origin + '/taken');
    await until(early, 'document.querySelector("iframe")?.contentDocument?.readyState==="complete"', 'frame loaded');
    assert.equal(await evaluate(early, 'typeof window.zenon'), 'undefined');
    await evaluate(early, countReplies);
    await evaluate(early, `(()=>{const f=document.querySelector("iframe").contentWindow;f.eval(${JSON.stringify(countReplies)});return true})()`);

    stage = 'install';
    const { id } = await cdp('Extensions.loadUnpacked', { path: extension });
    assert.match(id, /^[a-p]{32}$/);
    await until(early, 'typeof window.zenon?.sendAccountBlock==="function"', 'provider in the open page');
    await until(early, 'typeof document.querySelector("iframe").contentWindow.zenon?.sendAccountBlock==="function"', 'provider in its frame');
    cases.push('an open page and its frame get window.zenon on install');
    await oneRoundTrip(early);
    await oneRoundTrip(early, 'document.querySelector("iframe").contentWindow');
    cases.push('the injected relay answers the page and the frame once');
    assert.equal(await evaluate(taken, 'window.zenon.mine===true&&typeof window.zenon.sendAccountBlock'), 'undefined');
    cases.push("a page's own zenon is left alone");

    stage = 'second injection';
    const { targetInfos } = await cdp('Target.getTargets');
    const workerInfo = targetInfos.find(info => info.type === 'service_worker' && info.url.startsWith(`chrome-extension://${id}/`));
    assert(workerInfo, 'Extension worker');
    const worker = { sessionId: (await cdp('Target.attachToTarget', { targetId: workerInfo.targetId, flatten: true })).sessionId };
    const tabId = await evaluate(worker, `(await chrome.tabs.query({url:${JSON.stringify(origin + '/top')}}))[0].id`);
    const files = await evaluate(worker, 'chrome.runtime.getManifest().content_scripts.map(entry=>({js:entry.js,world:entry.world||"ISOLATED"}))');
    for (const entry of files) {
      await evaluate(worker, `chrome.scripting.executeScript({target:{tabId:${tabId}},files:${JSON.stringify(entry.js)},world:${JSON.stringify(entry.world)}}).then(()=>true)`);
    }
    await oneRoundTrip(early);
    cases.push('a second injection neither doubles the relay nor replaces the provider');

    stage = 'new page after install';
    const fresh = await open(origin + '/top');
    await until(fresh, 'typeof window.zenon?.sendAccountBlock==="function"', 'provider in a new page');
    await evaluate(fresh, countReplies);
    await oneRoundTrip(fresh);
    cases.push('a page loaded after install still gets exactly one relay');

    stage = 'update';
    await evaluate(early, 'window.__before=window.zenon,true');
    await evaluate(worker, '(chrome.runtime.reload(),true)').catch(() => {});
    await sleep(3000);
    assert.equal(await evaluate(early, 'window.zenon===window.__before'), true, 'The provider is not replaced on update');
    cases.push('an update leaves an existing provider in place');

    console.log(JSON.stringify({ open_tab_injection: true, browser: version.Browser, cases, passed: true }));
  } catch (error) {
    console.log(JSON.stringify({ open_tab_injection: true, failed_stage: stage, error: String(error.message || error), cases, passed: false }));
    process.exitCode = 1;
  } finally {
    if (browser && browser.exitCode === null) { browser.kill(); await sleep(1000); }
    server?.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})();
