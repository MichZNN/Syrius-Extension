/**
 * Verify the temporary wallet session without extending its inactivity timer.
 * Sensitive operations use this guard because the popup event loop can run
 * between the periodic lock check and a button handler.
 */
import { sendRuntimeMessage } from './runtimeMessage';

export const isWalletSessionActive = async () => (
  (await sendRuntimeMessage({ message: 'internal.checkCredentials' }, {
    fallback: null,
  }))?.active === true
);

/** Verify that the current approval popup still owns the active bridge request. */
export const isIntegrationRequestActive = async (requestId) => (
  (await sendRuntimeMessage({
    message: 'internal.isIntegrationRequestActive',
    requestId,
  }, {
    fallback: null,
  }))?.active === true
);
