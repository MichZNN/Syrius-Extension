import { isAllowedBridgeUrl } from './bridgeOrigins';

/** Persistent, origin-scoped read permissions for the modern provider. */
const STORAGE_KEY = 'connectedSites';
const MAX_TITLE_LENGTH = 256;

const normalizeOrigin = (origin) => {
  if (!isAllowedBridgeUrl(origin)) {
    return null;
  }

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
};

const safeText = (value) => (
  typeof value === 'string' && value.length <= MAX_TITLE_LENGTH ? value : ''
);

const readAll = async () => {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    const permissions = Object.create(null);

    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return permissions;
    }

    Object.entries(stored).forEach(([origin, entry]) => {
      const normalizedOrigin = normalizeOrigin(origin);
      if (normalizedOrigin && entry && typeof entry === 'object') {
        permissions[normalizedOrigin] = {
          origin: normalizedOrigin,
          title: safeText(entry.title),
          connectedAt: Number.isFinite(Number(entry.connectedAt))
            ? Number(entry.connectedAt)
            : Date.now(),
          lastUsedAt: Number.isFinite(Number(entry.lastUsedAt))
            ? Number(entry.lastUsedAt)
            : Date.now(),
        };
      }
    });

    return permissions;
  } catch {
    return Object.create(null);
  }
};

const writeAll = async (permissions) => {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: permissions });
    return true;
  } catch {
    return false;
  }
};

const isConnected = async (origin) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  const permissions = await readAll();
  return Boolean(permissions[normalizedOrigin]);
};

const list = async () => {
  const permissions = await readAll();
  return Object.values(permissions).sort(
    (left, right) => right.connectedAt - left.connectedAt,
  );
};

const grant = async (origin, metadata = {}) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  const permissions = await readAll();
  const previous = permissions[normalizedOrigin];
  const now = Date.now();
  permissions[normalizedOrigin] = {
    origin: normalizedOrigin,
    title: safeText(metadata.title),
    connectedAt: previous?.connectedAt || now,
    lastUsedAt: now,
  };
  return writeAll(permissions);
};

const touch = async (origin) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  const permissions = await readAll();
  if (!permissions[normalizedOrigin]) {
    return false;
  }

  permissions[normalizedOrigin].lastUsedAt = Date.now();
  return writeAll(permissions);
};

const revoke = async (origin) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  const permissions = await readAll();
  const existed = Boolean(permissions[normalizedOrigin]);
  delete permissions[normalizedOrigin];
  await writeAll(permissions);
  return existed;
};

const revokeAll = async () => writeAll(Object.create(null));

const connectedSites = {
  storageKey: STORAGE_KEY,
  normalizeOrigin,
  isConnected,
  list,
  grant,
  touch,
  revoke,
  revokeAll,
};

export default connectedSites;
