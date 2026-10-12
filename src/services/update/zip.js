import { fail } from '../utils/errors';

// Reading a release ZIP, for the self-update (./chromeUpdate.js).
//
// Only what a release built by CI contains: stored or deflated entries, no
// encryption, no ZIP64. Inflating is the browser's own DecompressionStream,
// so no archive library is shipped in a wallet for this. Every entry is
// checked against its CRC-32, and a name that could reach outside the folder
// it is written into (absolute, a drive, `..`, a backslash) refuses the whole
// archive rather than being skipped.

const endOfCentralDirectory = 0x06054b50;
const centralHeader = 0x02014b50;
const localHeader = 0x04034b50;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const refuse = (detail) => fail(129, { detail }, { code: 'UPDATE_ARCHIVE' });

// A relative path of plain segments, or null.
const safeName = (name) => {
  if (!name || name.includes('\\') || name.startsWith('/') || /^[a-zA-Z]:/.test(name) || name.includes('\0')) return null;
  const parts = name.split('/');
  if (parts.some((part) => part === '..' || part === '.')) return null;
  return name;
};

const inflate = async (bytes) => {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

// [{ name, data }] for every file in the archive; directories are left out.
const readZip = async (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at -= 1) {
    if (view.getUint32(at, true) === endOfCentralDirectory) { end = at; break; }
  }
  if (end < 0) throw refuse('no central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = [];
  const seen = new Set();
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== centralHeader) throw refuse('broken central directory');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const rawName = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) throw refuse('encrypted entry');
    if (rawName.endsWith('/')) continue;
    const name = safeName(rawName);
    if (!name) throw refuse(`unsafe name ${JSON.stringify(rawName)}`);
    if (seen.has(name)) throw refuse(`${name} twice`);
    seen.add(name);
    if (offset + 30 > bytes.length || view.getUint32(offset, true) !== localHeader) throw refuse(`${name} has no local header`);
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    if (start + compressedSize > bytes.length) throw refuse(`${name} is cut short`);
    const packed = bytes.subarray(start, start + compressedSize);
    let data;
    if (method === 0) data = packed.slice();
    else if (method === 8) data = await inflate(packed);
    else throw refuse(`${name} uses compression method ${method}`);
    if (data.length !== size || crc32(data) !== crc) throw refuse(`${name} fails its checksum`);
    files.push({ name, data });
  }
  return files;
};

export { readZip, crc32, safeName };
