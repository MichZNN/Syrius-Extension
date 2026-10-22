'use strict';
// A value written into JavaScript that a fixture builds and runs (a CDP
// Runtime.evaluate, a bundled worker). JSON.stringify alone leaves `<`, `>`
// and `/`, which can close a <script> the code later sits in, and U+2028 and
// U+2029, which end a line for a pre-ES2019 parser. All of them occur only
// inside JSON string tokens, so the escapes keep the value exactly as it was.
// Code scanning flagged the bare form (js/bad-code-sanitization).
const escapes = { '<': '\\u003C', '>': '\\u003E', '/': '\\u002F', '\u2028': '\\u2028', '\u2029': '\\u2029' };

// An undefined argument stays `undefined`, as `${JSON.stringify(value)}` wrote it.
const jsLiteral = (value) => {
  const json = JSON.stringify(value);
  return json === undefined ? 'undefined' : json.replace(/[<>/\u2028\u2029]/g, (character) => escapes[character]);
};

module.exports = { jsLiteral };
