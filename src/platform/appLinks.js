import { App } from '@capacitor/app';
import { parseLink } from './linkRoutes';
import { startAppRequest } from './appRequests';

// syrius:// links reaching the app: the one it was opened with, and any that
// arrive while it runs (AndroidManifest.xml registers the scheme).
//
// They wait until the wallet is unlocked. A screen behind the lock is useless,
// and a request made while locked is refused by the background, because the
// app's session storage is memory and starts empty: there is no account yet
// to ask about. Unlocked is when the tab screens are showing, and they say so
// (layouts/tabsLayout: setReady). The approval screen is not one of them, so a
// link that arrives during an approval waits for it.

const install = (host) => {
  const waiting = [];
  let ready = false;

  const open = (link) => {
    if (link.kind === 'request') {
      startAppRequest(host, link);
      return;
    }
    // A screen already open with other arguments has to mount again to read
    // them, so pass through home first.
    const target = `#${link.path}`;
    const samePage = window.location.hash.split('?')[0] === target.split('?')[0];
    if (samePage) {
      window.location.hash = '#/tabs/dashboard';
      setTimeout(() => { window.location.hash = target; }, 0);
    } else {
      window.location.hash = target;
    }
  };

  const drain = () => {
    while (ready && waiting.length) open(waiting.shift());
  };

  // A cold start can report the launching link twice: as the launch URL and
  // as an open event.
  let last = { raw: null, at: 0 };
  const receive = (raw) => {
    if (raw === last.raw && Date.now() - last.at < 3000) return;
    last = { raw, at: Date.now() };
    const link = parseLink(raw);
    if (!link) return;
    // A burst of links is one person tapping, not a queue to work through.
    if (waiting.length >= 4) waiting.shift();
    waiting.push(link);
    drain();
  };

  window.syriusAppLinks = {
    setReady: (value) => {
      ready = Boolean(value);
      drain();
    },
    // A link from inside the app: a scanned QR code.
    receive,
  };

  App.addListener('appUrlOpen', ({ url }) => receive(url)).catch(() => {});
  App.getLaunchUrl().then((launch) => launch?.url && receive(launch.url)).catch(() => {});
};

export default install;
