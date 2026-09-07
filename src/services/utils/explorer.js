import { mainnetChainId } from './chainId';
import { getSettings } from './storage';

// Where a transaction goes when you press the link on it.
//
// It used to be `https://explorer.zenon.network/transaction/<hash>`, hard-coded,
// for every chain — so on a devnet or a testnet every row in the history linked
// to a page that does not exist, and there was no way to change it.

const explorers = {
  zenonhub: {
    label: 'zenonhub.io',
    base: 'https://zenonhub.io/explorer',
    transaction: (base, hash) => `${base}/transaction/${hash}`,
    account: (base, address) => `${base}/account/${address}`,
  },
  zenonNetwork: {
    label: 'explorer.zenon.network',
    base: 'https://explorer.zenon.network',
    transaction: (base, hash) => `${base}/transaction/${hash}`,
    account: (base, address) => `${base}/account/${address}`,
  },
};

const defaultExplorer = 'zenonhub';

const explorerChoices = Object.entries(explorers).map(([key, entry]) => ({
  key,
  label: entry.label,
}));

const current = () => explorers[getSettings().explorer] || explorers[defaultExplorer];

// A public explorer only indexes mainnet, so on any other chain there is
// nothing to link to. Returning null is the signal to leave the control out
// rather than render a link that goes nowhere.
const isExplorable = (chainId) => Number(chainId) === mainnetChainId;

const transactionUrl = (hash, chainId) => {
  if (!hash || !isExplorable(chainId)) {
    return null;
  }
  const explorer = current();
  return explorer.transaction(explorer.base, hash);
};

// The name of the explorer the links currently point at, so a control can say
// where it goes instead of leaving the user to guess and click to find out.
const currentExplorerLabel = () => current().label;

const accountUrl = (address, chainId) => {
  if (!address || !isExplorable(chainId)) {
    return null;
  }
  const explorer = current();
  return explorer.account(explorer.base, address);
};

export {
  transactionUrl,
  accountUrl,
  currentExplorerLabel,
  isExplorable,
  explorerChoices,
  defaultExplorer,
  explorers,
};
