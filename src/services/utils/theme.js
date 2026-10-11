// Which theme the popup wears.
//
// Every colour token is defined for dark and for light (Popup.scss); this sets
// `data-theme` on <html> to pick one. 'system' follows the OS colour scheme,
// read once when it is applied: a popup lives for seconds, not across a sunset.

const themeChoices = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'System' },
];

const resolveTheme = (setting, prefersLight = false) => {
  if (setting === 'light') return 'light';
  if (setting === 'system') return prefersLight ? 'light' : 'dark';
  return 'dark';
};

const applyTheme = (setting) => {
  const prefersLight =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = resolveTheme(setting, prefersLight);
  document.documentElement.dataset.theme = theme;
  return theme;
};

export { themeChoices, resolveTheme, applyTheme };
