import { Constants, Primitives, Zenon } from 'znn-ts-sdk';
import { ethers } from 'ethers';

import { sdkBytes } from '../utils/sdkBytes';
import { encodeCall } from '../pillar/encode';
import { toBase } from '../pillar/rules';

// Sentinels: the rules their screen enforces and the blocks it sends.
//
// From go-zenon `vm/constants/embedded.go` and
// `vm/embedded/implementation/sentinel.go`:
//
// - Registering takes 5,000 ZNN, sent with the Register block, and 50,000 QSR
//   deposited beforehand, which the contract takes from the deposit.
// - Unlike a pillar's, a sentinel's QSR is not burned: Revoke returns both.
// - The stake is locked for 27 days, then revocable for 3, repeating from the
//   registration. The node reports where in that cycle a sentinel is.
// - An address registers once. A revoked sentinel stays on record and Register
//   answers "already registered" for that address ever after, so the screen
//   says so rather than offering a button the contract will refuse.
//
// Call data is built by services/pillar/encode.js from the same signatures
// the history decodes with (the SDK's `depositQsr` sends ZNN).
//
// Checked in utils/operator-mode-test.js.

const sentinelAddress = 'z1qxemdeddedxsentynelxxxxxxxxxxxxxwy0r2r';

// Written out: the build compiles `**` to Math.pow, which throws on a BigInt.
const unit = 100000000n;
const stakeZnn = 5000n * unit;
const stakeQsr = 50000n * unit;
const lockDays = 27;
const revokeDays = 3;

// What the address is to the contract: 'none', 'active', or 'revoked'.
const sentinelState = (info) => {
  if (!info) return 'none';
  return info.active ? 'active' : 'revoked';
};

// What a registration still needs.
const shortfall = ({ znnBalance, qsrDeposited }) => {
  const znnShort = stakeZnn - toBase(znnBalance);
  const qsrShort = stakeQsr - toBase(qsrDeposited);
  return {
    znnShort: znnShort > 0n ? znnShort : 0n,
    qsrShort: qsrShort > 0n ? qsrShort : 0n,
    ready: znnShort <= 0n && qsrShort <= 0n,
  };
};

// The node's answer: revocable now, and the seconds until that changes.
const revokeWindow = (info) => ({
  revocable: Boolean(info?.active && info?.isRevocable),
  seconds: Math.max(0, Number(info?.revokeCooldown) || 0),
});

// The same answer from a registration time, as the contract computes it
// (GetSentinelRevokeStatus). Used to check the node's figure, and by the tests.
const revokeWindowAt = (registrationTime, now) => {
  const lock = lockDays * 86400;
  const cycle = lock + revokeDays * 86400;
  const position = (((now - registrationTime) % cycle) + cycle) % cycle;
  return position < lock
    ? { revocable: false, seconds: lock - position }
    : { revocable: true, seconds: cycle - position };
};

const call = (token, amount, method) =>
  Primitives.AccountBlockTemplate.callContract(
    Primitives.Address.parse(sentinelAddress),
    token,
    ethers.BigNumber.from(amount.toString()),
    sdkBytes(`0x${encodeCall('sentinel', method, [])}`)
  );

const templates = {
  // Carries the 5,000 ZNN. The QSR must already be deposited.
  register: () => call(Constants.znnZts, stakeZnn, 'Register'),
  revoke: () => call(Constants.znnZts, 0, 'Revoke'),
  collect: () => call(Constants.znnZts, 0, 'CollectReward'),
  depositQsr: (amount) => call(Constants.qsrZts, amount, 'DepositQsr'),
  withdrawQsr: () => call(Constants.znnZts, 0, 'WithdrawQsr'),
};

const request = (method, params) => Zenon.getSingleton().embedded.pillar.client.sendRequest(method, params);

const reads = {
  // The sentinel this address registered, active or revoked, or null.
  owned: (address) => request('embedded.sentinel.getByOwner', [address]),
  depositedQsr: async (address) => String(await request('embedded.sentinel.getDepositedQsr', [address])),
  uncollected: (address) => request('embedded.sentinel.getUncollectedReward', [address]),
  activeCount: async () => (await request('embedded.sentinel.getAllActive', [0, 1]))?.count ?? 0,
};

export {
  sentinelAddress,
  stakeZnn,
  stakeQsr,
  lockDays,
  revokeDays,
  toBase,
  sentinelState,
  shortfall,
  revokeWindow,
  revokeWindowAt,
  templates,
  reads,
};
