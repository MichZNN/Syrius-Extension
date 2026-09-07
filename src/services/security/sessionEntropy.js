/**
 * Validate the short-lived keystore entropy exchanged between trusted
 * extension contexts. The SDK stores either 16 or 32 bytes as lowercase hex.
 */
const SESSION_ENTROPY_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{64})$/i;

export const isValidSessionEntropy = (entropy) => (
  typeof entropy === 'string' && SESSION_ENTROPY_PATTERN.test(entropy)
);
