import React from 'react';
import { createRoot } from 'react-dom/client';

import Popup from './Popup';
import './index.scss';
import { applyTheme } from '../../services/utils/theme';
import { getSettings } from '../../services/utils/storage';

// Before the first paint, so a light wallet never opens dark for a frame.
applyTheme(getSettings().theme);

// The approval flow opens `popup.html#/site-integration` in a window of its
// own, and unlike the toolbar popup — which Chrome sizes to the body — that
// window's height is whatever the window manager gives it. It can be shorter
// than the 600px the stylesheet pins the body to (a taller OS chrome, a
// display-scaling difference, another extension's browser UI taking a strip of
// the screen), and because the body hides its overflow, everything past the
// fold is clipped with no way to scroll to it. The action row sits at the foot
// of the screen, so it is the first thing to disappear.
//
// The class lets the stylesheet fit that window instead of pinning it. It is
// set here rather than in the screen so it survives the trip through the
// password screen, and applies before the first paint.
// The app (Android, iOS) fills the screen the same way, and is-app sizes its
// touch targets for a finger rather than a pointer.
const isApp = ['android', 'ios'].includes(process.env.SYRIUS_PLATFORM);
if (window.location.hash.startsWith('#/site-integration') || isApp) {
  document.body.classList.add('standalone-window');
}
if (isApp) document.body.classList.add('is-app');

// The Update tab shows the popup's frame in the middle of the tab (Popup.scss).
if (window.location.hash.startsWith('#/update')) {
  document.body.classList.add('in-tab');
}

createRoot(window.document.querySelector('#app-container')).render(<Popup />);
