'use strict';

// Inert first-instruction requests only. No SDK, wallet, node or public origin.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { startBrowser } = require('./fixtures/production-browser');

const report = { service_worker_startup: true, cases: [], network: [], passed: false };
let temporary, browser, listener, stage = 'owned fixture setup';
const connections = new Set();
let httpRequests = 0, webSocketHandshakes = 0;
const stop = async () => {
  if (!browser) return;
  const current = browser;
  browser = null;
  try { await current.stop(); }
  finally { report.network.push({ ...current.stats }); }
};
const cleanup = async () => {
  let failure;
  try { await stop(); } catch (error) { failure = error; }
  for (const connection of connections) connection.destroy();
  try {
    if (listener?.listening) await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  } catch (error) { failure ||= error; }
  try { if (temporary) fs.rmSync(temporary, { recursive: true, force: true }); }
  catch (error) { failure ||= error; }
  report.fixture_removed = !temporary || !fs.existsSync(temporary);
  if (failure) throw failure;
};

(async () => {
  try {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'syrius-service-worker-guard-'));
    fs.chmodSync(temporary, 0o700);
    listener = http.createServer((_request, response) => { httpRequests++; response.end('owned'); });
    listener.on('connection', connection => { connections.add(connection); connection.on('close', () => connections.delete(connection)); });
    listener.on('upgrade', (request, socket) => {
      webSocketHandshakes++;
      const accept = crypto.createHash('sha1').update(String(request.headers['sec-websocket-key']) +
        '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    });
    await new Promise((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', resolve);
    });
    const port = listener.address().port;
    for (const type of ['classic', 'module']) {
      const extensionDir = path.join(temporary, type), profileDir = path.join(temporary, type + '-profile');
      fs.mkdirSync(extensionDir);
      fs.writeFileSync(path.join(extensionDir, 'manifest.json'), JSON.stringify({ manifest_version: 3,
        name: 'Owned service worker startup guard', version: '1.0', permissions: ['storage'],
        host_permissions: ['http://127.0.0.1/*'], background: { service_worker: 'background.js', ...(type === 'module' ? { type } : {}) } }));
      fs.writeFileSync(path.join(extensionDir, 'popup.html'), '<!doctype html><title>Owned service worker startup guard</title>');
      fs.writeFileSync(path.join(extensionDir, 'background.js'), `
        const attempt = () => {
          const httpResult = fetch('http://127.0.0.1:${port}/owned', {signal:AbortSignal.timeout(2000)}).then(() => false, () => true);
          const socketResult = new Promise(resolve => {
            let done = false; const socket = new WebSocket('ws://127.0.0.1:${port}/owned');
            const finish = result => {if(done)return;done=true;clearTimeout(timer);socket.close();resolve(result);};
            const timer = setTimeout(() => finish(false), 2000);
            socket.onopen = () => finish(false); socket.onerror = () => finish(true);
          });
          return Promise.all([httpResult, socketResult]).then(([httpBlocked, webSocketBlocked]) =>
            chrome.storage.local.set({startupGuard:{httpBlocked,webSocketBlocked}}));
        };
        chrome.runtime.onMessage.addListener((message, _sender, respond) => {
          if (message.ownedGuardRepeat) { attempt().then(() => respond(true)); return true; }
          respond(true); return false;
        });
        attempt();
      `);
      const check = async (label) => {
        const page = await browser.openPage();
        // MV3 workers are event-driven. Wake the retained registration after
        // restart instead of assuming Chrome starts an idle worker by itself.
        await browser.evaluate(page, '(()=>{chrome.runtime.sendMessage({ownedGuardWake:true}).catch(()=>{});return true;})()');
        await browser.until(page, '(async()=>Boolean((await chrome.storage.local.get("startupGuard")).startupGuard))()', 'owned startup result', 15000);
        const result = await browser.evaluate(page, '(async()=>(await chrome.storage.local.get("startupGuard")).startupGuard)()');
        assert(result.httpBlocked && result.webSocketBlocked, 'Startup requests must both be refused');
        assert.equal(browser.stats.guardFailure, null);
        assert.equal(httpRequests, 0); assert.equal(webSocketHandshakes, 0);
        // Repeat after all debugger sessions have attached. Multiple sessions
        // for one worker must not break request interception or its ownership.
        await browser.evaluate(page, 'chrome.storage.local.remove("startupGuard")');
        await browser.evaluate(page, '(()=>{chrome.runtime.sendMessage({ownedGuardRepeat:true}).catch(()=>{});return true;})()');
        await browser.until(page, '(async()=>Boolean((await chrome.storage.local.get("startupGuard")).startupGuard))()', 'owned repeated result', 15000);
        const repeated = await browser.evaluate(page, '(async()=>(await chrome.storage.local.get("startupGuard")).startupGuard)()');
        assert(repeated.httpBlocked && repeated.webSocketBlocked);
        assert.equal(browser.stats.guardFailure, null);
        assert.equal(httpRequests, 0); assert.equal(webSocketHandshakes, 0);
        report.cases.push({ name: type + ' ' + label, passed: true });
        return page;
      };
      stage = type + ' cold startup';
      browser = await startBrowser({ extensionDir, profileDir });
      report.browser = browser.browserVersion;
      const id = browser.id;
      const page = await check('startup');
      await browser.evaluate(page, 'chrome.storage.local.remove("startupGuard")');
      stage = type + ' runtime reload';
      await browser.reloadExtension();
      const reloadedPage = await check('runtime reload');
      await browser.evaluate(reloadedPage, 'chrome.storage.local.remove("startupGuard")');
      await stop();
      stage = type + ' browser restart';
      browser = await startBrowser({ extensionDir, profileDir });
      assert.equal(browser.id, id);
      assert.equal(browser.stats.persistentInstallReused, true);
      await check('browser restart');
      await stop();
    }
    assert(report.network.every(stats => stats.externalResponses === 0 && stats.externalWebSocketHandshakes === 0 &&
      stats.guardFailure === null && stats.guardChecks.http && stats.guardChecks.webSocket && stats.shutdownClean));
    report.passed = true;
  } catch (error) {
    report.failed_stage = stage;
    report.failure_code = error.code || 'ASSERTION_FAILED';
    if (error.method) report.failure_method = error.method;
    if (error.guardFailure) report.startup_guard_failure = error.guardFailure;
    if (error.guardChecks) report.startup_guard_checks = error.guardChecks;
    report.passed = false;
    process.exitCode = 1;
  } finally {
    try { await cleanup(); } catch { report.cleanup_error = true; report.passed = false; process.exitCode = 1; }
    report.listener_http_requests = httpRequests;
    report.listener_websocket_handshakes = webSocketHandshakes;
    console.log(JSON.stringify(report));
  }
})();
