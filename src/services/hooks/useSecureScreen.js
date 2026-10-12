import { useEffect } from 'react';

import app from '../utils/app';

// In the app, a screen that shows or takes a recovery phrase blocks
// screenshots, screen recording and the app-switcher preview for as long as
// it is mounted (platform/nativeFeatures.js secureScreen). Nothing in the
// extension: a browser has no such switch.
const useSecureScreen = () => {
  useEffect(() => {
    const native = app();
    if (!native) return undefined;
    native.secureScreen(true);
    return () => native.secureScreen(false);
  }, []);
};

export default useSecureScreen;
