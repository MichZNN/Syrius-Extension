import { Constants, Primitives, Zenon } from 'znn-ts-sdk';
import { ethers } from 'ethers';

import { sdkBytes } from '../utils/sdkBytes';
import { encodeCall } from '../pillar/encode';

// Sporks: named switches in the spork contract that turn on protocol features
// at a momentum height. Anyone can read them; only a chain's spork
// administrators can create or activate one, and the contract refuses anybody
// else (go-zenon `vm/embedded/implementation/spork.go`).
//
// The node does not say who the administrators are. They are the genesis
// spork address of each chain, which the wallet knows for the chains it ships
// presets for, and on mainnet also the community spork address while its
// height window is open. On any other chain the screen only reads.
//
// Rules and limits from go-zenon `vm/constants/embedded.go`; the community
// windows from `vm/embedded/definition/spork.go` (release/0.0.9, PR #101) and
// zenon-docs `protocol/facts/mainnet.md`. Checked in utils/pillar-mode-test.js.

const sporkAddress = 'z1qxemdeddedxsp0rkxxxxxxxxxxxxxxxx956u48';

const nameMin = 5;
const nameMax = 40;
const descriptionMax = 400;
// Momentums between activation and enforcement (SporkMinHeightDelay).
const enforcementDelay = 6;

const communityAddress = 'z1qqvwzz2xq7q5gwk6uhcddgrpxlfcyzc8rsu82s';
// [start, end) heights in which the community address may act on mainnet.
// The first closed on 2026-04-16; the second opens about 2026-11-03.
const communityWindows = [
  [10109240, 13243712],
  [14567887, 19791986],
];

// Genesis spork address by chain identifier.
const genesisAdmins = {
  1: 'z1qpxswrfnlll355wrx868xh58j7e2gu2n2u5czv', // go-zenon chain/genesis/embedded_genesis_string.go
  69: 'z1qq9n7fpaqd8lpcljandzmx4xtku9w4ftwyg0mq', // devnet.zenon.foo's genesis
};

// Whether `address` may create and activate sporks on this chain at `height`,
// and as what: 'genesis', 'community', or null.
const sporkRole = ({ address, chainIdentifier, height }) => {
  if (!address) return null;
  if (genesisAdmins[Number(chainIdentifier)] === address) return 'genesis';
  if (Number(chainIdentifier) === 1 && address === communityAddress) {
    const at = Number(height);
    if (communityWindows.some(([start, end]) => at >= start && at < end)) return 'community';
  }
  return null;
};

// The spork ids a released znnd acts on (go-zenon `common/types/spork.go`,
// ImplementedSporksMap).
//
// A node exits when an activated spork outside its own list reaches its
// enforcement height (`chain/momentum_pool.go`, "Detected an unimplemented
// spork"), it exits again on every restart, and nothing deactivates a spork.
// So activating any other id stops the chain until every node runs a build
// that lists it. A test spork activated from this wallet halted the devnet at
// momentum 242,818 on 2026-10-11.
//
// A node does not report its list, so an id outside this one is treated as
// implemented by nobody.
const implementedSporks = {
  '6d2b1e6cb4025f2f45533f0fe22e9b7ce2014d91cc960471045fa64eee5a6ba3': 'Accelerator-Z',
  ceb7e3808ef17ea910adda2f3ab547be4cdfb54de8400ce3683258d06be1354b: 'HTLC',
  ddd43466769461c5b5d109c639da0f50a7eeb96ad6e7274b1928a35c431d7b1b: 'Bridge and liquidity',
};

// What an administrator must do after the password to activate `id`:
// 'confirm' for a spork znnd implements, 'name' (typed out) for any other.
const activationGate = (id) => (Object.hasOwn(implementedSporks, String(id).toLowerCase()) ? 'confirm' : 'name');

const mayActivate = (spork, typed) => activationGate(spork?.id) === 'confirm' || (Boolean(spork?.name) && typed === spork.name);

// go-zenon measures these in bytes.
const byteLength = (text) => new TextEncoder().encode(text || '').length;

const sporkError = ({ name, description }) => {
  if (byteLength(name) < nameMin || byteLength(name) > nameMax) return `Name: ${nameMin} to ${nameMax} characters.`;
  if (byteLength(description) > descriptionMax) return `Description: at most ${descriptionMax} characters.`;
  return null;
};

// Active, waiting to be enforced, or not activated.
const sporkState = (spork, height) => {
  if (!spork?.activated) return 'inactive';
  return Number(height) >= Number(spork.enforcementHeight) ? 'active' : 'activating';
};

const call = (data) =>
  Primitives.AccountBlockTemplate.callContract(
    Primitives.Address.parse(sporkAddress),
    Constants.znnZts,
    ethers.BigNumber.from(0),
    sdkBytes(`0x${data}`)
  );

const templates = {
  create: ({ name, description }) => call(encodeCall('spork', 'CreateSpork', [name, description])),
  activate: (id) => call(encodeCall('spork', 'ActivateSpork', [id])),
};

const request = (method, params) => Zenon.getSingleton().embedded.pillar.client.sendRequest(method, params);

const reads = {
  all: async () => (await request('embedded.spork.getAll', [0, 1024]))?.list || [],
  height: async () => (await request('ledger.getFrontierMomentum', []))?.height ?? null,
};

export {
  sporkAddress,
  nameMin,
  nameMax,
  descriptionMax,
  enforcementDelay,
  communityAddress,
  communityWindows,
  genesisAdmins,
  implementedSporks,
  activationGate,
  mayActivate,
  sporkRole,
  sporkError,
  sporkState,
  templates,
  reads,
};
