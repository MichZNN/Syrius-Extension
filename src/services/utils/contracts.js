// Naming the embedded contracts.
//
// A block sent to an embedded contract was labelled "Sent" with an amount of
// "0" against it, which is what a failed transfer looks like. Three of them —
// plasma, pillar and stake — were recognised by comparing against the SDK's
// exported address constants; the rest were not, because the SDK only exports
// those three.
//
// It does not need to export the others. Every embedded contract address is a
// bech32 encoding of a fixed byte pattern that spells the contract's own name,
// padded with 'x' to the required length:
//
//   z1qxemdeddedxplasmaxxxxxxxxxxxxxxxxsctrp
//   z1qxemdeddedxaccelerat0rxxxxxxxxxxp4tk22
//
// So the name is read out of the address rather than kept in a table of
// hard-coded addresses that would have to be trusted and maintained.

const embeddedPrefix = 'z1qxemdeddedx';

// The pattern has to fit bech32's charset, which has no b, i, o or 1 — hence
// "pyllar" and "accelerat0r". These put the letters back.
const spellings = {
  pyllar: 'pillar',
  sentynel: 'sentinel',
  lyquydyty: 'liquidity',
  t0ken: 'token',
  sp0rk: 'spork',
  accelerat0r: 'accelerator',
  drydge: 'bridge',
  htlc: 'htlc',
};

// Returns the contract's name, or null for an ordinary account.
const embeddedContractName = (address) => {
  const text = (address || '').toString();

  if (!text.startsWith(embeddedPrefix)) {
    return null;
  }
  // The name runs up to the run of padding 'x's before the checksum.
  const [encoded] = text.slice(embeddedPrefix.length).split(/x{2,}/);

  if (!encoded) {
    return null;
  }
  return spellings[encoded] || encoded;
};

const isEmbeddedContract = (address) => embeddedContractName(address) !== null;

const titleCase = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);

export { embeddedContractName, isEmbeddedContract, embeddedPrefix, titleCase };
