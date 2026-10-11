// Searching for a token id with a chosen prefix or suffix.
//
// A new token's id is the first 10 bytes of SHA3-256 over its IssueToken
// block's hash (go-zenon `types.NewZenonTokenStandard`). The block hash covers
// the nonce, and the node checks the nonce only when the block carries proof
// of work (`verifier/account_block.go` pow()). A block paid for with fused
// plasma therefore has 8 bytes that change the id and nothing else: this tries
// nonces until the id reads as asked.
//
// No imports: the same functions run in the popup, in the search worker (built
// from this file, utils/zts-search-worker.js) and in the tests, each handing
// in its own SHA3-256.

const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const hrp = 'zts';
// Characters after `zts1`: 16 carry the 10 bytes, 6 are the checksum.
const dataLength = 16;
const idLength = 22;
// Each character is one in 32. Six is about a billion tries: minutes on a
// laptop, which is as long as a popup can be asked to stay open.
const patternMax = 6;

const generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const polymod = (values) => {
  let check = 1;
  for (let i = 0; i < values.length; i += 1) {
    const top = check >>> 25;
    check = ((check & 0x1ffffff) << 5) ^ values[i];
    for (let bit = 0; bit < 5; bit += 1) if ((top >>> bit) & 1) check ^= generator[bit];
  }
  return check >>> 0;
};
const hrpValues = [3, 3, 3, 0, 26, 20, 19]; // 'zts' expanded: high bits, 0, low bits

// The 16 five-bit groups of a 10-byte id.
const groups = (bytes) => {
  const out = new Array(dataLength);
  let acc = 0;
  let bits = 0;
  let index = 0;
  for (let i = 0; i < 10; i += 1) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out[index] = (acc >>> bits) & 31;
      index += 1;
    }
  }
  return out;
};

const encode = (bytes) => {
  const data = groups(bytes);
  const check = polymod(hrpValues.concat(data, [0, 0, 0, 0, 0, 0])) ^ 1;
  let text = `${hrp}1`;
  for (let i = 0; i < dataLength; i += 1) text += charset[data[i]];
  for (let i = 0; i < 6; i += 1) text += charset[(check >>> (5 * (5 - i))) & 31];
  return text;
};

// What is wrong with a requested prefix and suffix, or null. Both are read
// after `zts1`, lowercase.
const patternError = (prefix, suffix) => {
  for (const part of [prefix, suffix]) {
    for (const char of part) {
      if (!charset.includes(char)) return `${char} cannot appear in a token id. Use ${charset}.`;
    }
  }
  if (prefix.length + suffix.length > patternMax) return `At most ${patternMax} characters in all.`;
  return null;
};

const normalise = (text) => String(text || '').trim().toLowerCase().replace(/^zts1/, '');

const expectedTries = (prefix, suffix) => 32 ** (prefix.length + suffix.length);

const createSearch = (sha3_256) => {
  const idOf = (blockHash) => encode(sha3_256.array(blockHash).slice(0, 10));

  // Tries `count` nonces from (hi, lo) over `head`, the hashed fields of the
  // block without its nonce. Returns the first match, or how far it got.
  const search = ({ head, prefix, suffix, hi, lo, count }) => {
    const source = new Uint8Array(head.length + 8);
    source.set(head);
    const at = head.length;
    source[at] = (hi >>> 24) & 255;
    source[at + 1] = (hi >>> 16) & 255;
    source[at + 2] = (hi >>> 8) & 255;
    source[at + 3] = hi & 255;
    const wanted = Array.from(prefix, (char) => charset.indexOf(char));
    let nonce = lo >>> 0;
    for (let tried = 0; tried < count; tried += 1, nonce = (nonce + 1) >>> 0) {
      source[at + 4] = (nonce >>> 24) & 255;
      source[at + 5] = (nonce >>> 16) & 255;
      source[at + 6] = (nonce >>> 8) & 255;
      source[at + 7] = nonce & 255;
      const id = sha3_256.array(sha3_256.array(source)).slice(0, 10);
      // The prefix is read off the bytes; the checksum is worked out only
      // for an id that already has it.
      const data = groups(id);
      let ok = true;
      for (let i = 0; i < wanted.length && ok; i += 1) ok = data[i] === wanted[i];
      if (ok) {
        const text = encode(id);
        if (!suffix || text.endsWith(suffix)) {
          const hex = (value) => (value >>> 0).toString(16).padStart(8, '0');
          return { found: true, nonce: hex(hi) + hex(nonce), zts: text, tried: tried + 1 };
        }
      }
    }
    return { found: false, lo: nonce, tried: count };
  };

  return { idOf, search };
};

export {
  charset,
  dataLength,
  idLength,
  patternMax,
  encode,
  patternError,
  normalise,
  expectedTries,
  createSearch,
};
