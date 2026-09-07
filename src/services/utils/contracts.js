/**
 * Identify Zenon's embedded contracts from their canonical address prefix.
 *
 * The SDK exposes only a subset of embedded-contract addresses. Zenon's
 * bech32 contract addresses encode the contract name after `z1qxemdeddedx`,
 * so the dashboard can recognise newer contracts without maintaining another
 * list of opaque addresses.
 */
const EMBEDDED_PREFIX = 'z1qxemdeddedx';
const CONTRACT_SPELLINGS = Object.freeze({
  pyllar: 'pillar',
  sentynel: 'sentinel',
  lyquydyty: 'liquidity',
  t0ken: 'token',
  sp0rk: 'spork',
  accelerat0r: 'accelerator',
  drydge: 'bridge',
  htlc: 'htlc',
});

/** Return an embedded contract name, or null for a normal account address. */
export const embeddedContractName = (address) => {
  const text = typeof address?.toString === 'function' ? address.toString() : '';

  if (!text.startsWith(EMBEDDED_PREFIX) || text.length > 128) {
    return null;
  }

  const [encodedName] = text.slice(EMBEDDED_PREFIX.length).split(/x{2,}/);
  if (!encodedName) {
    return null;
  }

  return CONTRACT_SPELLINGS[encodedName] || encodedName;
};

export const isEmbeddedContract = (address) => embeddedContractName(address) !== null;

export const contractDisplayName = (contract) => {
  if (!contract) {
    return '';
  }

  const displayNames = {
    htlc: 'Swap',
    pillar: 'Pillar',
    spork: 'Spork',
  };

  return displayNames[contract]
    || `${contract.charAt(0).toUpperCase()}${contract.slice(1)}`;
};
