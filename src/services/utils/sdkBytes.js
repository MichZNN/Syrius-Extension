import { Primitives } from 'znn-ts-sdk';
import { ethers } from 'ethers';

// Bytes as the SDK's own Buffer class. The app bundle has no Buffer (package.json
// maps `buffer` to false), and the SDK's block JSON calls toString('base64') on
// its data, so a Uint8Array will not do. An Address's `core` is one of the
// SDK's Buffers; its constructor is the class.
// Looked up on first use, not at import: modules that only encode never need it.
let sdkBuffer = null;
const SdkBuffer = () => (sdkBuffer ??= Primitives.Address.parse('z1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsggv2f').core.constructor);
const sdkBytes = (bytes) => SdkBuffer().from(ethers.utils.arrayify(bytes || '0x'));

export { sdkBytes };
