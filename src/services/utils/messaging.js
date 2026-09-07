// Talking to the service worker from the popup.
//
// `chrome.runtime.sendMessage` is callback-shaped and reports failure through
// `chrome.runtime.lastError` rather than by throwing, so every call site that
// forgets to read it produces an "Unchecked runtime.lastError" in the console
// and a promise that never settles. That is wrapped once, here.

// Chrome does not always answer.
//
// A listener that returns `true` and then goes away, or a page orphaned by an
// extension update — reloading an extension leaves any open popup bound to a
// context that no longer exists — produces a `sendMessage` whose callback is
// simply never invoked. Without a deadline the caller waits forever, and this
// wallet awaited one of these on the unlock path: the result was a popup stuck
// on a blank splash screen with no error and no way forward.
const defaultTimeoutMs = 10000;

const sendInternal = (method, params = {}, { timeoutMs = defaultTimeoutMs } = {}) =>
  new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`The extension background did not answer ${method}`));
      }
    }, timeoutMs);

    const settle = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    try {
      chrome.runtime.sendMessage({ channel: 'internal', method, params }, (response) => {
        // The worker was still starting, or is gone. Either way there is no
        // answer coming.
        if (chrome.runtime.lastError) {
          settle(reject, new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          settle(reject, new Error('No response from the extension background'));
          return;
        }
        if (response.error) {
          settle(reject, new Error(response.error));
          return;
        }
        settle(resolve, response.result);
      });
    } catch (err) {
      settle(reject, err);
    }
  });

// For the calls whose failure changes nothing the person can see — telling
// connected sites that an address changed, for instance. Given a
// shorter deadline than the default: nobody should wait ten seconds to find out
// that a page could not be told an address changed.
const sendInternalQuietly = async (method, params = {}) => {
  try {
    return await sendInternal(method, params, { timeoutMs: 4000 });
  } catch (err) {
    return null;
  }
};

export { sendInternal, sendInternalQuietly };
