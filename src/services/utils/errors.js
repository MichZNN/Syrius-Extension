import catalog from './errorCatalog';

// Errors reach the UI from three places and none of them agree on a shape: the
// SDK throws strings, the websocket client throws `{code, message}` from the
// node, and anything else throws an Error. Every page used to end with its own
// copy of a `split("Error: ")` chain that took the last fragment, which turned
// a nested message into a fragment of itself and an object into "[object Object]".
//
// Now every error a person sees has a number from ./errorCatalog.js:
//
//   throw fail(307);                       the wallet's own errors are made here
//   describe(anything) -> { id, code, text, line }   and read here, once
//
// `fail` puts the number on the error as `errorId`. `code` is left alone: it
// is already a JSON-RPC number on errors answered to sites and a string such
// as 'WALLET_LOCKED' on session errors.
//
// What the wallet did not throw (the SDK, a node, a bug) is matched to an
// entry where it can be, and is otherwise the fallback. Its own words go to
// the console, not the screen: a toast once showed a serialised block.

const fallbackId = 100;
const nodeRefused = 300;
const wrongPassword = 200;

const has = (id) => Number.isInteger(id) && Object.hasOwn(catalog, id);
const codeOf = (id) => `E${id}`;

// A run this long is a signature, a block or call data, never something to read.
const hexDump = /(?:0x)?[0-9a-fA-F]{65,}/g;

// One short line. Everything put into a catalogue text goes through this, so
// a parameter cannot bring a second line, a stack or a dump with it.
const brief = (value, max = 160) => {
  if (value === null || value === undefined || typeof value === 'object' || typeof value === 'function') return '';
  const line = String(value).split(/\r?\n/)[0].replace(/\s+/g, ' ').trim()
    .replace(hexDump, (run) => `${run.slice(0, 10)}…${run.slice(-8)}`);
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

// Whether something a node said can be shown as it is: a short sentence, not
// JSON, not a stack frame, not bytes.
const isPlain = (text) =>
  typeof text === 'string' && text.length > 0 && text.length <= 120 &&
  !/[\r\n{}[\]<>]/.test(text) && !/\bat \S+ \(|^\s*at\s/.test(text) && !/[0-9a-fA-F]{33,}/.test(text);

// The catalogue text with its braces filled in. A reason from outside that
// cannot be shown ends the sentence where the reason would have begun.
const fill = (template, params) =>
  template.replace(/\{(\w+)\}/g, (_, key) => brief(params?.[key], key === 'text' ? 240 : 160));

const format = (id, params) => {
  const template = catalog[id];
  const at = template.indexOf('{reason}');
  // Judged whole, before `brief` shortens it: a dump cut to its two ends is
  // still a dump, and the first line of a stack is still a stack.
  const reason = typeof params?.reason === 'string' ? params.reason.trim() : brief(params?.reason);
  if (at < 0 || isPlain(reason)) return fill(template, params);
  if (params?.reason && typeof console !== 'undefined') console.warn(`[${codeOf(id)}]`, params.reason);
  return `${fill(template.slice(0, at), params).replace(/[\s:(]+$/, '')}.`;
};

// An error from the catalogue. `extra` is for the fields other code switches
// on (`code`, `refused`).
const fail = (id, params, extra) => {
  let known = has(id) ? id : fallbackId;
  let message = format(known, params);
  if (!message) {
    known = fallbackId;
    message = catalog[fallbackId];
  }
  const error = new Error(message);
  error.errorId = known;
  return extra ? Object.assign(error, extra) : error;
};

// Entries with nothing to fill in, by their text: an error that crossed a
// message channel arrives as its text alone.
const byText = new Map(
  Object.entries(catalog).filter(([, text]) => !text.includes('{')).map(([id, text]) => [text, Number(id)])
);

// An error that arrived as text from another context of this extension (the
// worker, a search worker). It keeps the number it was sent with, or the one
// its text has; with neither it is uncoded and reads as the fallback.
const relay = (message, errorId) => {
  const text = typeof message === 'string' ? message : '';
  const id = has(errorId) ? errorId : byText.get(text);
  const error = new Error(text);
  if (id) error.errorId = id;
  return error;
};

// What the SDK and a Zenon node say for the failures a person can act on.
const known = [
  { match: /not enough plasma|plasma.*insufficient/i, id: 302 },
  { match: /insufficient balance|not enough balance/i, id: 303 },
  { match: /invalid address|address.*invalid|checksum/i, id: 304 },
  { match: /connection|websocket|socket|ECONNREFUSED|not connected/i, id: 305 },
  { match: /error decrypting|invalid password|unable to decrypt/i, id: wrongPassword },
  { match: /timeout/i, id: 306 },
];

// Pulls the most specific string an unknown throwable is carrying.
const rawMessage = (error) => {
  if (error === null || error === undefined) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || error.toString();
  }
  if (typeof error === 'object') {
    // The websocket client rejects with the node's JSON-RPC error object.
    if (error.message) {
      return typeof error.message === 'string' ? error.message : JSON.stringify(error.message);
    }
    if (error.error) {
      return rawMessage(error.error);
    }
    try {
      return JSON.stringify(error);
    } catch (err) {
      return '';
    }
  }
  return error.toString();
};

// Strips the layers of `Error: Error: ...` the SDK accumulates as it rethrows,
// without the old habit of keeping only the fragment after the last colon —
// that discarded the useful half of any message that contained one.
const stripErrorPrefixes = (text) => {
  let result = text.trim();
  let previous;

  do {
    previous = result;
    result = result.replace(/^(Uncaught\s+)?Error:\s*/i, '').trim();
  } while (result !== previous);

  return result;
};

// A JSON-RPC error object from a Zenon node, as the websocket client rejects
// with it.
const fromNode = (error) =>
  Boolean(error) && typeof error === 'object' && !(error instanceof Error) &&
  Number.isFinite(error.code) && typeof error.message === 'string';

// The number and text for anything thrown. `line` is both, for a place that
// can only hold a string.
const describe = (error) => {
  const entry = (id, text = catalog[id]) => ({ id, code: codeOf(id), text, line: `${text} (${codeOf(id)})` });

  if (error instanceof Error && has(error.errorId)) {
    return entry(error.errorId, brief(error.message, 240) || catalog[error.errorId]);
  }

  const raw = stripErrorPrefixes(rawMessage(error));
  if (byText.has(raw)) return entry(byText.get(raw));

  const match = known.find((candidate) => candidate.match.test(raw));
  let result;
  if (match) result = entry(match.id);
  else if (fromNode(error)) result = entry(nodeRefused, format(nodeRefused, { reason: raw }));
  else result = entry(fallbackId);

  // The detail stays available to whoever opens the console.
  if (raw && typeof console !== 'undefined') console.warn(`[${result.code}]`, error);
  return result;
};

// One line, safe to put on screen, with its number.
const readableError = (error) => describe(error).line;

export { fail, relay, describe, readableError, rawMessage, brief, isPlain, catalog, fallbackId, wrongPassword };
