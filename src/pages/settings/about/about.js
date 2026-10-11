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

// About (Settings): which version this is, whether a newer one is out, and
// where the releases, the source and the privacy policy are.
//
// The browser does not update an extension loaded from a ZIP, so this screen
// asks once when it opens (services/utils/release.js).

const states = {
  update: { kind: 'warning' },
  current: { kind: 'success', label: 'Up to date' },
  unknown: { kind: 'neutral', label: 'Not checked' },
};

const links = [
  { href: releasesUrl, title: 'Releases', icon: 'refresh' },
  { href: repositoryUrl, title: 'Source code', icon: 'link' },
  { href: privacyUrl, title: 'Privacy policy', icon: 'contract' },
];

const About = () => {
  const version = currentVersion();
  const [latest, setLatest] = useState(undefined);

  useEffect(() => {
    let mounted = true;
    latestVersion().then((found) => { if (mounted) setLatest(found); });
    return () => { mounted = false; };
  }, []);

  const state = releaseState(latest, version);

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
