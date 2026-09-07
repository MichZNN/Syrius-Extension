/**
 * Bridge origins are duplicated in manifest.json because Chromium manifests
 * are static JSON. Runtime checks provide defense in depth for page messages.
 */
export const BRIDGE_ORIGINS = new Set([
  'https://nom-bridge.0x3639.com',
  'https://bridge.bagswap.com',
  'https://staging.bridge.bagswap.com',
  'https://bridge.0x3639.com',
  'https://staging.bridge.0x3639.com',
  'https://bridge.mainnet.zenon.community',
  // Retained for the future testnet bridge requested by the project owner.
  'http://testnet.bridge.0x3639.com',
]);

export const isAllowedBridgeUrl = (url) => {
  if (typeof url !== 'string') {
    return false;
  }

  try {
    return BRIDGE_ORIGINS.has(new URL(url).origin);
  } catch {
    return false;
  }
};
