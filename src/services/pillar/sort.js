import { delegatorApr } from './apr';
import { productionPercent } from './rules';

// The orders the Delegate list can be put in.
//
// Each is highest first except the name, and each breaks a tie by weight and
// then by name, so the list never reshuffles between two reads of the same
// figures. A pillar with no figure for the chosen order (no rate yet, nothing
// expected this epoch) goes to the end rather than being ranked as zero: a
// pillar that has not had a slot today is not a pillar that missed them all.

const sortChoices = [
  { key: 'weight', label: 'Weight' },
  { key: 'apr', label: 'APR' },
  { key: 'produced', label: 'Produced' },
  { key: 'shared', label: 'Shared' },
  { key: 'name', label: 'Name' },
];

const weightOf = (pillar) => Number(pillar?.weight?.toString() ?? 0);

const figures = {
  weight: (pillar) => weightOf(pillar),
  apr: (pillar, { totals, epoch }) => delegatorApr(pillar, totals, epoch),
  produced: (pillar) => productionPercent(pillar.currentStats),
  shared: (pillar) => Number(pillar.giveDelegateRewardPercentage),
};

const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' });

const sortPillars = (pillars, key = 'weight', context = {}) => {
  const list = [...(pillars || [])];
  if (key === 'name') return list.sort(byName);

  const figure = figures[key] || figures.weight;
  const value = new Map(list.map((pillar) => [pillar, figure(pillar, context)]));
  const missing = (pillar) => value.get(pillar) === null || Number.isNaN(value.get(pillar));

  return list.sort((a, b) => {
    if (missing(a) !== missing(b)) return missing(a) ? 1 : -1;
    if (!missing(a) && value.get(a) !== value.get(b)) return value.get(b) - value.get(a);
    return weightOf(b) - weightOf(a) || byName(a, b);
  });
};

export { sortChoices, sortPillars };
