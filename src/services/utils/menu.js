// What the wallet's two menus offer: the tab bar, and the list behind the
// header button.
//
// The tab bar has room for five or six. Pillar mode (Settings) gives three of
// them to running a pillar, and the tabs it displaces move to the header menu,
// so turning the mode on never makes a screen unreachable. The other operator
// modes (sentinel, sporks) only add entries to the header menu.
//
// Kept apart from the components so the rule can be checked without rendering
// (utils/pillar-mode-test.js).

const home = { to: 'dashboard', label: 'Home', icon: 'home' };
const tokens = { to: 'tokens', label: 'Tokens', icon: 'tokens' };
const delegate = { to: 'delegate', label: 'Delegate', icon: 'delegate' };
const plasma = { to: 'plasma', label: 'Plasma', icon: 'plasma' };
const stake = { to: 'stake', label: 'Stake', icon: 'stake' };

const pillar = { to: 'pillar', label: 'Pillar', icon: 'pillar' };
const rewards = { to: 'rewards', label: 'Rewards', icon: 'rewards' };
const accelerator = { to: 'az', label: 'AZ', icon: 'vote' };

const pillarTabs = [pillar, rewards, accelerator];

const sentinel = { to: 'sentinel', label: 'Sentinel', icon: 'sentinel' };
const sporks = { to: 'settings/sporks', label: 'Sporks', icon: 'spork' };

// Modes, in the order Settings lists them.
const modes = [
  { key: 'pillarMode', label: 'Pillar' },
  { key: 'sentinelMode', label: 'Sentinel' },
  { key: 'sporkMode', label: 'Sporks' },
];

const isPillarMode = (settings) => Boolean(settings?.pillarMode);

const menuFor = (settings) => {
  const operator = [
    ...(settings?.sentinelMode ? [sentinel] : []),
    ...(settings?.sporkMode ? [sporks] : []),
  ];

  if (!isPillarMode(settings)) {
    return { tabs: [home, tokens, delegate, plasma, stake], more: operator };
  }
  // Plasma stays on the bar: every pillar call needs it.
  return { tabs: [home, ...pillarTabs, plasma], more: [tokens, delegate, stake, ...operator] };
};

export { menuFor, isPillarMode, pillarTabs, modes };
