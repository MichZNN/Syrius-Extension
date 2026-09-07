/**
 * MV3 service-worker router for bridge requests and temporary wallet sessions.
 * Integration state and session credentials use chrome.storage.session so they
 * survive service-worker suspension but are not written to persistent storage.
 */
import {
  AUTO_LOCK_MINUTES_KEY,
  getAutoLockMinutes,
} from '../../services/security/autoLock';
import { isAllowedBridgeUrl } from '../../services/security/bridgeOrigins';
import connectedSites from '../../services/security/connectedSites';
import {
  isSafeBridgePayload,
  isSafeBridgeError,
  isValidBridgeRequest,
} from '../../services/security/bridgeValidation';
import {
  isSafeProviderRequestId,
  isValidProviderRequest,
  normalizeProviderMethod,
  PROVIDER_ERROR,
} from '../../services/security/providerValidation';
import { isValidSessionEntropy } from '../../services/security/sessionEntropy';
import { isValidNodeUrl } from '../../services/utils/networkDefaults';

const ACTIVE_INTEGRATION_KEY = 'activeIntegration';
const SITE_CONNECTION_KEY = 'siteConnection';
const SESSION_CREDENTIALS_KEY = 'sessionCredentials';
const PUBLIC_WALLET_STATE_KEY = 'publicWalletState';
const PROVIDER_FRAMES_KEY = 'providerFrames';
const SESSION_LOCK_ALARM = 'wallet-session-lock';
const AUTO_LOCK_MINUTES_TO_MS = 60 * 1000;
const INTEGRATION_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
const INVALID_BRIDGE_REQUEST_ERROR = 'Invalid bridge request.';
const GENERIC_BRIDGE_ERROR = 'The wallet could not complete the request.';
const RESERVED_WALLET_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const INTEGRATION_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
let integrationWindowOpening = false;

const integrationRequests = {
  'znn.requestWalletAccess': 'walletAccess',
  'znn.sendTransactionToSigning': 'transactionSigning',
  'znn.sendAccountBlockToSend': 'accountBlockSending',
};

const integrationMessagesByFlow = {
  walletAccess: 'znn.requestWalletAccess',
  transactionSigning: 'znn.sendTransactionToSigning',
  accountBlockSending: 'znn.sendAccountBlockToSend',
};

const providerIntegrationMethods = new Set([
  'znn_connect',
  'znn_sendTransaction',
  'znn_signAndSendBlock',
]);

const forwardedMessages = new Set([
  'znn.grantedWalletRead',
  'znn.deniedWalletRead',
  'znn.signedTransaction',
  'znn.deniedSignTransaction',
  'znn.accountBlockSent',
  'znn.deniedSendAccountBlock',
  'znn.addressChanged',
  'znn.chainIdChanged',
  'znn.nodeChanged',
]);

const forwardedMessagesByFlow = {
  walletAccess: new Set([
    'znn.grantedWalletRead',
    'znn.deniedWalletRead',
    'znn.addressChanged',
    'znn.chainIdChanged',
    'znn.nodeChanged',
  ]),
  transactionSigning: new Set([
    'znn.signedTransaction',
    'znn.deniedSignTransaction',
  ]),
  accountBlockSending: new Set([
    'znn.accountBlockSent',
    'znn.deniedSendAccountBlock',
  ]),
};

const isExtensionSender = (sender) => sender?.id === chrome.runtime.id;

const isContentScriptSender = (sender) => (
  isExtensionSender(sender)
  && Number.isInteger(sender?.tab?.id)
  && sender.tab.id >= 0
  && isAllowedBridgeUrl(sender?.url || sender?.tab?.url)
);

const isExtensionPageSender = (sender) => (
  isExtensionSender(sender)
  && typeof sender?.url === 'string'
  && sender.url.startsWith(chrome.runtime.getURL(''))
  && !Number.isInteger(sender?.tab?.id)
);

// Only the extension popup may read session credentials or send bridge results.
const isWalletUiSender = (sender) => (
  isExtensionPageSender(sender)
  && (() => {
    try {
      return new URL(sender.url).pathname === new URL(
        chrome.runtime.getURL('popup.html'),
      ).pathname;
    } catch {
      return false;
    }
  })()
);

const isSafeSessionWalletName = (name) => (
  typeof name === 'string'
  && name.length > 0
  && name.length <= 512
  && !RESERVED_WALLET_NAMES.has(name)
);

const isSafeSessionEntropy = (entropy) => {
  return isValidSessionEntropy(entropy);
};

const isSafeIntegrationRequestId = (requestId) => (
  typeof requestId === 'string'
  && INTEGRATION_REQUEST_ID_PATTERN.test(requestId)
);

// Keep session storage unavailable to content scripts even if the access
// level is changed by a future extension page.
if (typeof chrome.storage.session.setAccessLevel === 'function') {
  try {
    const accessLevelChange = chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
    accessLevelChange?.catch?.(() => undefined);
  } catch {
    // A browser without this optional API still receives the sender checks below.
  }
}

const getStoredValue = async (key) => {
  const result = await chrome.storage.session.get(key);
  return result[key];
};

const readProviderFrames = async () => {
  const storedFrames = await getStoredValue(PROVIDER_FRAMES_KEY);
  const frames = Object.create(null);

  if (!storedFrames || typeof storedFrames !== 'object' || Array.isArray(storedFrames)) {
    return frames;
  }

  Object.entries(storedFrames).forEach(([key, frame]) => {
    if (frame
      && Number.isInteger(frame.tabId)
      && frame.tabId >= 0
      && Number.isInteger(frame.frameId)
      && frame.frameId >= 0
      && isAllowedBridgeUrl(frame.origin)) {
      frames[key] = {
        tabId: frame.tabId,
        frameId: frame.frameId,
        origin: new URL(frame.origin).origin,
      };
    }
  });

  return frames;
};

const writeProviderFrames = async (frames) => {
  await chrome.storage.session.set({ [PROVIDER_FRAMES_KEY]: frames });
};

const providerFrameKey = (tabId, frameId) => `${tabId}:${frameId}`;

const registerProviderFrame = async (sender) => {
  const origin = new URL(sender.url || sender.tab.url).origin;
  const frames = await readProviderFrames();
  frames[providerFrameKey(sender.tab.id, sender.frameId ?? 0)] = {
    tabId: sender.tab.id,
    frameId: sender.frameId ?? 0,
    origin,
  };
  await writeProviderFrames(frames);
};

const forgetProviderFrames = async (predicate) => {
  const frames = await readProviderFrames();
  let changed = false;

  Object.keys(frames).forEach((key) => {
    if (predicate(frames[key])) {
      delete frames[key];
      changed = true;
    }
  });

  if (changed) {
    await writeProviderFrames(frames);
  }
};

const sendProviderMessage = async (target, message) => {
  try {
    await chrome.tabs.sendMessage(target.tabId, {
      channel: 'provider',
      ...message,
    }, { frameId: target.frameId });
    return true;
  } catch {
    return false;
  }
};

const broadcastProviderEvent = async (event, data, origins = null) => {
  const allowedOrigins = origins
    ? new Set(origins)
    : new Set((await connectedSites.list()).map((site) => site.origin));

  if (allowedOrigins.size === 0) {
    return;
  }

  const frames = await readProviderFrames();
  await Promise.all(Object.values(frames)
    .filter((frame) => allowedOrigins.has(frame.origin))
    .map((frame) => sendProviderMessage(frame, {
      kind: 'event',
      event,
      data,
    })));
};

const isValidPublicWalletState = (state) => (
  state
  && typeof state === 'object'
  && typeof state.address === 'string'
  && state.address.length > 0
  && state.address.length <= 128
  && Number.isSafeInteger(Number(state.chainId))
  && Number(state.chainId) >= 0
  && isValidNodeUrl(state.nodeUrl)
);

const getPublicWalletState = async () => {
  const credentials = await getCredentials({ touch: false });
  if (!credentials) {
    return null;
  }

  const state = await getStoredValue(PUBLIC_WALLET_STATE_KEY);
  return isValidPublicWalletState(state)
    ? {
      address: state.address,
      chainId: Number(state.chainId),
      nodeUrl: state.nodeUrl,
    }
    : null;
};

const clearCredentialSession = async () => {
  await chrome.storage.session.remove([
    SESSION_CREDENTIALS_KEY,
    ACTIVE_INTEGRATION_KEY,
    SITE_CONNECTION_KEY,
    PUBLIC_WALLET_STATE_KEY,
  ]);
  await chrome.alarms.clear(SESSION_LOCK_ALARM);
  await broadcastProviderEvent('accountsChanged', []);
};

const getLastActivityAt = (credentials) => Number(
  credentials.lastActivityAt ?? credentials.timestamp,
);

/**
 * Schedule the alarm for the current inactivity deadline.
 * A minimum delay of 30 seconds gives the alarm service enough time to run;
 * getCredentials performs the exact expiry check when the alarm fires.
 */
const scheduleCredentialLock = async (credentials) => {
  const lastActivityAt = getLastActivityAt(credentials);

  if (!Number.isFinite(lastActivityAt)
    || lastActivityAt <= 0
    || lastActivityAt > Date.now()) {
    await clearCredentialSession();
    return false;
  }

  const autoLockMinutes = await getAutoLockMinutes();
  const remainingMilliseconds = (autoLockMinutes * AUTO_LOCK_MINUTES_TO_MS)
    - (Date.now() - lastActivityAt);

  if (remainingMilliseconds <= 0) {
    await clearCredentialSession();
    return false;
  }

  await chrome.alarms.create(SESSION_LOCK_ALARM, {
    delayInMinutes: Math.max(remainingMilliseconds / AUTO_LOCK_MINUTES_TO_MS, 0.5),
  });

  return true;
};

const buildIntegrationRequest = (request, sender, providerRequest = null) => {
  const requestId = globalThis.crypto?.randomUUID?.();
  if (!isSafeIntegrationRequestId(requestId)) {
    throw new Error('The bridge request could not be initialized.');
  }

  const integrationRequest = {
    requestId,
    currentIntegrationFlow: integrationRequests[request.message],
    siteTabId: sender.tab.id,
    siteFrameId: Number.isInteger(sender.frameId) ? sender.frameId : 0,
    siteOrigin: new URL(sender.url || sender.tab.url).origin,
    createdAt: Date.now(),
    windowId: null,
  };

  if (request.message === 'znn.sendTransactionToSigning') {
    integrationRequest.transactionData = request.params;
  }

  if (request.message === 'znn.sendAccountBlockToSend') {
    integrationRequest.accountBlockData = request.params;
  }

  if (providerRequest) {
    integrationRequest.providerRequestId = providerRequest.id;
    integrationRequest.providerMethod = providerRequest.method;
    integrationRequest.providerFrameId = providerRequest.frameId;
  }

  return integrationRequest;
};

const openIntegrationWindow = async (request, sender, providerRequest = null) => {
  if (integrationWindowOpening) {
    throw new Error('Another bridge approval is already in progress.');
  }
  integrationWindowOpening = true;
  let storedRequest = false;

  try {
    if (!isValidBridgeRequest(request.message, request.params)) {
      throw new Error(INVALID_BRIDGE_REQUEST_ERROR);
    }

    const activeIntegration = await getStoredValue(ACTIVE_INTEGRATION_KEY);
    const activeIntegrationCreatedAt = Number(activeIntegration?.createdAt);
    if (Number.isFinite(activeIntegrationCreatedAt)
      && activeIntegrationCreatedAt > 0
      && activeIntegrationCreatedAt <= Date.now()
      && Date.now() - activeIntegrationCreatedAt <= INTEGRATION_REQUEST_TIMEOUT_MS) {
      throw new Error('Another bridge approval is already in progress.');
    }

    const integrationRequest = buildIntegrationRequest(request, sender, providerRequest);

    // Persist before opening the page: the popup can load before windows.create
    // resolves, and service workers can be suspended between events.
    await chrome.storage.session.set({
      [ACTIVE_INTEGRATION_KEY]: integrationRequest,
      [SITE_CONNECTION_KEY]: {
        tabId: sender.tab.id,
        createdAt: integrationRequest.createdAt,
      },
    });
    storedRequest = true;

    const integrationWindow = await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 376,
        height: 650,
        focused: true,
      });

    if (!Number.isInteger(integrationWindow?.id)) {
      throw new Error('The Syrius approval window could not be opened.');
    }

    await chrome.storage.session.set({
    [ACTIVE_INTEGRATION_KEY]: {
        ...integrationRequest,
        windowId: integrationWindow.id,
      },
    });
  } catch (error) {
    if (storedRequest) {
      await chrome.storage.session.remove([
        ACTIVE_INTEGRATION_KEY,
        SITE_CONNECTION_KEY,
      ]);
    }
    throw error;
  } finally {
    integrationWindowOpening = false;
  }
};

const getActiveIntegration = async () => {
  const integrationRequest = await getStoredValue(ACTIVE_INTEGRATION_KEY);

  if (!Number.isFinite(Number(integrationRequest?.createdAt))) {
    return null;
  }

  const createdAt = Number(integrationRequest.createdAt);
  if (createdAt <= 0
    || createdAt > Date.now()
    || Date.now() - createdAt > INTEGRATION_REQUEST_TIMEOUT_MS) {
    await chrome.storage.session.remove([
      ACTIVE_INTEGRATION_KEY,
      SITE_CONNECTION_KEY,
    ]);
    return null;
  }

  const integrationMessage = integrationMessagesByFlow[integrationRequest.currentIntegrationFlow];
  const integrationData = integrationMessage === 'znn.sendTransactionToSigning'
    ? integrationRequest.transactionData
    : integrationMessage === 'znn.sendAccountBlockToSend'
      ? integrationRequest.accountBlockData
      : undefined;

  if (!isSafeIntegrationRequestId(integrationRequest.requestId)
    || !Number.isInteger(integrationRequest.siteTabId)
    || integrationRequest.siteTabId < 0
    || !isAllowedBridgeUrl(integrationRequest.siteOrigin)
    || !isValidBridgeRequest(integrationMessage, integrationData)
    || (integrationRequest.providerRequestId !== undefined
      && (!isSafeProviderRequestId(integrationRequest.providerRequestId)
        || !providerIntegrationMethods.has(integrationRequest.providerMethod)
        || !Number.isInteger(integrationRequest.providerFrameId)
        || integrationRequest.providerFrameId < 0
        || integrationRequest.providerFrameId !== integrationRequest.siteFrameId))) {
    await chrome.storage.session.remove([
      ACTIVE_INTEGRATION_KEY,
      SITE_CONNECTION_KEY,
    ]);
    return null;
  }

  return {
    requestId: integrationRequest.requestId,
    currentIntegrationFlow: integrationRequest.currentIntegrationFlow,
    siteTabId: integrationRequest.siteTabId,
    siteFrameId: integrationRequest.siteFrameId,
    siteOrigin: integrationRequest.siteOrigin,
    transactionData: integrationRequest.transactionData,
    accountBlockData: integrationRequest.accountBlockData,
    windowId: integrationRequest.windowId,
    providerRequestId: integrationRequest.providerRequestId,
    providerMethod: integrationRequest.providerMethod,
    providerFrameId: integrationRequest.providerFrameId,
  };
};

const getSiteTabId = async () => {
  const activeIntegration = await getActiveIntegration();
  if (!activeIntegration || !Number.isInteger(activeIntegration.siteTabId)) {
    return null;
  }

  const siteConnection = await getStoredValue(SITE_CONNECTION_KEY);
  const siteTabId = activeIntegration.siteTabId;

  if (siteConnection?.tabId !== siteTabId) {
    return null;
  }

  const siteTab = await chrome.tabs.get(siteTabId);
  if (!isAllowedBridgeUrl(siteTab?.url)
    || new URL(siteTab.url).origin !== activeIntegration.siteOrigin) {
    return null;
  }

  return siteTabId;
};

const closeProviderIntegration = async (integrationRequest) => {
  await chrome.storage.session.remove([
    ACTIVE_INTEGRATION_KEY,
    SITE_CONNECTION_KEY,
  ]);

  if (Number.isInteger(integrationRequest.windowId)) {
    try {
      await chrome.windows.remove(integrationRequest.windowId);
    } catch {
      // The approval window may already have been closed by the user.
    }
  }
};

const forwardProviderResponse = async (request, activeIntegration) => {
  const successMessages = {
    znn_connect: 'znn.grantedWalletRead',
    znn_sendTransaction: 'znn.signedTransaction',
    znn_signAndSendBlock: 'znn.accountBlockSent',
  };
  const denialMessages = new Set([
    'znn.deniedWalletRead',
    'znn.deniedSignTransaction',
    'znn.deniedSendAccountBlock',
  ]);
  const expectedSuccessMessage = successMessages[activeIntegration.providerMethod];
  const expectedDenialMessage = {
    znn_connect: 'znn.deniedWalletRead',
    znn_sendTransaction: 'znn.deniedSignTransaction',
    znn_signAndSendBlock: 'znn.deniedSendAccountBlock',
  }[activeIntegration.providerMethod];

  if (request.message !== expectedSuccessMessage
    && request.message !== expectedDenialMessage) {
    return false;
  }

  const siteTabId = await getSiteTabId();
  if (!Number.isInteger(siteTabId)) {
    return false;
  }

  let result;
  let error;
  if (request.message === expectedDenialMessage && denialMessages.has(request.message)) {
    error = PROVIDER_ERROR.userRejected;
  } else if (!Object.prototype.hasOwnProperty.call(request, 'data')
    || !isSafeBridgePayload(request.data)) {
    error = PROVIDER_ERROR.internal;
  } else if (activeIntegration.providerMethod === 'znn_connect') {
    const address = request.data?.address;
    if (typeof address !== 'string' || address.length === 0 || address.length > 128) {
      error = PROVIDER_ERROR.internal;
    } else {
      const granted = await connectedSites.grant(activeIntegration.siteOrigin);
      if (!granted) {
        error = PROVIDER_ERROR.internal;
      } else {
        result = [address];
      }
    }
  } else {
    result = request.data;
  }

  await sendProviderMessage({
    tabId: siteTabId,
    frameId: activeIntegration.providerFrameId,
  }, {
    kind: 'response',
    id: activeIntegration.providerRequestId,
    result,
    error,
  });
  await closeProviderIntegration(activeIntegration);
  return true;
};

const forwardToSite = async (request) => {
  const activeIntegration = await getActiveIntegration();
  if (!activeIntegration
    || request.requestId !== activeIntegration.requestId) {
    return false;
  }

  if (activeIntegration.providerRequestId !== undefined) {
    return forwardProviderResponse(request, activeIntegration);
  }

  if (!forwardedMessagesByFlow[activeIntegration.currentIntegrationFlow]?.has(request.message)) {
    return false;
  }

  const siteTabId = await getSiteTabId();

  if (!Number.isInteger(siteTabId)) {
    return false;
  }

  if (activeIntegration.currentIntegrationFlow === 'walletAccess'
    && request.message === 'znn.grantedWalletRead'
    && !(await connectedSites.grant(activeIntegration.siteOrigin))) {
    return false;
  }

  const message = { message: request.message };

  if (Object.prototype.hasOwnProperty.call(request, 'data')) {
    if (!isSafeBridgePayload(request.data)) {
      return false;
    }

    message.data = request.data;
  }

  if (Object.prototype.hasOwnProperty.call(request, 'error')
    && isSafeBridgeError(request.error)) {
    message.error = request.error;
  }

  await chrome.tabs.sendMessage(siteTabId, message, {
    frameId: activeIntegration.siteFrameId || 0,
  });
  return true;
};

const storeCredentials = async (data) => {
  if (!isSafeSessionWalletName(data?.name)
    || !isSafeSessionEntropy(data?.entropy)
    || Object.prototype.hasOwnProperty.call(data || {}, 'password')) {
    return false;
  }

  const timestamp = Date.now();
  const credentials = {
    name: data.name,
    entropy: data.entropy,
    timestamp,
    lastActivityAt: timestamp,
  };

  await chrome.storage.session.set({
    [SESSION_CREDENTIALS_KEY]: credentials,
  });
  await scheduleCredentialLock(credentials);

  return true;
};

const isValidStoredCredentials = (credentials) => (
  isSafeSessionWalletName(credentials?.name)
  && isSafeSessionEntropy(credentials?.entropy)
  && !Object.prototype.hasOwnProperty.call(credentials || {}, 'password')
  && Number.isFinite(Number(credentials.timestamp))
  && Number(credentials.timestamp) > 0
);

/**
 * Read the temporary session and optionally refresh its inactivity deadline.
 * Internal health checks pass touch: false so checking a session does not keep it unlocked.
 */
const getCredentials = async ({ touch = true } = {}) => {
  const credentials = await getStoredValue(SESSION_CREDENTIALS_KEY);

  if (!isValidStoredCredentials(credentials)) {
    await clearCredentialSession();
    return false;
  }

  const lastActivityAt = getLastActivityAt(credentials);
  const autoLockMinutes = await getAutoLockMinutes();

  if (!Number.isFinite(lastActivityAt)
    || lastActivityAt <= 0
    || lastActivityAt > Date.now()
    || Date.now() - lastActivityAt >= autoLockMinutes * AUTO_LOCK_MINUTES_TO_MS) {
    await clearCredentialSession();
    return false;
  }

  if (!touch) {
    return {
      name: credentials.name,
      entropy: credentials.entropy,
      timestamp: Number(credentials.timestamp),
      lastActivityAt,
    };
  }

  const updatedCredentials = {
    name: credentials.name,
    entropy: credentials.entropy,
    timestamp: Number(credentials.timestamp),
    lastActivityAt: Date.now(),
  };

  await chrome.storage.session.set({
    [SESSION_CREDENTIALS_KEY]: updatedCredentials,
  });
  await scheduleCredentialLock(updatedCredentials);

  return updatedCredentials;
};

const touchCredentials = async () => Boolean(await getCredentials());

const checkCredentials = async () => Boolean(await getCredentials({ touch: false }));

const providerLegacyMessageByMethod = {
  znn_connect: 'znn.requestWalletAccess',
  znn_sendTransaction: 'znn.sendTransactionToSigning',
  znn_signAndSendBlock: 'znn.sendAccountBlockToSend',
};

const handleProviderRequest = async (request, sender) => {
  const origin = new URL(sender.url || sender.tab.url).origin;
  const providerMethod = normalizeProviderMethod(request.method);
  const target = {
    tabId: sender.tab.id,
    frameId: Number.isInteger(sender.frameId) ? sender.frameId : 0,
  };

  if (!isValidProviderRequest(request)) {
    await sendProviderMessage(target, {
      kind: 'response',
      id: request?.id,
      error: PROVIDER_ERROR.internal,
    });
    return;
  }

  try {
    if (providerMethod === 'znn_accounts') {
      const state = await getPublicWalletState();
      const isConnected = await connectedSites.isConnected(origin);
      await sendProviderMessage(target, {
        kind: 'response',
        id: request.id,
        result: isConnected && state?.address ? [state.address] : [],
      });
      return;
    }

    if (providerMethod === 'znn_chainId' || providerMethod === 'znn_nodeUrl') {
      const state = await getPublicWalletState();
      await sendProviderMessage(target, {
        kind: 'response',
        id: request.id,
        result: state?.[providerMethod === 'znn_chainId' ? 'chainId' : 'nodeUrl'] || null,
      });
      return;
    }

    if (providerMethod === 'znn_disconnect') {
      await broadcastProviderEvent('accountsChanged', [], [origin]);
      await broadcastProviderEvent('disconnect', PROVIDER_ERROR.disconnected, [origin]);
      await connectedSites.revoke(origin);
      await sendProviderMessage(target, {
        kind: 'response',
        id: request.id,
        result: true,
      });
      return;
    }

    if (providerMethod !== 'znn_connect'
      && !(await connectedSites.isConnected(origin))) {
      await sendProviderMessage(target, {
        kind: 'response',
        id: request.id,
        error: PROVIDER_ERROR.unauthorized,
      });
      return;
    }

    if (providerMethod === 'znn_connect') {
      const state = await getPublicWalletState();
      if ((await connectedSites.isConnected(origin)) && state?.address) {
        await connectedSites.touch(origin);
        await sendProviderMessage(target, {
          kind: 'response',
          id: request.id,
          result: [state.address],
        });
        return;
      }
    }

    const legacyMessage = providerLegacyMessageByMethod[providerMethod];
    await openIntegrationWindow({
      message: legacyMessage,
      params: request.params,
    }, sender, {
      id: request.id,
      method: providerMethod,
      frameId: target.frameId,
    });
  } catch {
    await sendProviderMessage(target, {
      kind: 'response',
      id: request.id,
      error: PROVIDER_ERROR.internal,
    });
  }
};

const publishWalletState = async (data) => {
  const credentials = await getCredentials({ touch: false });
  if (!credentials || !data || typeof data !== 'object') {
    return false;
  }

  const previousState = await getStoredValue(PUBLIC_WALLET_STATE_KEY);
  const nextState = {
    ...(isValidPublicWalletState(previousState) ? previousState : {}),
    ...data,
  };

  if (!isValidPublicWalletState(nextState)) {
    return false;
  }

  const normalizedState = {
    address: nextState.address,
    chainId: Number(nextState.chainId),
    nodeUrl: nextState.nodeUrl,
  };
  await chrome.storage.session.set({
    [PUBLIC_WALLET_STATE_KEY]: normalizedState,
  });

  if (previousState?.address !== normalizedState.address) {
    await broadcastProviderEvent('accountsChanged', [normalizedState.address]);
  }
  if (Number(previousState?.chainId) !== normalizedState.chainId) {
    await broadcastProviderEvent('chainChanged', normalizedState.chainId);
  }
  if (previousState?.nodeUrl !== normalizedState.nodeUrl) {
    await broadcastProviderEvent('nodeChanged', normalizedState.nodeUrl);
  }

  return true;
};

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SESSION_LOCK_ALARM) {
    return;
  }

  getCredentials({ touch: false })
    .then((credentials) => credentials && scheduleCredentialLock(credentials))
    .catch(() => undefined);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[AUTO_LOCK_MINUTES_KEY]) {
    return;
  }

  getStoredValue(SESSION_CREDENTIALS_KEY)
    .then((credentials) => {
      if (credentials) {
        return scheduleCredentialLock(credentials);
      }

      return chrome.alarms.clear(SESSION_LOCK_ALARM);
    })
    .catch(() => undefined);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request !== 'object') {
    return false;
  }

  if (request.channel === 'provider') {
    if (request.kind === 'hello') {
      if (isContentScriptSender(sender)) {
        registerProviderFrame(sender).catch(() => undefined);
      }
      return false;
    }

    if (request.kind === 'request') {
      if (!isContentScriptSender(sender)) {
        return false;
      }

      handleProviderRequest(request, sender).catch(() => undefined);
      sendResponse({ accepted: true });
      return false;
    }

    return false;
  }

  if (typeof request.message !== 'string') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(integrationRequests, request.message)) {
    if (!isContentScriptSender(sender)) {
      sendResponse({ ok: false, error: 'Invalid integration sender.' });
      return false;
    }

    openIntegrationWindow(request, sender)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({
        ok: false,
        error: GENERIC_BRIDGE_ERROR,
      }));

    return true;
  }

  if (forwardedMessages.has(request.message)) {
    if (!isWalletUiSender(sender)) {
      return false;
    }

    forwardToSite(request)
      .then((forwarded) => sendResponse({ ok: forwarded }))
      .catch(() => sendResponse({ ok: false, error: GENERIC_BRIDGE_ERROR }));

    return true;
  }

  if (!isWalletUiSender(sender)) {
    return false;
  }

  if (request.message === 'internal.getIntegrationRequest') {
    getActiveIntegration()
      .then((integrationRequest) => sendResponse(integrationRequest))
      .catch(() => sendResponse(null));

    return true;
  }

  if (request.message === 'internal.isIntegrationRequestActive') {
    if (!isSafeIntegrationRequestId(request.requestId)) {
      sendResponse({ active: false });
      return false;
    }

    getActiveIntegration()
      .then((integrationRequest) => sendResponse({
        active: integrationRequest?.requestId === request.requestId,
      }))
      .catch(() => sendResponse({ active: false }));

    return true;
  }

  if (request.message === 'internal.getCredentialsFromBackgroundScript') {
    getCredentials()
      .then((credentials) => sendResponse(credentials))
      .catch(() => sendResponse(false));

    return true;
  }

  if (request.message === 'internal.touchCredentials') {
    touchCredentials()
      .then((active) => sendResponse({ active }))
      .catch(() => sendResponse({ active: null }));

    return true;
  }

  if (request.message === 'internal.checkCredentials') {
    checkCredentials()
      .then((active) => sendResponse({ active }))
      .catch(() => sendResponse({ active: null }));

    return true;
  }

  if (request.message === 'internal.publishWalletState') {
    publishWalletState(request.data)
      .then((published) => sendResponse({ ok: published }))
      .catch(() => sendResponse({ ok: false, error: GENERIC_BRIDGE_ERROR }));

    return true;
  }

  if (request.message === 'internal.getConnectedSites') {
    connectedSites.list()
      .then((sites) => sendResponse(sites))
      .catch(() => sendResponse([]));

    return true;
  }

  if (request.message === 'internal.revokeConnectedSite') {
    if (!isAllowedBridgeUrl(request.origin)) {
      sendResponse({ ok: false });
      return false;
    }

    connectedSites.revoke(request.origin)
      .then(async (revoked) => {
        await broadcastProviderEvent('accountsChanged', [], [new URL(request.origin).origin]);
        sendResponse({ ok: revoked });
      })
      .catch(() => sendResponse({ ok: false, error: GENERIC_BRIDGE_ERROR }));

    return true;
  }

  if (request.message === 'internal.revokeAllConnectedSites') {
    connectedSites.list()
      .then(async (sites) => {
        const revoked = await connectedSites.revokeAll();
        await Promise.all(sites.map((site) => (
          broadcastProviderEvent('accountsChanged', [], [site.origin])
        )));
        sendResponse({ ok: revoked });
      })
      .catch(() => sendResponse({ ok: false, error: GENERIC_BRIDGE_ERROR }));

    return true;
  }

  if (request.message === 'internal.storeCredentialsToBackgroundScript') {
    storeCredentials(request.data)
      .then((stored) => sendResponse({ ok: stored }))
      .catch(() => sendResponse({
        ok: false,
        error: GENERIC_BRIDGE_ERROR,
      }));

    return true;
  }

  if (request.message === 'internal.clearCredentialsOfBackgroundScript') {
    clearCredentialSession()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({
        ok: false,
        error: GENERIC_BRIDGE_ERROR,
      }));

    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetProviderFrames((frame) => frame.tabId === tabId).catch(() => undefined);
  Promise.all([
    getStoredValue(SITE_CONNECTION_KEY),
    getStoredValue(ACTIVE_INTEGRATION_KEY),
  ]).then(([siteConnection, activeIntegration]) => {
    const keysToRemove = [];

    if (siteConnection?.tabId === tabId) {
      keysToRemove.push(SITE_CONNECTION_KEY);
    }

    if (activeIntegration?.siteTabId === tabId) {
      keysToRemove.push(ACTIVE_INTEGRATION_KEY);
    }

    if (keysToRemove.length > 0) {
      return chrome.storage.session.remove(keysToRemove);
    }

    return undefined;
  }).catch(() => undefined);
});

chrome.windows.onRemoved.addListener((windowId) => {
  getStoredValue(ACTIVE_INTEGRATION_KEY)
    .then((activeIntegration) => {
      if (activeIntegration?.windowId === windowId) {
        const providerResponse = activeIntegration.providerRequestId
          ? sendProviderMessage({
            tabId: activeIntegration.siteTabId,
            frameId: activeIntegration.providerFrameId,
          }, {
            kind: 'response',
            id: activeIntegration.providerRequestId,
            error: PROVIDER_ERROR.userRejected,
          })
          : Promise.resolve();

        return providerResponse.then(() => chrome.storage.session.remove([
          ACTIVE_INTEGRATION_KEY,
          SITE_CONNECTION_KEY,
        ]));
      }

      return undefined;
    })
    .catch(() => undefined);
});
