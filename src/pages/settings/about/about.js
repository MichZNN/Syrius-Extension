import React, { useEffect, useState } from 'react';

import Icon from '../../../components/icon/icon';
import { Status } from '../../../components/data/data';
import {
  currentVersion,
  latestVersion,
  privacyUrl,
  releaseState,
  releasesUrl,
  repositoryUrl,
} from '../../../services/utils/release';
import { updateNow } from '../../../services/utils/selfUpdate';

// About (Settings): which version this is, whether a newer one is out, and
// where the releases, the source and the privacy policy are.
//
// The browser does not update an extension loaded from a ZIP, so this screen
// asks once when it opens (services/utils/release.js). Update applies a newer
// release where the browser can, and downloads it where it cannot
// (services/utils/selfUpdate.js).

const states = {
  update: { kind: 'warning' },
  current: { kind: 'success', label: 'Up to date' },
  unknown: { kind: 'neutral', label: 'Not checked' },
};

// What the Update row says after it is pressed.
const updateLabels = {
  checking: 'Updating…',
  unzip: 'Unzip over the extension folder, then reload it',
  download: 'Downloading',
  reloading: 'Restarting…',
  pending: 'Applies when the browser restarts',
  'not-yet': 'Not offered by the browser yet',
  throttled: 'Try again later',
  failed: 'Update failed',
};

const links = [
  { href: releasesUrl, title: 'Releases', icon: 'refresh' },
  { href: repositoryUrl, title: 'Source code', icon: 'link' },
  { href: privacyUrl, title: 'Privacy policy', icon: 'contract' },
];

const About = () => {
  const version = currentVersion();
  const [latest, setLatest] = useState(undefined);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    let mounted = true;
    latestVersion().then((found) => { if (mounted) setLatest(found); });
    return () => { mounted = false; };
  }, []);

  const state = releaseState(latest, version);

  const update = async () => {
    setUpdating('checking');
    const { result, url } = await updateNow(latest);
    if (url) window.open(url, '_blank', 'noreferrer');
    setUpdating(result);
  };

  return (
    <div className="page">
      <dl className="detail-list">
        <dt>Version</dt>
        <dd className="mono">{version || 'Unknown'}</dd>
        <dt>Latest</dt>
        <dd>
          {latest === undefined
            ? <Status kind="pending">Checking</Status>
            : <Status kind={states[state].kind}>{state === 'update' ? `${latest} available` : states[state].label}</Status>}
        </dd>
        <dt>License</dt>
        <dd>MIT</dd>
      </dl>

      <div className="settings-group">
        {state === 'update' && (
          <button type="button" className="settings-item" onClick={update}
            disabled={updating === 'checking' || updating === 'reloading'}>
            <span className="settings-item-icon is-highlight">
              <Icon name="download" size={18} />
            </span>
            <span className="settings-item-title">{updateLabels[updating] || `Update to ${latest}`}</span>
          </button>
        )}
        {links.map((link) => (
          <a key={link.href} className="settings-item" href={link.href} target="_blank" rel="noreferrer">
            <span className={`settings-item-icon ${link.title === 'Releases' && state === 'update' ? 'is-highlight' : 'is-info'}`}>
              <Icon name={link.icon} size={18} />
            </span>
            <span className="settings-item-title">{link.title}</span>
            <Icon name="external" size={16} className="settings-item-chevron" />
          </a>
        ))}
      </div>
    </div>
  );
};

export default About;
