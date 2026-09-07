/**
 * Return an explorer URL only for networks with a known, supported explorer.
 * A mainnet link must never be shown for a testnet transaction.
 */
const EXPLORER_TRANSACTION_BASE_URLS = Object.freeze({
  1: 'https://explorer.zenon.network/transaction/',
});

export const getExplorerTransactionUrl = (chainId, hash) => {
  const baseUrl = EXPLORER_TRANSACTION_BASE_URLS[Number(chainId)];

  if (!baseUrl || typeof hash !== 'string' || !/^[A-Za-z0-9_-]+$/.test(hash)) {
    return null;
  }

  return `${baseUrl}${encodeURIComponent(hash)}`;
};
