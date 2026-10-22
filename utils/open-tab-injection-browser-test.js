'use strict';
// Pages open before the extension is installed get the wallet without a reload
// (src/sections/Background/openTabs.js). Drives the built Chrome package in a
// disposable profile against owned loopback pages. Every other origin goes to
// an owned denying proxy. Reads only: no wallet, no approval, no node.
//
//   CHROMIUM_PATH=... node utils/open-tab-injection-browser-test.js [extension dir]
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { jsLiteral } = require('./js-literal');

const executable = process.env.CHROMIUM_PATH;
const extension = path.resolve(process.argv[2] || path.join(__dirname, '..', 'build'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [];
const report = { open_tab_injection: true, cases, passed: false };
const failure = code => Object.assign(new Error('Open-tab fixture stage failed.'), { code });
const pending = new Map();
const detached = new Set();
const contextGenerations = new Map();
const connections = new Set();
let stage = 'setup', browser, server, proxy, profile, socket, cleanupPromise, printed = false;
let sequence = 0;
const alive = () => browser && browser.exitCode === null && browser.signalCode === null;
const track = connection => {
  connections.add(connection);
  connection.on('error', () => {});
  connection.on('close', () => connections.delete(connection));
};
const listen = listener => new Promise((resolve, reject) => {
  listener.once('error', () => reject(failure('BROWSER_LISTENER_UNAVAILABLE')));
  listener.listen(0, '127.0.0.1', resolve);
});
const cdp = (method, params = {}, sessionId, timeoutMs = 15000) => new Promise((resolve, reject) => {
  if (socket?.readyState !== WebSocket.OPEN) { reject(failure('BROWSER_NOT_AVAILABLE')); return; }
  const id = ++sequence;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(Object.assign(failure('BROWSER_PROTOCOL_TIMEOUT'), { method }));
  }, timeoutMs);
  pending.set(id, {
    sessionId,
    resolve: result => { clearTimeout(timer); resolve(result); },
    reject: () => { clearTimeout(timer); reject(failure('BROWSER_PROTOCOL_FAILED')); },
  });
  try { socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }
  catch { pending.get(id).reject(); pending.delete(id); }
});
const cleanup = () => cleanupPromise || (cleanupPromise = (async () => {
  try {
    if (alive()) {
      await cdp('Browser.close', {}, undefined, 3000).catch(() => {});
      for (let i = 0; i < 30 && alive(); i++) await sleep(100);
      if (alive()) browser.kill('SIGTERM');
      for (let i = 0; i < 30 && alive(); i++) await sleep(100);
      if (alive()) browser.kill('SIGKILL');
      for (let i = 0; i < 30 && alive(); i++) await sleep(100);
      if (alive()) throw failure('BROWSER_SHUTDOWN_TIMEOUT');
    }
    report.shutdown_clean = browser?.exitCode === 0 && !browser?.signalCode;
    if (report.passed && !report.shutdown_clean) throw failure('BROWSER_SHUTDOWN_UNCLEAN');
  } catch (error) {
    report.cleanup_error = true; report.passed = false;
    report.failure_code ||= error.code || 'BROWSER_CLEANUP_FAILED';
    process.exitCode = 1;
  }
  socket?.close();
  for (const call of pending.values()) call.reject();
  pending.clear();
  for (const connection of connections) connection.destroy();
  try {
    for (const listener of [server, proxy]) if (listener?.listening) {
      await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    }
    if (profile && !alive()) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    report.profile_removed = !profile || !fs.existsSync(profile);
    if (!report.profile_removed) throw failure('BROWSER_PROFILE_CLEANUP_FAILED');
  } catch {
    report.cleanup_error = true; report.passed = false; process.exitCode = 1;
  }
})());
const printReport = () => {
  if (printed) return;
  printed = true;
  console.log(JSON.stringify(report));
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  report.passed = false; report.interrupted = true; report.failed_stage = stage;
  report.failure_code = 'TEST_INTERRUPTED'; process.exitCode = 1;
  await cleanup(); printReport(); process.exit(1);
});

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
    server.on('connection', track);
    await listen(server);
    const origin = `http://127.0.0.1:${server.address().port}`;
    // Never borrow a fixed port which another local program might own. The
    // proxy has no forwarding destination and stores no request bytes.
    proxy = net.createServer(connection => { track(connection); connection.destroy(); });
    await listen(proxy);
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'syrius-open-tabs-'));
    fs.chmodSync(profile, 0o700);
    browser = spawn(executable, [
      ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
      '--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile,
      '--enable-unsafe-extension-debugging', '--proxy-server=http://127.0.0.1:' + proxy.address().port,
      // Remove implicit localhost bypasses, then allow only this HTTP origin.
      '--proxy-bypass-list=<-loopback>;' + origin,
      '--no-first-run', '--no-default-browser-check', '--disable-quic', '--disable-sync',
      '--disable-background-networking', '--disable-component-update', 'about:blank'],
    { stdio: 'ignore' });
    let launchFailed = false;
    browser.on('error', () => { launchFailed = true; });
    let port;
    for (let i = 0; i < 300 && !port; i++) {
      if (launchFailed || !alive()) throw failure('BROWSER_LAUNCH_FAILED');
      try { port = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); }
      catch { /* Chrome may still be writing the endpoint file. */ }
      if (!Number.isInteger(port) || port <= 0) { port = undefined; await sleep(50); }
    }
    if (!Number.isInteger(port) || port <= 0) throw failure('BROWSER_ENDPOINT_UNAVAILABLE');
    const version = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(5000) })
      .then(response => response.json()).catch(() => { throw failure('BROWSER_ENDPOINT_UNAVAILABLE'); });
    if (!version.webSocketDebuggerUrl?.startsWith('ws://127.0.0.1:')) throw failure('BROWSER_ENDPOINT_INVALID');
    report.browser = version.Browser;
    socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(failure('BROWSER_CONNECTION_TIMEOUT')), 5000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(failure('BROWSER_CONNECTION_FAILED')); };
    });
    socket.onclose = () => {
      for (const call of pending.values()) call.reject();
      pending.clear();
    };
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); }
      catch {
        for (const call of pending.values()) call.reject();
        pending.clear(); socket.close(); return;
      }
      const waiting = pending.get(message.id);
      if (waiting) {
        pending.delete(message.id);
        message.error ? waiting.reject() : waiting.resolve(message.result);
      } else if (['Target.detachedFromTarget', 'Inspector.targetCrashed', 'Inspector.detached'].includes(message.method)) {
        // On a developer reload Chrome can retire the worker's process via
        // Inspector while keeping its old Target listed. It cannot answer.
        const sessionId = message.method === 'Target.detachedFromTarget' ? message.params.sessionId : message.sessionId;
        if (typeof sessionId !== 'string') return;
        detached.add(sessionId);
        for (const [id, call] of pending) {
          if (call.sessionId !== sessionId) continue;
          pending.delete(id); call.reject();
        }
      } else if (['Runtime.executionContextsCleared', 'Runtime.executionContextDestroyed'].includes(message.method)) {
        contextGenerations.set(message.sessionId, (contextGenerations.get(message.sessionId) || 0) + 1);
      }
    };
    const open = async url => {
      const { targetId } = await cdp('Target.createTarget', { url });
      const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
      return { targetId, sessionId };
    };
    const evaluate = async (tab, expression, timeoutMs = 15000) => {
      const { result, exceptionDetails } = await cdp('Runtime.evaluate',
        { expression: `(async () => (${expression}))()`, awaitPromise: true, returnByValue: true }, tab.sessionId, timeoutMs);
      if (exceptionDetails) throw failure('BROWSER_EVALUATION_FAILED');
      return result.value;
    };
    const until = async (tab, expression, _label, ms = 10000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        try { if (await evaluate(tab, expression, Math.max(1, Math.min(15000, deadline - Date.now())))) return; }
        catch (error) {
          if (!['BROWSER_PROTOCOL_FAILED', 'BROWSER_EVALUATION_FAILED'].includes(error.code)) throw error;
        }
        await sleep(Math.max(0, Math.min(100, deadline - Date.now())));
      }
      throw failure('BROWSER_CONDITION_TIMEOUT');
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

    // Enable Chrome's normal developer reload in this owned profile.
    stage = 'owned developer profile';
    const settings = await open('chrome://extensions/');
    await until(settings, 'Boolean(chrome.developerPrivate)', 'developer profile');
    assert(await evaluate(settings, 'new Promise(resolve=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true},()=>resolve(!chrome.runtime.lastError)))'));
    report.developer_mode_enabled = await evaluate(settings,
      'new Promise(resolve=>chrome.developerPrivate.getProfileConfiguration(config=>resolve(config.inDeveloperMode)))') === true;
    assert(report.developer_mode_enabled);
    await cdp('Target.closeTarget', { targetId: settings.targetId });

    stage = 'pages open before install';
    const early = await open(origin + '/top');
    const taken = await open(origin + '/taken');
    await until(early, 'document.querySelector("iframe")?.contentDocument?.readyState==="complete"', 'frame loaded');
    assert.equal(await evaluate(early, 'typeof window.zenon'), 'undefined');
    await evaluate(early, countReplies);
    await evaluate(early, `(()=>{const f=document.querySelector("iframe").contentWindow;f.eval(${jsLiteral(countReplies)});return true})()`);

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
    const tabId = await evaluate(worker, `(await chrome.tabs.query({url:${jsLiteral(origin + '/top')}}))[0].id`);
    const files = await evaluate(worker, 'chrome.runtime.getManifest().content_scripts.map(entry=>({js:entry.js,world:entry.world||"ISOLATED"}))');
    for (const entry of files) {
      await evaluate(worker, `chrome.scripting.executeScript({target:{tabId:${jsLiteral(tabId)}},files:${jsLiteral(entry.js)},world:${jsLiteral(entry.world)}}).then(()=>true)`);
    }
    await oneRoundTrip(early);
    cases.push('a second injection neither doubles the relay nor replaces the provider');

    stage = 'new page after install';
    const fresh = await open(origin + '/top');
    await until(fresh, 'typeof window.zenon?.sendAccountBlock==="function"', 'provider in a new page');
    await evaluate(fresh, countReplies);
    await oneRoundTrip(fresh);
    cases.push('a page loaded after install still gets exactly one relay');

    stage = 'developer reload';
    await evaluate(early, 'window.__before=window.zenon,true');
    await cdp('Runtime.enable', {}, worker.sessionId);
    const generation = contextGenerations.get(worker.sessionId) || 0;
    // CDP-only registrations are ephemeral. Exercise Chrome's developer
    // reload, requiring both its callback and loss of the old worker context.
    const reloadPage = await open('chrome://extensions/');
    await until(reloadPage, 'Boolean(chrome.developerPrivate)', 'developer reload');
    assert(await evaluate(reloadPage, 'new Promise(resolve=>chrome.developerPrivate.reload(' + jsLiteral(id) +
      ',{failQuietly:true,populateErrorForUnpacked:true},result=>resolve(!chrome.runtime.lastError&&!result)))'));
    const deadline = Date.now() + 10000;
    const invalidated = () => detached.has(worker.sessionId) || (contextGenerations.get(worker.sessionId) || 0) > generation;
    while (!invalidated() && Date.now() < deadline) await sleep(50);
    if (!invalidated()) throw failure('BROWSER_RELOAD_NOT_OBSERVED');
    const installs = (await cdp('Extensions.getExtensions')).extensions.filter(entry => entry.id === id);
    assert.equal(installs.length, 1); assert.equal(installs[0].enabled, true);
    report.reload_observed = true;
    await cdp('Target.closeTarget', { targetId: reloadPage.targetId });
    assert.equal(await evaluate(early, 'window.zenon===window.__before'), true, 'The provider is not replaced on reload');
    cases.push('a verified developer reload leaves an existing provider in place');

    report.passed = true;
  } catch (error) {
    report.failed_stage = stage; report.failure_code = error.code || 'TEST_ASSERTION_FAILED';
    if (error.method) report.failure_method = error.method;
    process.exitCode = 1;
  } finally {
    await cleanup();
    printReport();
  }
})();
