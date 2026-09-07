import { Constants } from 'znn-ts-sdk';

// Mainnet's chain identifier, as defined in the Genesis configuration file of
// go-zenon. It is what the SDK signs for while nothing else has been stored.
const mainnetChainId = Constants.defaultChainId;

// The chain identifier is serialized into every block before it gets signed, so
// anything that is not a positive whole number is a wallet that cannot transact.
const parseChainId = (input) => {
  const parsed = Number((input + "").trim());

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

const detectionTimeout = 5000;

// The frontier momentum is the cheapest thing a node will name its own chain in.
// The request goes through the raw client instead of `ledger.getFrontierMomentum()`
// because the model parses hashes, buffers and addresses this has no use for, and
// throws when a node leaves any of them out.
// Detection is only ever a suggestion, so a node that cannot answer returns null
// rather than interrupting whatever asked. A socket that was left open on a node
// that has since gone away never answers at all, hence the deadline.
const detectNodeChainId = async (zenon) => {
  try {
    const client = zenon?.ledger?.client;

    if (!client) {
      return null;
    }

    const frontierMomentum = await Promise.race([
      client.sendRequest("ledger.getFrontierMomentum", []),
      new Promise((resolve, reject) => setTimeout(
        () => reject(`Timeout after ${detectionTimeout / 1000} seconds`), detectionTimeout))
    ]);
    return parseChainId(frontierMomentum?.chainIdentifier);
  }
  catch (err) {
    console.error("Could not read the chain identifier from the node ", err);
    return null;
  }
}

export { mainnetChainId, parseChainId, detectNodeChainId };
