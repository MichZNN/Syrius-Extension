import { sha3_256 } from 'js-sha3';
import { contractDisplayName } from './contracts';

/**
 * Embedded-contract ABI signatures used for transaction-history labels.
 * Selectors are derived at module load time, so the table remains auditable
 * and does not depend on a user-controlled method name.
 */
export const CONTRACT_SIGNATURES = Object.freeze({
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
  sentinel: ['Register()', 'Revoke()', 'CollectReward()', 'DepositQsr()', 'WithdrawQsr()', 'Update()'],
  token: [
    'IssueToken(string,string,string,uint256,uint256,uint8,bool,bool,bool)',
    'Mint(tokenStandard,uint256,address)',
    'Burn()',
    'UpdateToken(tokenStandard,address,bool,bool)',
  ],
  htlc: ['Create(address,int64,uint8,uint8,bytes)', 'Reclaim(hash)', 'Unlock(hash,bytes)', 'DenyProxyUnlock()', 'AllowProxyUnlock()'],
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
});

const methodOf = (signature) => signature.slice(0, signature.indexOf('('));
const selectorOf = (signature) => sha3_256(signature).slice(0, 8);

const selectors = Object.freeze(Object.fromEntries(
  Object.entries(CONTRACT_SIGNATURES).map(([contract, signatures]) => [
    contract,
    Object.freeze(Object.fromEntries(
      signatures.map((signature) => [selectorOf(signature), methodOf(signature)]),
    )),
  ]),
));

const labels = Object.freeze({
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
});

const selectorFromData = (data) => {
  if (typeof data !== 'string' || data.length === 0 || data.length > 1024 * 1024) {
    return null;
  }

  try {
    const binary = atob(data);
    if (binary.length < 4) {
      return null;
    }

    return Array.from(binary.slice(0, 4), (byte) => (
      byte.charCodeAt(0).toString(16).padStart(2, '0')
    )).join('');
  } catch {
    return null;
  }
};

/** Decode the method selector from a JSON-serialised account block. */
export const decodeCall = (contract, data) => {
  const selector = selectorFromData(data);
  return selector && contract ? selectors[contract]?.[selector] || null : null;
};

/** Give a decoded embedded call a safe human-readable label. */
export const describeCall = (contract, method) => {
  if (!contract) {
    return 'Transaction';
  }

  return labels[contract]?.[method]
    || `${contractDisplayName(contract)} call`;
};

export { selectorOf, selectors };
