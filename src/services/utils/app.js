// The phone's own features (platform/nativeFeatures.js), or null in the
// extension. Screens ask for this rather than for a build flag, so the same
// screen shows a fingerprint button in the app and nothing in a browser.
const app = () => (typeof window !== 'undefined' && window.syriusApp) || null;

export default app;
