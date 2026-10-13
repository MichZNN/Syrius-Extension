'use strict';

// Firefox only (webpack.config.js). AMO refuses to parse a script of 5 MiB or
// more, and the SDK ships as one prebundled 5.3 MB module that splitChunks
// cannot divide (issue #44). Four of those megabytes are two string constants:
// the proof-of-work script and its wasm. This loader moves each constant into a
// module of its own, byte for byte, and leaves a require in its place, so the
// vendor split can put them in separate files. Nothing else in the SDK changes.
//
// A constant that cannot be found fails the build: a silent miss would only
// show up later as an oversized file.
const literals = ['stringPow', 'base64Wasm'];

// The end of the string literal that starts at `start`, quote included.
const literalEnd = (source, start) => {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return -1;
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') i++;
    else if (source[i] === quote) return i + 1;
    else if (source[i] === '\n') return -1;
  }
  return -1;
};

const locate = (source, name) => {
  const found = [...source.matchAll(new RegExp(`\\.${name}=void 0,[\\w$]+\\.${name}=`, 'g'))];
  if (found.length !== 1) throw new Error(`sdk-split-loader: expected one ${name} constant in the SDK, found ${found.length}`);
  const start = found[0].index + found[0][0].length;
  const end = literalEnd(source, start);
  if (end < 0) throw new Error(`sdk-split-loader: the ${name} constant is not a plain string literal`);
  return { start, end };
};

module.exports = function sdkSplitLoader(source) {
  this.cacheable?.();
  const wanted = new URLSearchParams(this.resourceQuery || '').get('literal');
  if (wanted) {
    if (!literals.includes(wanted)) throw new Error(`sdk-split-loader: unknown constant ${wanted}`);
    const { start, end } = locate(source, wanted);
    return `module.exports=${source.slice(start, end)};`;
  }
  // Last first, so earlier offsets stay valid.
  const spans = literals.map((name) => ({ name, ...locate(source, name) })).sort((a, b) => b.start - a.start);
  let out = source;
  for (const { name, start, end } of spans) {
    // `!!` keeps the configured rules, this one included, off the part module.
    const request = `!!${__filename}!${this.resourcePath}?literal=${name}`;
    out = `${out.slice(0, start)}require(${JSON.stringify(request)})${out.slice(end)}`;
  }
  return out;
};
module.exports.literals = literals;
