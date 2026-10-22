// What delegating to a pillar pays, as a yearly rate.
//
// Nothing on the node reports this, so it is worked out the way the pillar
// contract pays (go-zenon `computePillarRewardForEpoch`, `vm/constants`):
// each epoch (a day, 8,640 momentums) a pillar earns
//
//   delegation = 24% of the epoch's ZNN x its share of all delegated weight
//   momentum   = 50% of the epoch's ZNN x its share of the momentums
//
// both scaled by the momentums it actually produced, and passes on to its
// delegators the two percentages it has set. Their rate is that amount over
// the pillar's own weight, times 365.
//
// It is an estimate from this epoch so far: a pillar's slots, its uptime, the
// shares it gives and every pillar's weight all move. A pillar with almost no
// weight shows a very large figure, and it is real only until others delegate.

const momentumsPerEpoch = 8640;
const epochsPerYear = 365;
const delegationPercent = 24;
const momentumPercent = 50;
const tickEpochs = 30;

// ZNN minted per epoch, by 30-epoch tick; the last value holds from then on.
const znnPerMomentumSixths = [10, 6, 5, 7, 5, 4, 7, 4, 3, 7, 3];

// `epoch` unknown means a chain past its first eleven ticks, which is every
// chain older than eleven months.
const epochZnn = (epoch) => {
  const last = znnPerMomentumSixths.length - 1;
  const tick = Number.isInteger(epoch) && epoch >= 0 ? Math.min(Math.floor(epoch / tickEpochs), last) : last;
  return (znnPerMomentumSixths[tick] * momentumsPerEpoch) / 6;
};

const toZnn = (value) => Number(value?.toString() ?? 0) / 1e8;

// The totals a single pillar's rate is measured against.
const networkTotals = (pillars) => {
  let weight = 0;
  let expected = 0;
  for (const pillar of pillars || []) {
    weight += toZnn(pillar.weight);
    expected += Number(pillar.currentStats?.expectedMomentums) || 0;
  }
  return { weight, expected, count: (pillars || []).length };
};

// Percent a year, or null where there is no rate to give: no weight to divide
// by, or no totals yet.
const delegatorApr = (pillar, totals, epoch) => {
  const weight = toZnn(pillar?.weight);
  if (!pillar || !totals || weight <= 0 || totals.weight <= 0) return null;

  const expected = Number(pillar.currentStats?.expectedMomentums) || 0;
  const produced = Number(pillar.currentStats?.producedMomentums) || 0;
  // Before its first slot of the epoch a pillar has missed nothing.
  const uptime = expected > 0 ? Math.min(1, produced / expected) : 1;
  // Its share of the epoch's momentums, from the slots handed out so far.
  const slots = totals.expected > 0 ? expected / totals.expected : 1 / Math.max(1, totals.count);

  const minted = epochZnn(epoch);
  const delegation = minted * (delegationPercent / 100) * (weight / totals.weight) * uptime;
  const momentum = minted * (momentumPercent / 100) * slots * uptime;
  const toDelegators =
    delegation * ((Number(pillar.giveDelegateRewardPercentage) || 0) / 100) +
    momentum * ((Number(pillar.giveMomentumRewardPercentage) || 0) / 100);

  return ((toDelegators * epochsPerYear) / weight) * 100;
};

// "12.4%". Past 999 the number says nothing a delegator can use.
const formatApr = (apr) => {
  if (apr === null || apr === undefined || !Number.isFinite(apr)) return null;
  if (apr > 999) return '>999%';
  return `${apr >= 100 ? Math.round(apr) : apr.toFixed(1)}%`;
};

export { epochZnn, networkTotals, delegatorApr, formatApr, momentumsPerEpoch };
