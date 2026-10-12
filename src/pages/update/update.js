import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import Icon from '../../components/icon/icon';
import { chooseFolder, resetUpdatePrefs, savedFolder, updateFolder } from '../../services/update/chromeUpdate';
import { currentVersion, latestVersion, parseVersion, releaseState } from '../../services/utils/release';
import { downloadUrl } from '../../services/utils/selfUpdate';
import { describe } from '../../services/utils/errors';
import { isDevWalletBuild } from '../../services/utils/devWallet';

// Updating an unpacked Chrome or Brave install (services/update/chromeUpdate.js).
//
// A tab of its own, opened from About: the toolbar popup closes the moment a
// folder picker takes focus, and the update with it. The folder is picked
// once and remembered; About's "Forget update folder" clears it.

const stages = {
  downloading: () => 'Downloading…',
  checking: () => 'Checking…',
  writing: (done, total) => (total ? `Writing ${done} of ${total}…` : 'Writing…'),
  reloading: () => 'Restarting…',
};

const Update = () => {
  const { search } = useLocation();
  const asked = parseVersion(new URLSearchParams(search).get('v'))?.join('.') || null;
  const [version, setVersion] = useState(asked);
  const [folder, setFolder] = useState(null);
  const [stage, setStage] = useState(null);
  const [error, setError] = useState(null);
  const busy = Boolean(stage) && stage.name !== 'reloading';

  useEffect(() => {
    let mounted = true;
    savedFolder().then((kept) => { if (mounted) setFolder(kept); });
    if (!asked) {
      latestVersion().then((latest) => {
        if (mounted && releaseState(latest, currentVersion()) === 'update') setVersion(latest);
      });
    }
    return () => { mounted = false; };
  }, [asked]);

  // Opened again with another version asked for: that one.
  useEffect(() => { if (asked) setVersion(asked); }, [asked]);

  const choose = async () => {
    setError(null);
    try {
      setFolder(await chooseFolder());
    } catch (caught) {
      // Closing the picker is not an error.
      if (caught?.name !== 'AbortError') setError(describe(caught).line);
    }
  };

  const update = async () => {
    setError(null);
    try {
      await updateFolder(version, {
        folder,
        onStage: (name, done, total) => setStage({ name, done, total }),
      });
    } catch (caught) {
      setStage(null);
      setError(describe(caught).line);
    }
  };

  // The dev harness drives the real updater against a folder of its own and a
  // local release, since no automation can answer the native folder picker.
  // Compiled out of every build that does not set SYRIUS_DEV_WALLET.
  useEffect(() => {
    if (!isDevWalletBuild) return undefined;
    window.__syriusUpdate = { updateFolder, chooseFolder, savedFolder, resetUpdatePrefs };
    return () => { delete window.__syriusUpdate; };
  }, []);

  const current = currentVersion();

  return (
    <div className="page update-page">
      <h1 className="pillar-title">
        {version ? <>Update to <span className="mono">{version}</span></> : 'Up to date'}
      </h1>
      <p className="text-gray">Installed <span className="mono">{current || 'unknown'}</span></p>

      <div className="settings-group">
        <button type="button" className="settings-item" onClick={choose} disabled={busy}>
          <span className="settings-item-icon is-info">
            <Icon name="folder" size={18} />
          </span>
          <span className="settings-item-title">{folder ? folder.name : 'Choose the extension folder'}</span>
          {folder && <span className="settings-item-chevron text-gray">Change</span>}
        </button>
      </div>

      {version && (
        <button type="button" className="button primary w-100" onClick={update} disabled={!folder || busy}>
          <Icon name="download" size={16} />
          {stage ? stages[stage.name](stage.done, stage.total) : 'Update now'}
        </button>
      )}

      {error && <p className="input-error" role="alert">{error}</p>}

      {version && (
        <a className="update-fallback" href={downloadUrl(version, 'chrome')} target="_blank" rel="noreferrer">
          Download the ZIP instead
        </a>
      )}
    </div>
  );
};

export default Update;
