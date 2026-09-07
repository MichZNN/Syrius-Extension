// The queue of things a site has asked for and a person has not answered yet.
//
// Two constraints shape this. A manifest v3 service worker is unloaded when
// idle, so nothing about a pending request can live in a module-level variable
// — an approval takes as long as somebody takes to find their password, which
// is far longer than the worker survives. And a site can ask twice before the
// first answer, which under the old code opened a second popup on top of the
// first and left whichever one lost the race waiting forever.
//
// So: the queue lives in `chrome.storage.session`, and there is at most one
// approval window, reused and refocused.

const pendingKey = 'znn.pendingRequests';
const windowKey = 'znn.approvalWindowId';

const readPending = async () => {
  try {
    const stored = await chrome.storage.session.get(pendingKey);
    return stored[pendingKey] || {};
  } catch (err) {
    return {};
  }
};

const writePending = async (pending) => {
  try {
    await chrome.storage.session.set({ [pendingKey]: pending });
  } catch (err) {
    // If session storage is unavailable the request cannot be tracked; the
    // caller's timeout is what recovers it.
  }
};

const list = async () => {
  const pending = await readPending();
  return Object.values(pending).sort((a, b) => a.createdAt - b.createdAt);
};

const oldest = async () => (await list())[0] || null;

const get = async (id) => (await readPending())[id] || null;

const add = async (request) => {
  const pending = await readPending();
  pending[request.id] = request;
  await writePending(pending);
};

const remove = async (id) => {
  const pending = await readPending();
  const request = pending[id];
  delete pending[id];
  await writePending(pending);
  return request || null;
};

//
// The approval window
//
const popupSize = { width: 376, height: 628 };

const getWindowId = async () => {
  try {
    const stored = await chrome.storage.session.get(windowKey);
    return stored[windowKey] ?? null;
  } catch (err) {
    return null;
  }
};

const setWindowId = async (id) => {
  try {
    if (id === null) {
      await chrome.storage.session.remove(windowKey);
    } else {
      await chrome.storage.session.set({ [windowKey]: id });
    }
  } catch (err) {
    // Same as above: worst case a second window opens.
  }
};

// Opens the approval window, or brings the existing one forward. Chrome throws
// when asked about a window that has been closed, which is the signal that the
// remembered id is stale.
const openApprovalWindow = async () => {
  const existingId = await getWindowId();

  if (existingId !== null) {
    try {
      await chrome.windows.update(existingId, { focused: true, drawAttention: true });
      return existingId;
    } catch (err) {
      await setWindowId(null);
    }
  }

  // Centred on the screen the browser is on, rather than the top-left corner
  // Chrome defaults to.
  let position = {};
  try {
    const current = await chrome.windows.getLastFocused();
    position = {
      top: Math.max(0, Math.round((current.top || 0) + 80)),
      left: Math.max(0, Math.round((current.left || 0) + (current.width || 1280) - popupSize.width - 32)),
    };
  } catch (err) {
    position = {};
  }

  // An absolute chrome-extension:// URL, not a bare 'popup.html'. A relative
  // URL is resolved against "the current page within the extension", and a
  // service worker is not a page — so Chrome cannot resolve it, silently falls
  // back, and opens a new tab page. The window appears, correctly sized and
  // positioned, containing none of this extension: the request sits in the
  // queue and the site waits out its own timeout with nothing to approve.
  const created = await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html#/site-integration'),
    type: 'popup',
    focused: true,
    ...popupSize,
    ...position,
  });
  await setWindowId(created.id);
  return created.id;
};

const closeApprovalWindow = async () => {
  const existingId = await getWindowId();
  await setWindowId(null);

  if (existingId !== null) {
    try {
      await chrome.windows.remove(existingId);
    } catch (err) {
      // Already gone.
    }
  }
};

const requests = {
  pendingKey,
  windowKey,
  list,
  oldest,
  get,
  add,
  remove,
  getWindowId,
  setWindowId,
  openApprovalWindow,
  closeApprovalWindow,
};

export default requests;
