import React from 'react';

// What is on screen while the wallet works out where to send you.
//
// That is a storage read and, at most, rebuilding a key store from entropy
// already in memory — a few milliseconds, not something to animate. This
// replaces a three-second Lottie intro that ran before any of that started and
// pulled a 600 KiB player into the bundle to do it.
//
// It renders the logo at rest. If the boot is quick, which it now is, nobody
// sees it at all; if the node is slow, it does not pretend to be a progress bar.
const Splash = () => (
  <div className="splash">
    <img alt="" className="splash-mark" src={require('../../assets/logo.svg')} width="44" />
  </div>
);

export default Splash;
