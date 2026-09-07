import { sha3_256 } from 'js-sha3';

// What a block sent to an embedded contract actually did.
//
// Knowing the destination is not enough. The plasma contract is both "fuse" and
// "cancel fuse"; the stake contract is "stake", "cancel" and "collect reward";
// the pillar contract is "delegate" and "undelegate". The wallet showed all of
// them as one word taken from the contract — every plasma block read "Fused",
// including the one that unfused — and everything else read "Sent 0".
//
// The method is in the block's own data. An embedded call is prefixed with four
// bytes identifying the function: the first four of `SHA3-256` over the
// canonical signature, e.g. `Fuse(address)`. That is the same scheme go-zenon
// uses to dispatch the call, so matching on it is matching on what the node
// itself did with the block.
//
// The signatures below are transcribed from go-zenon's own ABI definitions in
// `vm/embedded/definition/*.go`, and the derivation was checked against the
// SDK: encoding a Fuse, a CancelFuse, a Stake, a Cancel, a Delegate, an
// Undelegate and a CollectReward through `znn-ts-sdk` produces exactly the
// prefixes computed here.
//
// This is also what gives the wallet HTLC awareness. The SDK has no HTLC
// support at all — no address constant, no ABI, no helper — but an HTLC call is
// an embedded call like any other, so a swap created, unlocked or reclaimed in
// another wallet still shows up here as what it is instead of as "Sent 0".

const signatures = {
  plasma: ['Fuse(address)', 'CancelFuse(hash)', 'SetVariables(uint64,uint64,uint64,uint8,uint8)'],

  pillar: [
    'Register(string,address,address,uint8,uint8)',
    'RegisterLegacy(string,address,address,uint8,uint8,string,string)',
    'UpdatePillar(string,address,address,uint8,uint8)',
    'Revoke(string)',
    'Delegate(string)',
    'Undelegate()',
    'CollectReward()',
    'DepositQsr()',
    'WithdrawQsr()',
    'Update()',
  ],

  stake: ['Stake(int64)', 'Cancel(hash)', 'CollectReward()', 'Update()'],

  sentinel: [
    'Register()',
    'Revoke()',
    'CollectReward()',
    'DepositQsr()',
    'WithdrawQsr()',
    'Update()',
  ],

  token: [
    'IssueToken(string,string,string,uint256,uint256,uint8,bool,bool,bool)',
    'Mint(tokenStandard,uint256,address)',
    'Burn()',
    'UpdateToken(tokenStandard,address,bool,bool)',
  ],

  htlc: [
    'Create(address,int64,uint8,uint8,bytes)',
    'Reclaim(hash)',
    'Unlock(hash,bytes)',
    'DenyProxyUnlock()',
    'AllowProxyUnlock()',
  ],

  liquidity: [
    'LiquidityStake(int64)',
    'CancelLiquidityStake(hash)',
    'UnlockLiquidityStakeEntries()',
    'CollectReward()',
    'Fund(uint256,uint256)',
    'BurnZnn(uint256)',
    'Donate()',
    'Update()',
  ],

  accelerator: [
    'CreateProject(string,string,string,uint256,uint256)',
    'AddPhase(hash,string,string,string,uint256,uint256)',
    'UpdatePhase(hash,string,string,string,uint256,uint256)',
    'VoteByName(hash,string,uint8)',
    'VoteByProdAddress(hash,uint8)',
    'Donate()',
    'Update()',
  ],

  swap: ['RetrieveAssets(string,string)'],

  bridge: [
    'WrapToken(uint32,uint32,string)',
    'UnwrapToken(uint32,uint32,hash,uint32,address,string,uint256,string)',
    'Redeem(hash,uint32)',
    'RevokeUnwrapRequest(hash,uint32)',
    'UpdateWrapRequest(hash,string)',
  ],

  spork: ['CreateSpork(string,string)', 'ActivateSpork(hash)'],
};

const methodOf = (signature) => signature.slice(0, signature.indexOf('('));

const selectorOf = (signature) => sha3_256(signature).slice(0, 8);

// contract -> { selector: methodName }
const selectors = Object.fromEntries(
  Object.entries(signatures).map(([contract, list]) => [
    contract,
    Object.fromEntries(list.map((signature) => [selectorOf(signature), methodOf(signature)])),
  ])
);

// A block's `data` arrives base64-encoded once it has been through `toJson()`.
const selectorFromData = (data) => {
  if (!data || typeof data !== 'string') {
    return null;
  }
  try {
    const binary = atob(data);

    if (binary.length < 4) {
      return null;
    }
    let hex = '';
    for (let index = 0; index < 4; index += 1) {
      hex += binary.charCodeAt(index).toString(16).padStart(2, '0');
    }
    return hex;
  } catch (err) {
    return null;
  }
};

// The method name, or null when the data is empty or the selector is not one
// this build knows — a new contract method should degrade to the contract's own
// name, never to a wrong label.
const decodeCall = (contract, data) => {
  const selector = selectorFromData(data);

  if (!selector || !contract) {
    return null;
  }
  return selectors[contract]?.[selector] || null;
};

//
// How each of those reads in a list of transactions.
//
// The pairs matter: "Fused" and "Unfused", "Staked" and "Unstaked",
// "Delegated" and "Undelegated". A history in which both halves of a pair say
// the same word is not a history.
//
const labels = {
  plasma: { Fuse: 'Fused', CancelFuse: 'Unfused' },

  pillar: {
    Delegate: 'Delegated',
    Undelegate: 'Undelegated',
    Register: 'Pillar registered',
    RegisterLegacy: 'Pillar registered',
    UpdatePillar: 'Pillar updated',
    Revoke: 'Pillar revoked',
    CollectReward: 'Collected rewards',
    DepositQsr: 'Deposited QSR',
    WithdrawQsr: 'Withdrew QSR',
  },

  stake: {
    Stake: 'Staked',
    Cancel: 'Unstaked',
    CollectReward: 'Collected rewards',
  },

  sentinel: {
    Register: 'Sentinel registered',
    Revoke: 'Sentinel revoked',
    CollectReward: 'Collected rewards',
    DepositQsr: 'Deposited QSR',
    WithdrawQsr: 'Withdrew QSR',
  },

  token: {
    IssueToken: 'Token issued',
    Mint: 'Minted',
    Burn: 'Burned',
    UpdateToken: 'Token updated',
  },

  htlc: {
    Create: 'Swap created',
    Unlock: 'Swap unlocked',
    Reclaim: 'Swap reclaimed',
    DenyProxyUnlock: 'Proxy unlock denied',
    AllowProxyUnlock: 'Proxy unlock allowed',
  },

  liquidity: {
    LiquidityStake: 'Liquidity staked',
    CancelLiquidityStake: 'Liquidity unstaked',
    UnlockLiquidityStakeEntries: 'Liquidity unlocked',
    CollectReward: 'Collected rewards',
    Donate: 'Donated',
  },

  accelerator: {
    CreateProject: 'Project created',
    AddPhase: 'Phase added',
    UpdatePhase: 'Phase updated',
    VoteByName: 'Voted',
    VoteByProdAddress: 'Voted',
    Donate: 'Donated',
  },

  swap: { RetrieveAssets: 'Swap assets retrieved' },

  bridge: {
    WrapToken: 'Bridged out',
    UnwrapToken: 'Bridged in',
    Redeem: 'Bridge redeemed',
    RevokeUnwrapRequest: 'Bridge request revoked',
    UpdateWrapRequest: 'Bridge request updated',
  },

  spork: { CreateSpork: 'Spork created', ActivateSpork: 'Spork activated' },
};

// How the contract itself is named on screen, where the name read out of its
// address is not what a person calls it.
const displayNames = {
  htlc: 'Swap',
  pillar: 'Pillar',
  spork: 'Spork',
};

const contractDisplayName = (contract) =>
  displayNames[contract] || (contract ? contract[0].toUpperCase() + contract.slice(1) : '');

// The label for one outgoing embedded call. Falls back to the contract's name
// when the method is not recognised, which is still far better than "Sent".
const describeCall = (contract, method) => {
  if (!contract) {
    return null;
  }
  if (method && labels[contract]?.[method]) {
    return labels[contract][method];
  }
  return `${contractDisplayName(contract)} call`;
};

export { decodeCall, describeCall, contractDisplayName, selectors, signatures, selectorOf };
