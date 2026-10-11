import { Constants, Primitives, Zenon } from 'znn-ts-sdk';
import { ethers } from 'ethers';

import { sdkBytes } from '../utils/sdkBytes';
import { encodeCall } from './encode';
import { isVote, pillarStakeZnn, projectCreationZnn } from './rules';
import { fail } from '../utils/errors';

// The blocks and reads behind the pillar screens.
//
// Blocks are built here and sent by the caller through the background sender,
// like every other block the wallet's own screens send. Call data comes from
// ./encode (see there for why not the SDK's own builders).

const acceleratorAddress = 'z1qxemdeddedxaccelerat0rxxxxxxxxxxp4tk22';

// `Buffer` is not a global in the popup; the SDK's own is borrowed for block
// data (utils/sdkBytes), and ethers reads an address's bytes.
const addressHex = (address) =>
  ethers.utils.hexlify(Primitives.Address.parse(address.toString()).core);

const call = (to, token, amount, data) =>
  Primitives.AccountBlockTemplate.callContract(
    typeof to === 'string' ? Primitives.Address.parse(to) : to,
    token,
    ethers.BigNumber.from(amount.toString()),
    sdkBytes(`0x${data}`)
  );

const pillarCall = (token, amount, method, values) =>
  call(Constants.pillarAddress, token, amount, encodeCall('pillar', method, values));

const acceleratorCall = (amount, method, values) =>
  call(acceleratorAddress, Constants.znnZts, amount, encodeCall('accelerator', method, values));

const pillarValues = ({ name, producerAddress, withdrawAddress, momentumPercent, delegatePercent }) => [
  name,
  addressHex(producerAddress),
  addressHex(withdrawAddress),
  Number(momentumPercent),
  Number(delegatePercent),
];

const phaseValues = ({ name, description, url, znn, qsr }) => [
  name,
  description,
  url,
  znn.toString(),
  qsr.toString(),
];

const templates = {
  // Carries the 15,000 ZNN. The QSR must already be deposited.
  register: (pillar) => pillarCall(Constants.znnZts, pillarStakeZnn, 'Register', pillarValues(pillar)),
  update: (pillar) => pillarCall(Constants.znnZts, 0, 'UpdatePillar', pillarValues(pillar)),
  revoke: (name) => pillarCall(Constants.znnZts, 0, 'Revoke', [name]),
  collect: () => pillarCall(Constants.znnZts, 0, 'CollectReward', []),
  depositQsr: (amount) => pillarCall(Constants.qsrZts, amount, 'DepositQsr', []),
  withdrawQsr: () => pillarCall(Constants.znnZts, 0, 'WithdrawQsr', []),

  // A pillar's vote, sent from its owner address.
  vote: (id, pillarName, vote) => {
    if (!isVote(vote)) throw fail(400);
    return acceleratorCall(0, 'VoteByName', [id, pillarName, vote]);
  },
  // Costs 1 ZNN, which the contract keeps.
  createProject: (project) => acceleratorCall(projectCreationZnn, 'CreateProject', phaseValues(project)),
  addPhase: (projectId, phase) => acceleratorCall(0, 'AddPhase', [projectId, ...phaseValues(phase)]),
  updatePhase: (projectId, phase) =>
    acceleratorCall(0, 'UpdatePhase', [projectId, ...phaseValues(phase)]),
};

//
// Reads. They go to the node as plain requests and come back as the JSON
// go-zenon sends: the SDK has no accelerator reads, and its `getByOwner` maps
// the node's array through a constructor typed for one pillar.
//
const request = (method, params) =>
  Zenon.getSingleton().embedded.pillar.client.sendRequest(method, params);

const reads = {
  // The pillar this address owns, or null. An address owns at most one.
  ownedPillar: async (address) => {
    const list = await request('embedded.pillar.getByOwner', [address]);
    return Array.isArray(list) && list.length ? list[0] : null;
  },
  qsrCost: async () => String(await request('embedded.pillar.getQsrRegistrationCost', [])),
  depositedQsr: async (address) => String(await request('embedded.pillar.getDepositedQsr', [address])),
  nameAvailable: (name) => request('embedded.pillar.checkNameAvailability', [name]),
  uncollected: (address) => request('embedded.pillar.getUncollectedReward', [address]),
  // One entry per finished epoch, newest first.
  epochHistory: (name, page, size) => request('embedded.pillar.getPillarEpochHistory', [name, page, size]),
  rewardHistory: (address, page, size) =>
    request('embedded.pillar.getFrontierRewardByPage', [address, page, size]),
  // Every pillar in one page: the node's page limit is 1,024 and there are
  // about a hundred.
  allPillars: async () => (await request('embedded.pillar.getAll', [0, 1024]))?.list || [],
  // Epochs are days counted from the first momentum.
  epoch: async () => {
    const [frontier, first] = await Promise.all([
      request('ledger.getFrontierMomentum', []),
      request('ledger.getMomentumsByHeight', [1, 1]),
    ]);
    const genesis = first?.list?.[0]?.timestamp;
    if (!frontier?.timestamp || !genesis) return null;
    return Math.floor((frontier.timestamp - genesis) / 86400);
  },
  pillarCount: async () => (await request('embedded.pillar.getAll', [0, 1]))?.count ?? 0,
  projects: (page, size) => request('embedded.accelerator.getAll', [page, size]),
  // One entry per hash, null where the pillar has not voted.
  pillarVotes: (pillarName, ids) =>
    ids.length
      ? request('embedded.accelerator.getPillarVotes', [pillarName, ids])
      : Promise.resolve([]),
};

export { templates, reads, acceleratorAddress };
