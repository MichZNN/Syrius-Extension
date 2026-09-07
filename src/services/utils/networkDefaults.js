/**
 * Built-in Zenon node and chain defaults.
 *
 * Saved node URLs keep an associated chain ID so selecting a configured node
 * can restore both connection parameters. Existing nodeList entries remain
 * URL strings for backward compatibility.
 */
export const NODE_CHAIN_ID_STORAGE_KEY = "nodeChainIdMap";
export const DEFAULT_MAINNET_CHAIN_ID = 1;
export const DEFAULT_TESTNET_CHAIN_ID = 3;
export const DEFAULT_MAINNET_NODE_URL = "wss://node.zenonhub.io:35998";
export const DEFAULT_TESTNET_NODE_URL = "wss://rpc.testnet.zenon.info";

export const DEFAULT_NODE_CONFIGS = [
  {
    url: "wss://127.0.0.1:35998",
    chainId: DEFAULT_MAINNET_CHAIN_ID,
  },
  {
    url: DEFAULT_MAINNET_NODE_URL,
    chainId: DEFAULT_MAINNET_CHAIN_ID,
  },
  {
    url: "wss://my.hc1node.com:35998",
    chainId: DEFAULT_MAINNET_CHAIN_ID,
  },
  {
    url: "wss://node.atsocy.com:35998",
    chainId: DEFAULT_MAINNET_CHAIN_ID,
  },
  {
    url: DEFAULT_TESTNET_NODE_URL,
    chainId: DEFAULT_TESTNET_CHAIN_ID,
  },
];

export const DEFAULT_NODE_URLS = DEFAULT_NODE_CONFIGS.map(({ url }) => url);
export const DEFAULT_CHAIN_IDS = [
  DEFAULT_MAINNET_CHAIN_ID,
  DEFAULT_TESTNET_CHAIN_ID,
];

/** Only encrypted WebSocket endpoints may be added or restored. */
export const isValidNodeUrl = (nodeUrl) => {
  if (typeof nodeUrl !== "string" || nodeUrl.length > 2048) {
    return false;
  }

  try {
    const parsedUrl = new URL(nodeUrl);
    return parsedUrl.protocol === "wss:"
      && Boolean(parsedUrl.hostname)
      && parsedUrl.username === ""
      && parsedUrl.password === ""
      && parsedUrl.search === ""
      && parsedUrl.hash === "";
  } catch {
    return false;
  }
};

const LEGACY_NODE_URLS = [
  "wss://syrius-mainnet.zenon.community",
  "wss://syrius-testnet.zenon.community",
  "wss://secure.deeznnodez.com:35998",
  "ws://127.0.0.1:35998",
];

const LEGACY_TESTNET_NODE_URLS = [
  "wss://syrius-testnet.zenon.community",
];

// Map obsolete built-in entries to the requested endpoints while preserving
// custom node URLs already saved by the user.
export const resolveNodeUrl = (nodeUrl) => {
  if (LEGACY_TESTNET_NODE_URLS.includes(nodeUrl)) {
    return DEFAULT_TESTNET_NODE_URL;
  }

  if (isValidNodeUrl(nodeUrl) && !LEGACY_NODE_URLS.includes(nodeUrl)) {
    return nodeUrl;
  }

  return DEFAULT_MAINNET_NODE_URL;
};

export const mergeNodeUrls = (nodeItems, currentNodeUrl) => {
  const savedNodeItems = Array.isArray(nodeItems) ? nodeItems : [];
  const updatedNodes = savedNodeItems.filter(
    (node) => isValidNodeUrl(node) && !LEGACY_NODE_URLS.includes(node)
  );

  DEFAULT_NODE_URLS.forEach((node) => {
    if (!updatedNodes.includes(node)) {
      updatedNodes.push(node);
    }
  });

  if (currentNodeUrl && !updatedNodes.includes(currentNodeUrl)) {
    updatedNodes.push(currentNodeUrl);
  }

  return updatedNodes;
};

const isValidChainId = (chainId) => {
  if (
    chainId === null ||
    chainId === undefined ||
    (typeof chainId === "string" && chainId.trim() === "")
  ) {
    return false;
  }

  const normalizedChainId = Number(chainId);
  return Number.isSafeInteger(normalizedChainId) && normalizedChainId >= 0;
};

/** Return the default network identifier associated with a built-in node. */
export const getDefaultChainIdForNode = (nodeUrl) => {
  const nodeConfig = DEFAULT_NODE_CONFIGS.find(({ url }) => url === nodeUrl);
  return nodeConfig?.chainId ?? DEFAULT_MAINNET_CHAIN_ID;
};

/**
 * Resolve a saved node's Chain ID, falling back to mainnet for unknown nodes.
 */
export const getNodeChainId = (nodeUrl, nodeChainIds = {}) => {
  const savedChainId = nodeChainIds?.[nodeUrl];
  return isValidChainId(savedChainId)
    ? Number(savedChainId)
    : getDefaultChainIdForNode(nodeUrl);
};

/**
 * Normalize stored node/Chain ID associations and add associations for all
 * built-in or currently selected nodes.
 */
export const mergeNodeChainIds = (
  nodeItems,
  currentNodeUrl,
  nodeChainIds = {}
) => {
  const updatedNodeChainIds = Object.create(null);
  const savedNodeItems = Array.isArray(nodeItems) ? nodeItems : [];

  if (
    nodeChainIds &&
    typeof nodeChainIds === "object" &&
    !Array.isArray(nodeChainIds)
  ) {
    Object.entries(nodeChainIds).forEach(([nodeUrl, chainId]) => {
      if (isValidNodeUrl(nodeUrl) && isValidChainId(chainId)) {
        updatedNodeChainIds[nodeUrl] = Number(chainId);
      }
    });
  }

  DEFAULT_NODE_CONFIGS.forEach(({ url, chainId }) => {
    if (!Object.prototype.hasOwnProperty.call(updatedNodeChainIds, url)) {
      updatedNodeChainIds[url] = chainId;
    }
  });

  savedNodeItems.forEach((nodeUrl) => {
    if (
      isValidNodeUrl(nodeUrl) &&
      !Object.prototype.hasOwnProperty.call(updatedNodeChainIds, nodeUrl)
    ) {
      updatedNodeChainIds[nodeUrl] = getDefaultChainIdForNode(nodeUrl);
    }
  });

  if (
    currentNodeUrl &&
    !Object.prototype.hasOwnProperty.call(updatedNodeChainIds, currentNodeUrl)
  ) {
    updatedNodeChainIds[currentNodeUrl] =
      getDefaultChainIdForNode(currentNodeUrl);
  }

  return updatedNodeChainIds;
};
