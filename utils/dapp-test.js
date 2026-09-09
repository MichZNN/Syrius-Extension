// Drives a real web page against the injected provider, end to end:
//   page  ->  window.zenon.connect()
//         ->  content script  ->  service worker  ->  approval window
//   popup ->  approve         ->  worker          ->  page's promise resolves
//
// Run with: node .dev-harness/dapp-test.js
const http = require('http');

const listTargets = () =>
  new Promise((resolve) =>
    http.get('http://localhost:9222/json/list', (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    })
  );

class Session {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
      }
    };
  }

  static async open(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('cannot attach to ' + url));
    });
    return new Session(ws);
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  async evaluate(expression, awaitPromise = true) {
    const out = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (out.result?.exceptionDetails) {
      return { error: out.result.exceptionDetails.exception?.description || 'threw' };
    }
    return { value: out.result?.result?.value };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browserTargets = await listTargets();
  const version = await new Promise((resolve) =>
    http.get('http://localhost:9222/json/version', (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    })
  );
  const browser = await Session.open(version.webSocketDebuggerUrl);

  // Start from no granted origins, so "accounts before connecting" is a real
  // assertion rather than a report of whatever the last run left behind.
  const extensionPage = browserTargets.find(
    (t) => t.type === 'page' && t.url.includes('popup.html')
  );
  if (extensionPage) {
    const popupForReset = await Session.open(extensionPage.webSocketDebuggerUrl);
    await popupForReset.send('Runtime.enable');
    await popupForReset.evaluate(
      "new Promise(r => chrome.runtime.sendMessage({channel:'internal',method:'permissions.revokeAll',params:{}}, () => r(true)))"
    );
    console.log('0. cleared previously connected origins');
  }

  // A page the content scripts are declared to run on.
  const siteUrl = process.env.DAPP_TEST_URL || 'http://localhost:35997/';
  const { result: created } = await browser.send('Target.createTarget', { url: siteUrl });
  const targetId = created.targetId;
  await sleep(1500);

  const fresh = await listTargets();
  const page = fresh.find((t) => t.id === targetId || t.targetId === targetId);
  if (!page) {
    console.log('FAIL: could not find the page target');
    process.exit(1);
  }
  const site = await Session.open(page.webSocketDebuggerUrl);
  await site.send('Runtime.enable');

  console.log('1. provider present:', JSON.stringify(
    (await site.evaluate("(() => ({ hasZenon: typeof window.zenon, isSyrius: window.zenon && window.zenon.isSyriusExtension, version: window.zenon && window.zenon.version, methods: window.zenon ? Object.keys(window.zenon).filter(k => typeof window.zenon[k] === 'function') : [] }))()")).value
  ));

  console.log('2. accounts before connecting (must be []):', JSON.stringify(
    (await site.evaluate('window.zenon.getAccounts()')).value
  ));

  console.log('3. chainId (read-only, no prompt):', JSON.stringify(
    (await site.evaluate('window.zenon.getChainId()')).value
  ));

  // connect() must open an approval window; the promise stays pending until
  // it is answered, so it is kicked off without awaiting.
  await site.evaluate("window.__connectResult = 'pending'; window.zenon.connect().then(a => window.__connectResult = {ok:a}).catch(e => window.__connectResult = {err:e}); 1", false);
  await sleep(2500);

  const afterPrompt = await listTargets();
  const approval = afterPrompt.find(
    (t) => t.type === 'page' && t.url.includes('popup.html') && t.url.includes('site-integration')
  );
  console.log('4. approval window opened:', Boolean(approval), approval ? approval.url.split('/').pop() : '');

  if (!approval) {
    console.log('   (no approval window; connect result =', JSON.stringify((await site.evaluate('window.__connectResult')).value), ')');
    process.exit(1);
  }

  const popup = await Session.open(approval.webSocketDebuggerUrl);
  await popup.send('Runtime.enable');
  await sleep(1200);

  console.log('5. approval screen text:', JSON.stringify(
    (await popup.evaluate("(document.body.innerText||'').replace(/\\n+/g,' | ').slice(0,220)")).value
  ));

  // Press Connect.
  const pressed = await popup.evaluate(
    "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Connect'); if (!b) return 'no button: ' + [...document.querySelectorAll('button')].map(x=>x.textContent.trim()).join(','); b.click(); return 'clicked'; })()"
  );
  console.log('6. pressed:', JSON.stringify(pressed.value || pressed.error));
  await sleep(2500);

  console.log('7. page connect() resolved with:', JSON.stringify(
    (await site.evaluate('window.__connectResult')).value
  ));

  console.log('8. accounts after connecting:', JSON.stringify(
    (await site.evaluate('window.zenon.getAccounts()')).value
  ));

  // A second connect from an origin already granted must not prompt again.
  const before = (await listTargets()).filter((t) => t.url.includes('site-integration')).length;
  const second = await site.evaluate('window.zenon.connect()');
  await sleep(1200);
  const after = (await listTargets()).filter((t) => t.url.includes('site-integration')).length;
  console.log('9. reconnect without a prompt:', JSON.stringify(second.value || second.error), '| extra windows:', after - before);

  // Signing a message. Prompted every time even for a connected origin, so a
  // second approval window has to open and be answered before the page's
  // promise settles.
  await site.evaluate(
    "window.__signResult = 'pending'; window.zenon.signMessage('Sign in to the dapp test at ' + new Date().toISOString()).then(r => window.__signResult = {ok:r}).catch(e => window.__signResult = {err:e}); 1",
    false
  );
  await sleep(2500);

  const signPrompt = (await listTargets()).find(
    (t) => t.type === 'page' && t.url.includes('popup.html') && t.url.includes('site-integration')
  );
  console.log('10. sign approval window opened:', Boolean(signPrompt));

  if (signPrompt) {
    const signPopup = await Session.open(signPrompt.webSocketDebuggerUrl);
    await signPopup.send('Runtime.enable');
    await sleep(1200);

    console.log('11. sign screen text:', JSON.stringify(
      (await signPopup.evaluate("(document.body.innerText||'').replace(/\\n+/g,' | ').slice(0,220)")).value
    ));

    const signPressed = await signPopup.evaluate(
      "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Sign'); if (!b) return 'no button: ' + [...document.querySelectorAll('button')].map(x=>x.textContent.trim()).join(','); b.click(); return 'clicked'; })()"
    );
    console.log('12. pressed:', JSON.stringify(signPressed.value || signPressed.error));
    await sleep(2000);

    // Verified here rather than merely printed: a 64-byte signature and a
    // 32-byte public key, both hex, is the whole contract with the site.
    console.log('13. signMessage() resolved with:', JSON.stringify(
      (await site.evaluate(
        "(() => { const r = window.__signResult; if (!r || !r.ok) return r; return { address: r.ok.address, signatureLength: r.ok.signature.length, publicKeyLength: r.ok.publicKey.length, hex: /^[0-9a-f]+$/.test(r.ok.signature + r.ok.publicKey) }; })()"
      )).value
    ));
  }

  await browser.send('Target.closeTarget', { targetId });
  process.exit(0);
})();
