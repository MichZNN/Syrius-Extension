import React, { useEffect, useState } from 'react';
import { sendRuntimeMessage } from '../../../services/security/runtimeMessage';

/** Manage the origin-scoped read permissions used by window.zenon. */
const ConnectedSites = () => {
  const [sites, setSites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSites = async () => {
    const storedSites = await sendRuntimeMessage({
      message: 'internal.getConnectedSites',
    }, { fallback: [] });
    setSites(Array.isArray(storedSites) ? storedSites : []);
    setIsLoading(false);
  };

  useEffect(() => {
    loadSites();
  }, []);

  const revokeSite = async (origin) => {
    await sendRuntimeMessage({
      message: 'internal.revokeConnectedSite',
      origin,
    }, { fallback: null });
    await loadSites();
  };

  const revokeAll = async () => {
    await sendRuntimeMessage({
      message: 'internal.revokeAllConnectedSites',
    }, { fallback: null });
    await loadSites();
  };

  return (
    <div className='black-bg'>
      <h1 className='mt-1'>Connected sites</h1>
      <div className='mt-2 ml-2 mr-2 text-left'>
        <p className='text-gray text-sm'>
          These sites can read your selected address while the wallet is unlocked.
          Sending always requires a new approval.
        </p>
        {isLoading && <p className='text-gray'>Loading...</p>}
        {!isLoading && sites.length === 0 && (
          <p className='text-gray'>No connected sites.</p>
        )}
        {sites.map((site) => (
          <div className='settings-item mt-2' key={site.origin}>
            <div className='settings-item-data mr-2'>
              <div className='text-white text-bold word-break-all'>{site.origin}</div>
            </div>
            <button
              type='button'
              className='thin-button secondary'
              onClick={() => revokeSite(site.origin)}
            >
              Revoke
            </button>
          </div>
        ))}
        {sites.length > 0 && (
          <button type='button' className='button secondary w-100 mt-3' onClick={revokeAll}>
            Revoke all sites
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectedSites;
