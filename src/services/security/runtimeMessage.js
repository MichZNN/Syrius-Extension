/**
 * Resolve a runtime message even when an MV3 service worker is restarting or
 * has disappeared. Chrome's callback can otherwise remain pending forever.
 */
export const sendRuntimeMessage = (message, {
  timeoutMs = 10000,
  fallback = null,
} = {}) => new Promise((resolve) => {
  let settled = false;
  let timeoutId;

  const finish = (value) => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(timeoutId);
    resolve(value);
  };

  timeoutId = setTimeout(() => finish(fallback), timeoutMs);

  try {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      finish(runtimeError ? fallback : response);
    });
  } catch {
    finish(fallback);
  }
});
