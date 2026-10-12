import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AccessControl, AuthenticationStrength, BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PrivacyScreen } from '@capacitor/privacy-screen';
import { Share } from '@capacitor/share';
import { fail } from '../services/utils/errors';

// What the phone adds to the wallet, as `window.syriusApp`.
//
// The popup and the background are the extension's code and must build
// without Capacitor, so they import none of it: they look for this object
// and do without when it is absent (services/utils/app.js). It is installed
// only in the app's own entry (mobileShim.js).
//
// Fingerprint unlock keeps the wallet's password in the Android Keystore,
// under a key that only opens after a fingerprint (BiometricPrompt with a
// CryptoObject) and that Android destroys when the enrolled fingerprints
// change. The password itself is never written anywhere else; with the key
// gone, the password is the way in again.

const server = (walletName) => `network.zenon.syrius/${encodeURIComponent(walletName)}`;

// The person closing the prompt is not an error worth showing.
const cancelled = (error) => ['10', '11', '13', '15', '16', '17'].includes(String(error?.code));
// The key was invalidated (new fingerprint enrolled) or never stored.
const gone = (error) => ['21'].includes(String(error?.code)) || /invalidated|not found/i.test(error?.message || '');

// Android shows the title; iOS shows the reason under Touch ID.
const prompt = {
  title: 'Unlock Syrius',
  reason: 'Unlock Syrius',
  negativeButtonText: 'Use password',
};

// What the screens call it: the phone's own name for it. An iPhone is Face ID
// until it says Touch ID (the SE); install() asks.
let biometricName = process.env.SYRIUS_PLATFORM === 'ios' ? 'Face ID' : 'Fingerprint';
const names = { [BiometryType.FACE_ID]: 'Face ID', [BiometryType.TOUCH_ID]: 'Touch ID' };

const biometric = {
  name: () => biometricName,
  // Whether this phone has a strong biometric enrolled: a Keystore key bound
  // to a fingerprint needs a Class 3 sensor, which weak face unlock is not.
  available: async () => {
    try {
      const result = await NativeBiometric.isAvailable({ useFallback: false });
      return Boolean(result.isAvailable) && result.authenticationStrength === AuthenticationStrength.STRONG;
    } catch (error) {
      return false;
    }
  },
  enabled: async (walletName) => {
    try {
      return (await NativeBiometric.isCredentialsSaved({ server: server(walletName) })).isSaved;
    } catch (error) {
      return false;
    }
  },
  // Asks for the fingerprint once, to create the key and store the password.
  enable: (walletName, password) => NativeBiometric.setCredentials({
    username: walletName,
    password,
    server: server(walletName),
    accessControl: AccessControl.BIOMETRY_CURRENT_SET,
  }),
  // The password, after a fingerprint; null when the person chose the password
  // instead. A key Android has invalidated is removed, and says so.
  unlock: async (walletName) => {
    try {
      const credentials = await NativeBiometric.getSecureCredentials({ server: server(walletName), ...prompt });
      return credentials.password;
    } catch (error) {
      if (cancelled(error)) return null;
      if (gone(error)) {
        await biometric.disable(walletName);
        throw fail(135);
      }
      throw error;
    }
  },
  disable: async (walletName) => {
    try {
      await NativeBiometric.deleteCredentials({ server: server(walletName) });
    } catch (error) {
      // Nothing stored is the state asked for.
    }
  },
};

// A QR code's text, or null when the person backed out. Android: Google's scanner
// module draws the camera itself, so the app needs no camera permission
// (android/.../QrScannerPlugin.java, the app's own plugin).
const QrScanner = registerPlugin('QrScanner');
const scan = async () => {
  try {
    return (await QrScanner.scan()).text ?? null;
  } catch (error) {
    // Not on the phone yet; the plugin has asked Play services for it.
    if (error?.code === 'UNAVAILABLE') throw fail(136);
    throw error;
  }
};

const share = ({ title, text }) => Share.share({ title, text, dialogTitle: title })
  .catch((error) => { if (!/cancel/i.test(error?.message || '')) throw error; });

// No screenshots, no screen recording and a blank app-switcher card, for as
// long as a screen that shows a recovery phrase is open. Counted, so two
// screens that both ask do not undo each other.
let secureCount = 0;
const secureScreen = (on) => {
  secureCount = Math.max(0, secureCount + (on ? 1 : -1));
  const call = secureCount > 0 ? PrivacyScreen.enable() : PrivacyScreen.disable();
  call.catch(() => {});
};

let permission = null;
let nextNotification = 1;
const notify = async ({ title, body }) => {
  if (permission === null) {
    try {
      permission = (await LocalNotifications.requestPermissions()).display === 'granted';
    } catch (error) {
      permission = false;
    }
  }
  if (!permission) return;
  nextNotification = (nextNotification % 100000) + 1;
  await LocalNotifications.schedule({ notifications: [{ id: nextNotification, title, body }] }).catch(() => {});
};

// The app going to the background and coming back (components/app-watch
// locks on the way back when the auto-lock time has passed). The fingerprint
// prompt, the scanner and the share sheet each send the app to the background
// too; those trips are the app's own and are reported as such, or opening the
// scanner would lock the wallet.
let ownUi = 0;
const own = (operation) => async (...args) => {
  ownUi += 1;
  try {
    return await operation(...args);
  } finally {
    // The resume arrives just after the call settles.
    setTimeout(() => { ownUi -= 1; }, 1500);
  }
};
const lifecycle = new Set();
let pausedAt = null;
let pausedByUs = false;
const onLifecycle = (listener) => {
  lifecycle.add(listener);
  return () => lifecycle.delete(listener);
};
const emit = (event) => lifecycle.forEach((listener) => {
  try { listener(event); } catch (error) { console.error(error); }
});

const install = () => {
  NativeBiometric.isAvailable({ useFallback: false })
    .then(({ biometryType }) => { biometricName = names[biometryType] || biometricName; })
    .catch(() => {});
  App.addListener('pause', () => {
    pausedAt = Date.now();
    pausedByUs = ownUi > 0;
    emit({ state: 'background', own: pausedByUs });
  }).catch(() => {});
  App.addListener('resume', () => {
    const away = pausedAt === null ? 0 : Date.now() - pausedAt;
    pausedAt = null;
    emit({ state: 'foreground', own: pausedByUs || ownUi > 0, away });
  }).catch(() => {});
  window.syriusApp = Object.freeze({
    biometric: Object.freeze({ ...biometric, enable: own(biometric.enable), unlock: own(biometric.unlock) }),
    // Android only for now: the scanner is Play services' (QrScannerPlugin),
    // and iOS has no counterpart yet. The Scan buttons look for this.
    scan: process.env.SYRIUS_PLATFORM === 'android' ? own(scan) : null,
    share: own(share),
    secureScreen,
    notify,
    onLifecycle,
    inBackground: () => pausedAt !== null,
  });
};

export default install;
