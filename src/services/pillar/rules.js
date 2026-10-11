// What the pillar and accelerator contracts accept, checked before a block is
// built.
//
// A block the contract refuses still costs plasma, and a refused Register has
// already moved 15,000 ZNN to the contract for the node to send back. So the
// screens check first, with the node's own rules: every limit and pattern here
// is transcribed from go-zenon (`vm/constants/embedded.go`,
// `vm/embedded/implementation/pillars.go` and `accelerator.go`), and
// `utils/pillar-mode-test.js` pins them.
//
// Nothing in this file touches the SDK, storage or the network.

/* global BigInt */
const decimals = 8;
// Written out: the build compiles `**` to Math.pow, which throws on a BigInt
// as the module loads, and the popup then renders nothing at all.
const unit = 100000000n;

const pillarStakeZnn = 15000n * unit;
const pillarNameMaxLength = 40;
// Days a pillar's ZNN is locked, then days it may be revoked, repeating from
// its registration (PillarEpochLockTime, PillarEpochRevokeTime).
const pillarLockDays = 83;
const pillarRevokeDays = 7;

const projectNameMaxLength = 30;
const projectDescriptionMaxLength = 240;
const projectZnnMax = 5000n * unit;
const projectQsrMax = 50000n * unit;
const projectCreationZnn = 1n * unit;
const votingPeriodDays = 14;
// A vote passes on more Yes than No, with more than this share of pillars voting.
const voteAcceptancePercent = 33;

// go-zenon's pattern is `^([a-zA-Z0-9]+[-._]?)*[a-zA-Z0-9]$`. It is written
// here without the nested repeat: the same names match, but a long name ending
// in a bad character no longer costs a backtracking engine 2^40 steps.
const pillarNamePattern = /^[a-zA-Z0-9]+([-._][a-zA-Z0-9]+)*$/;

const projectUrlPattern =
  /^([Hh][Tt][Tt][Pp][Ss]?:\/\/)?[a-zA-Z0-9]{2,60}\.[a-zA-Z]{1,6}([-a-zA-Z0-9()@:%_+.~#?&/=]{0,100})$/;

// go-zenon measures names in bytes, not characters.
const byteLength = (text) => new TextEncoder().encode(text).length;

// Each validator returns what is wrong, or null.
const pillarNameError = (name) => {
  if (typeof name !== 'string' || name.length === 0) return 'Enter a name.';
  if (byteLength(name) > pillarNameMaxLength) return `At most ${pillarNameMaxLength} characters.`;
  if (!pillarNamePattern.test(name)) return 'Letters and digits, with single - . or _ between them.';
  return null;
};

const percentageError = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d{1,3}$/.test(text) || Number(text) > 100) return 'A whole number from 0 to 100.';
  return null;
};

// A user address: bech32 `z1`, 40 characters, first byte 0 (so `z1q` then one
// of q p z r). A pillar that names an embedded contract as its producer never
// produces, and rewards sent to one cannot be collected.
const userAddressError = (address) => {
  if (typeof address !== 'string' || !/^z1q[qpzr][02-9ac-hj-np-z]{36}$/.test(address)) {
    return 'Enter a z1 account address.';
  }
  return null;
};

const toBase = (value) => {
  try {
    return BigInt(value?.toString() ?? '0');
  } catch (error) {
    return 0n;
  }
};

// What a registration still needs. The ZNN travels with the Register block; the
// QSR must already be deposited, and the contract burns exactly the cost.
const registrationShortfall = ({ znnBalance, qsrDeposited, qsrCost }) => {
  const znnShort = pillarStakeZnn - toBase(znnBalance);
  const qsrShort = toBase(qsrCost) - toBase(qsrDeposited);
  return {
    znnShort: znnShort > 0n ? znnShort : 0n,
    qsrShort: qsrShort > 0n ? qsrShort : 0n,
    ready: znnShort <= 0n && qsrShort <= 0n && toBase(qsrCost) > 0n,
  };
};

// The node reports whether a pillar can be revoked now and the seconds left:
// until the window opens, or until it closes again.
const revokeWindow = (pillar) => {
  const seconds = Math.max(0, Number(pillar?.revokeCooldown) || 0);
  return { revocable: Boolean(pillar?.isRevocable), seconds };
};

// The same answer from a registration time, as the contract computes it
// (PillarGetRevokeStatus). Used to check the node's figure, and by the tests.
const revokeWindowAt = (registrationTime, now) => {
  const lock = pillarLockDays * 86400;
  const cycle = lock + pillarRevokeDays * 86400;
  const position = (((now - registrationTime) % cycle) + cycle) % cycle;
  return position < lock
    ? { revocable: false, seconds: lock - position }
    : { revocable: true, seconds: cycle - position };
};

// "61 d 4 h", "3 h 12 min", "40 min". Two units: the second one is what tells
// "revocable for 6 days" from "revocable until tonight".
const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${Math.max(1, minutes)} min`;
};

// Share of expected momentums produced this epoch, or null when none were
// expected: a pillar not asked to produce is not failing to.
const productionPercent = (stats) => {
  const expected = Number(stats?.expectedMomentums) || 0;
  const produced = Number(stats?.producedMomentums) || 0;
  return expected > 0 ? Math.round((produced / expected) * 100) : null;
};

// The same for a finished epoch (embedded.pillar.getPillarEpochHistory), rounded
// down: 2,879 of 2,880 is 99%, because 100% has to mean none were missed.
const epochProduction = (entry) => {
  const expected = Number(entry?.expectedBlockNum) || 0;
  const produced = Number(entry?.producedBlockNum) || 0;
  return expected > 0 ? Math.min(100, Math.floor((produced / expected) * 100)) : null;
};

const pillarFields = [
  ['producerAddress', 'Producer'],
  ['withdrawAddress', 'Reward address'],
  ['giveMomentumRewardPercentage', 'Momentum reward share'],
  ['giveDelegateRewardPercentage', 'Delegation reward share'],
];

// What an update would change, for the confirmation. UpdatePillar rewrites all
// four fields, so an empty list means the block would do nothing.
const pillarChanges = (current, next) =>
  pillarFields
    .map(([key, label]) => ({ key, label, from: String(current?.[key] ?? ''), to: String(next?.[key] ?? '') }))
    .filter((change) => change.from !== change.to);

//
// Accelerator-Z
//
const projectStatus = { voting: 0, active: 1, paid: 2, closed: 3 };
const statusLabels = ['Voting', 'Active', 'Paid', 'Closed'];
const statusLabel = (status) => statusLabels[status] || 'Unknown';

const votes = { yes: 0, no: 1, abstain: 2 };
const voteLabels = ['Yes', 'No', 'Abstain'];
const voteLabel = (vote) => voteLabels[vote] || null;
const isVote = (vote) => Number.isInteger(vote) && vote >= 0 && vote <= 2;

const projectError = ({ name, description, url, znn, qsr }) => {
  if (!name || byteLength(name) > projectNameMaxLength) {
    return `Name: 1 to ${projectNameMaxLength} characters.`;
  }
  if (!description || byteLength(description) > projectDescriptionMaxLength) {
    return `Description: 1 to ${projectDescriptionMaxLength} characters.`;
  }
  if (!url || !projectUrlPattern.test(url)) return 'Link: a web address such as forum.zenon.org/t/1.';
  if (toBase(znn) < 0n || toBase(znn) > projectZnnMax) return 'At most 5,000 ZNN.';
  if (toBase(qsr) < 0n || toBase(qsr) > projectQsrMax) return 'At most 50,000 QSR.';
  return null;
};

// Where a project's link opens, or null. The contract accepts a link with no
// scheme and anybody can submit one, so it is opened only as http or https,
// and only when it still matches the contract's own pattern.
const projectLink = (url) => {
  if (typeof url !== 'string' || !projectUrlPattern.test(url)) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

// The phase of a project that is open to act on: its last one. Earlier phases
// are paid or were replaced.
const currentPhase = (project) => {
  const phases = (project?.phases || []).filter((entry) => entry && entry.phase);
  return phases.length ? phases[phases.length - 1] : null;
};

// The most a phase may ask for, as { znn, qsr } in base units. The contract
// sums every phase of the project after adding or replacing one and refuses
// a total over the project's own amounts (checkPhaseFunds). Adding counts all
// the phases there are; updating replaces the last, so that one is left out.
const phaseFundsLeft = (project, mode) => {
  const phases = (project?.phases || []).filter((entry) => entry && entry.phase);
  const counted = mode === 'update' ? phases.slice(0, -1) : phases;
  const left = (key) => {
    const spent = counted.reduce((sum, entry) => sum + toBase(entry.phase[key]), 0n);
    const rest = toBase(project?.[key]) - spent;
    return rest > 0n ? rest : 0n;
  };
  return { znn: left('znnFundsNeeded'), qsr: left('qsrFundsNeeded') };
};

// Everything a pillar can vote on now: projects in voting, and the current
// phase of an active project while that phase is in voting.
const votables = (projects) => {
  const list = [];
  for (const project of projects || []) {
    if (project.status === projectStatus.voting) {
      list.push({
        id: project.id, kind: 'project', name: project.name, projectName: project.name,
        description: project.description, url: project.url,
        znn: project.znnFundsNeeded, qsr: project.qsrFundsNeeded,
        votes: project.votes, since: project.creationTimestamp,
      });
    }
    const entry = project.status === projectStatus.active ? currentPhase(project) : null;
    if (entry && entry.phase.status === projectStatus.voting) {
      list.push({
        id: entry.phase.id, kind: 'phase', name: entry.phase.name, projectName: project.name,
        description: entry.phase.description, url: entry.phase.url,
        znn: entry.phase.znnFundsNeeded, qsr: entry.phase.qsrFundsNeeded,
        votes: entry.votes, since: entry.phase.creationTimestamp,
      });
    }
  }
  return list;
};

// Whether a tally passes as the contract counts it (checkAcceleratorVotes).
const votePasses = (breakdown, pillarCount) => {
  const yes = Number(breakdown?.yes) || 0;
  const no = Number(breakdown?.no) || 0;
  const total = Number(breakdown?.total) || 0;
  return yes > no && total * 100 > (Number(pillarCount) || 0) * voteAcceptancePercent;
};

// An owner can add a phase to an active project whose current phase, if any,
// has been paid. One still in voting is updated instead.
const canAddPhase = (project, address) => {
  if (!project || project.owner !== address || project.status !== projectStatus.active) return false;
  const entry = currentPhase(project);
  return !entry || entry.phase.status === projectStatus.paid;
};

const canUpdatePhase = (project, address) => {
  if (!project || project.owner !== address || project.status !== projectStatus.active) return false;
  const entry = currentPhase(project);
  return Boolean(entry) && entry.phase.status === projectStatus.voting;
};

export {
  decimals,
  unit,
  pillarStakeZnn,
  pillarNameMaxLength,
  pillarLockDays,
  pillarRevokeDays,
  projectNameMaxLength,
  projectDescriptionMaxLength,
  projectZnnMax,
  projectQsrMax,
  projectCreationZnn,
  votingPeriodDays,
  voteAcceptancePercent,
  pillarNameError,
  percentageError,
  userAddressError,
  registrationShortfall,
  revokeWindow,
  revokeWindowAt,
  formatDuration,
  productionPercent,
  epochProduction,
  pillarChanges,
  projectStatus,
  statusLabel,
  votes,
  voteLabel,
  isVote,
  projectError,
  projectLink,
  currentPhase,
  phaseFundsLeft,
  votables,
  votePasses,
  canAddPhase,
  canUpdatePhase,
  toBase,
};
