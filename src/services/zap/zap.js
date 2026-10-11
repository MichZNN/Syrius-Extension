import { Constants, Primitives, Zenon } from 'znn-ts-sdk';
import { ethers } from 'ethers';

import { sdkBytes } from '../utils/sdkBytes';
import { fail } from '../utils/errors';

// Zap: a small gift of ZNN and QSR, with a message, to an address picked at
// random from those that took funds in during the last seven days.
//
// A zap is ordinary send blocks. What makes one a zap is its data: four
// marker bytes, then the message as UTF-8. One block moves one token, so a
// zap of both is two blocks; the first carries the message and the second the
// marker alone, which a receiving wallet reads as "the rest of that zap".
//
// The recipient is an account that published a receive block in the window,
// not merely one that was sent to: a receive proves somebody holds the key,
// and an address nobody can spend from would swallow the gift.
//
// A message is whatever a stranger chose to send. It is decoded strictly,
// cut to one line of printable characters, and only ever rendered as text.
//
// Checked in utils/operator-mode-test.js.

// 'zap', then the format's version.
const marker = [0x7a, 0x61, 0x70, 0x01];
// Bytes of UTF-8. Each costs the sender 68 plasma.
const messageMax = 140;
const defaultMessage = 'You got zapped. Have a great day, alien.';
const defaults = { znn: '1', qsr: '10' };

const windowSeconds = 7 * 24 * 60 * 60;
// Momentums per read, reads in flight together, reads after which one address
// is enough, and how many addresses are plenty.
const span = 500;
const together = 4;
const readsMax = 40;
const plenty = 8;

const userReceive = 3;

const utf8 = (text) => new TextEncoder().encode(text);

// A message is one line. Breaks and tabs become spaces; control characters
// and the ones that hide or reorder the text around them (zero width, bidi
// overrides and isolates, the byte order mark) are dropped. They are given
// as code points so that none of them has to sit in this file.
const breaks = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029];
const dropped = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]];
const clean = (text) =>
  [...String(text)]
    .map((char) => (breaks.includes(char.codePointAt(0)) ? ' ' : char))
    .filter((char) => !dropped.some(([low, high]) => char.codePointAt(0) >= low && char.codePointAt(0) <= high))
    .join('')
    .replace(/ +/g, ' ')
    .trim();

const messageError = (message) => (utf8(clean(message || '')).length > messageMax ? fail(430).message : null);

// The data of a zap block. An empty message gives the marker alone.
const encodeZap = (message = '') => {
  const body = utf8(clean(message));
  if (body.length > messageMax) throw fail(430);
  return Uint8Array.from([...marker, ...body]);
};

// A block's data as bytes: the SDK hands a Buffer, the node's JSON base64.
const bytesOf = (data) => {
  if (!data) return new Uint8Array(0);
  if (typeof data === 'string') {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4) return null;
    try { return ethers.utils.base64.decode(data); } catch (error) { return null; }
  }
  if (data instanceof Uint8Array || Array.isArray(data)) return Uint8Array.from(data);
  return null;
};

// { message } when `data` is a zap's, else null. The message may be empty.
const decodeZap = (data) => {
  const bytes = bytesOf(data);
  if (!bytes || bytes.length < marker.length || bytes.length > marker.length + messageMax) return null;
  if (!marker.every((byte, index) => bytes[index] === byte)) return null;
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(marker.length));
  } catch (error) {
    return null;
  }
  return { message: clean(text) };
};

const isUser = (address) => {
  try { return Primitives.Address.parse(address).core[0] === 0; } catch (error) { return false; }
};

// The accounts that published a receive block in these momentums.
const recipientsIn = (detailed, skip = () => false) => {
  const found = new Set();
  for (const entry of detailed?.list || []) {
    for (const block of entry?.blocks || []) {
      if (block?.blockType !== userReceive) continue;
      const address = String(block.address);
      if (!isUser(address) || skip(address)) continue;
      found.add(address);
    }
  }
  return found;
};

const randomBelow = (n) => {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return Math.floor((value / 2 ** 32) * n);
};

const shuffled = (list, random) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const nodeRequest = (method, params) => Zenon.getSingleton().embedded.pillar.client.sendRequest(method, params);

// The first height whose momentum is no older than `since`, or null when even
// the newest is older.
const heightSince = async (request, since, frontier) => {
  if (frontier.timestamp < since) return null;
  let low = 1;
  let high = frontier.height;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    // eslint-disable-next-line no-await-in-loop
    const momentum = (await request('ledger.getMomentumsByHeight', [middle, 1]))?.list?.[0];
    if (momentum && momentum.timestamp >= since) high = middle;
    else low = middle + 1;
  }
  return low;
};

// One address, uniformly from those found. The week is read in windows taken
// in random order, and reading stops once there are plenty to choose from: a
// busy chain is not walked end to end to give one gift, and a quiet one is. `exclude` is the
// wallet's own addresses.
const findAlien = async ({ exclude = [], now = Date.now(), request = nodeRequest, random = randomBelow } = {}) => {
  const mine = new Set(exclude.map(String));
  const frontier = await request('ledger.getFrontierMomentum', []);
  if (!frontier || !Number.isInteger(frontier.height)) throw fail(431);
  const start = await heightSince(request, Math.floor(now / 1000) - windowSeconds, frontier);
  if (start === null) throw fail(431);

  const windows = [];
  for (let height = start; height <= frontier.height; height += span) windows.push(height);
  const order = shuffled(windows, random);
  const found = new Set();
  let reads = 0;
  // Several windows at a time. Reading goes on past `readsMax` only while
  // nothing has been found: a quiet week is read to its end before it is
  // called empty.
  while (reads < order.length && found.size < plenty && (reads < readsMax || !found.size)) {
    const batch = order.slice(reads, reads + together);
    reads += batch.length;
    // eslint-disable-next-line no-await-in-loop
    const replies = await Promise.all(batch.map((height) =>
      request('ledger.getDetailedMomentumsByHeight', [height, Math.min(span, frontier.height - height + 1)])));
    for (const detailed of replies) {
      for (const address of recipientsIn(detailed, (candidate) => mine.has(candidate))) found.add(address);
    }
  }
  if (!found.size) throw fail(431);
  const list = [...found].sort();
  return { address: list[random(list.length)], among: list.length, searched: reads, windows: windows.length };
};

const coins = [
  { key: 'znn', symbol: 'ZNN', zts: () => Constants.znnZts },
  { key: 'qsr', symbol: 'QSR', zts: () => Constants.qsrZts },
];

// The send blocks of one zap, in order. `amounts` are base units as strings;
// a zero leaves that coin out.
const blocksFor = ({ to, amounts, message }) => {
  if (!isUser(to)) throw fail(311);
  const parts = coins
    .map((coin) => ({ ...coin, amount: ethers.BigNumber.from(amounts?.[coin.key] || '0') }))
    .filter((part) => part.amount.gt(0));
  if (!parts.length) throw fail(432);
  const text = clean(message || '') || defaultMessage;
  return parts.map((part, index) => ({
    symbol: part.symbol,
    amount: part.amount.toString(),
    // The SDK names its send-with-data `callContract`; it is the same user
    // send block, to a person here.
    template: Primitives.AccountBlockTemplate.callContract(
      Primitives.Address.parse(to),
      part.zts(),
      part.amount,
      sdkBytes(encodeZap(index === 0 ? text : ''))
    ),
  }));
};

// Which zaps this address has already been shown, so each celebrates once.
// The first look at an address shows nothing: its history is not news.
const seenKey = 'zapsSeen';
const seenMax = 200;
const readSeen = () => {
  try {
    const value = JSON.parse(localStorage.getItem(seenKey) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    return {};
  }
};

// Records `hashes` as seen for `address` and returns the ones that were new.
const takeNew = (address, hashes) => {
  if (!address || !hashes.length) return [];
  const all = readSeen();
  const known = Array.isArray(all[address]) ? all[address].filter((hash) => typeof hash === 'string') : null;
  const fresh = known ? hashes.filter((hash) => !known.includes(hash)) : [];
  if (known && !fresh.length) return [];
  all[address] = [...fresh, ...(known || hashes)].slice(0, seenMax);
  try { localStorage.setItem(seenKey, JSON.stringify(all)); } catch (error) { return []; }
  return fresh;
};

export {
  marker,
  messageMax,
  defaultMessage,
  defaults,
  windowSeconds,
  span,
  readsMax,
  plenty,
  clean,
  messageError,
  encodeZap,
  decodeZap,
  isUser,
  recipientsIn,
  heightSince,
  findAlien,
  blocksFor,
  takeNew,
};
