// What a syrius:// link means: a screen to open with its form filled in, or a
// request from another app to be approved like a site's.
//
// The links are desktop Syrius's (syrius/lib/widgets/main_app_container.dart):
// the action is the host and its arguments are the query, so one link works in
// either wallet.
//
//   syrius://transfer?address=z1…&amount=1.5&zts=znn     Send
//   syrius://stake?amount=100&duration=3                 Stake, months
//   syrius://delegate?pillar=Name                        Delegate, asks first
//   syrius://fuse?address=z1…&amount=10                  Plasma
//   syrius://sentinel   syrius://pillar
//
// and the screens desktop Syrius has no link for: receive, tokens, plasma,
// az, rewards, settings, sign-message?message=…, home.
//
// A link only opens a screen and fills it in. Nothing is sent until the person
// presses the screen's own button, which is what desktop Syrius's "Are you
// sure?" amounts to. Each argument is named here, and anything else is dropped.
//
// syrius://request is another app asking for a signature
// (src/platform/appRequests.js):
//
//   syrius://request?method=znn_signAndSendBlock&params=<JSON or base64url
//     JSON>&id=<correlation>&callback=<https, private-host http or app-scheme URL>
//
// and the answer goes to the callback, as `id` and `result` or `error`.

const screens = {
  transfer: { path: '/tabs/dashboard/send', args: ['address', 'amount', 'zts'] },
  send: { path: '/tabs/dashboard/send', args: ['address', 'amount', 'zts'] },
  receive: { path: '/tabs/dashboard/receive', args: [] },
  stake: { path: '/tabs/stake', args: ['amount', 'duration'] },
  delegate: { path: '/tabs/delegate', args: ['pillar'] },
  fuse: { path: '/tabs/plasma', args: ['address', 'amount'] },
  plasma: { path: '/tabs/plasma', args: ['address', 'amount'] },
  sentinel: { path: '/tabs/sentinel', args: [] },
  pillar: { path: '/tabs/pillar', args: [] },
  tokens: { path: '/tabs/tokens', args: [] },
  az: { path: '/tabs/az', args: [] },
  rewards: { path: '/tabs/rewards', args: [] },
  settings: { path: '/tabs/settings', args: [] },
  'sign-message': { path: '/tabs/settings/sign-message', args: ['message'] },
  home: { path: '/tabs/dashboard', args: [] },
  dashboard: { path: '/tabs/dashboard', args: [] },
};

// The methods a site may ask for (Background/index.js providerMethods) that
// need a person's answer, and the reads that come with being connected.
const requestMethods = ['znn_connect', 'znn_sendTransaction', 'znn_signAndSendBlock', 'znn_sign',
  'znn_accounts', 'znn_chainId', 'znn_nodeUrl'];

const maxArg = { message: 8192 };
const argLimit = 256;

// Schemes a callback may not use: they would run or read something here
// rather than hand the answer to another app. http is allowed only to a
// private host (below).
// eslint-disable-next-line no-script-url
const refusedSchemes = ['javascript:', 'data:', 'file:', 'content:', 'intent:', 'blob:', 'about:',
  'syrius:', 'ws:', 'wss:', 'ftp:', 'chrome:', 'chrome-extension:'];

// A page served from this phone or the local network, such as the link test
// page in tools/app-links, has no certificate. On the open internet plain http
// would let anyone on the path read the answer, so http stops at private
// addresses. URL has already normalised the host (0x7f.1 is 127.0.0.1).
const privateHost = (hostname) => {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) return true;
  if (hostname === '[::1]') return true;
  const ip = hostname.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

// The requester's name for consent: https (and http to a private host) keeps
// its origin; an app scheme is `scheme://host`, which is what the approval
// screen shows.
const callbackOrigin = (callback) => {
  let url;
  try { url = new URL(callback); } catch (error) { return null; }
  const scheme = url.protocol.toLowerCase();
  if (refusedSchemes.includes(scheme) || !/^[a-z][a-z0-9+.-]*:$/.test(scheme)) return null;
  if (scheme === 'https:') return url.host ? url.origin : null;
  if (scheme === 'http:') return privateHost(url.hostname) ? url.origin : null;
  return `${scheme}//${url.host.toLowerCase()}`;
};

const base64url = {
  decode: (text) => {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
    return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
  },
  encode: (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
};

// `params` as JSON, or as base64url JSON (the form that survives every
// app's link handling).
const decodeParams = (raw) => {
  if (raw == null || raw === '') return {};
  const text = /^\s*[[{"]/.test(raw) ? raw : base64url.decode(raw);
  return JSON.parse(text);
};

const parseLink = (raw) => {
  let url;
  try { url = new URL(String(raw)); } catch (error) { return null; }
  if (url.protocol !== 'syrius:') return null;
  // syrius://transfer?… puts the action in the host; syrius:transfer?… and
  // Windows' syrius://transfer/?… (desktop Syrius strips the slash) in the path.
  const action = (url.host || url.pathname.replace(/^\/+/, '')).replace(/\/+$/, '').toLowerCase();
  const query = url.searchParams;

  if (action === 'request') {
    const method = query.get('method');
    const callback = query.get('callback');
    const origin = callbackOrigin(callback);
    if (!requestMethods.includes(method) || !origin) return null;
    let params;
    try { params = decodeParams(query.get('params')); } catch (error) { return null; }
    const id = query.get('id');
    return {
      kind: 'request', method, params, callback, origin,
      id: id && id.length <= 128 ? id : `syrius-${Date.now()}`,
    };
  }

  const screen = Object.hasOwn(screens, action) ? screens[action] : null;
  if (!screen) return null;
  const search = new URLSearchParams();
  for (const name of screen.args) {
    const value = query.get(name);
    if (value && value.length <= (maxArg[name] || argLimit)) search.set(name, value);
  }
  const text = search.toString();
  return { kind: 'screen', path: text ? `${screen.path}?${text}` : screen.path };
};

export { parseLink, callbackOrigin, decodeParams, base64url, screens, requestMethods };
