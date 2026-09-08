import React from 'react';
import { createRoot } from 'react-dom/client';

import Popup from './Popup';
import './index.scss';

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
if (window.location.hash.startsWith('#/site-integration')) {
  document.body.classList.add('standalone-window');
}

createRoot(window.document.querySelector('#app-container')).render(<Popup />);
