import './storageRelay';
import { Zenon } from 'znn-ts-sdk';
import { startBackgroundReceive } from '../../services/wallet/backgroundReceive';
import { getCurrentNodeUrl } from '../../services/utils/storage';
import startBlockHost from './blockHost';

// The background page for block work: while a timed unlock lasts it receives
// incoming blocks (wallet/backgroundReceive.js) and runs the popup's sends
// (./blockHost.js), proof of work included, so none of it stops when the
// popup closes. The background opens it and closes it again on lock
// (sections/Background/receiver.js). It shows nothing.

// The node the wallet is set to, reconnected when that setting changes or the
// socket has dropped. Without one there is nothing to do.
const connect = async () => {
  const url = getCurrentNodeUrl();
  if (!url) return false;
  const zenon = Zenon.getSingleton();
  const client = zenon.wsClient;
  if (client?.url === url && client._wsRpc2Client && !client._wsRpc2Client.isClosed) return true;
  try { zenon.clearSocketConnection(); } catch (error) { /* nothing open */ }
  await zenon.initialize(url, false, 8000);
  return true;
};
// One attempt at a time, shared by whoever asks during it.
let connecting = null;
const connected = () => {
  connecting = connecting || connect().finally(() => { connecting = null; });
  return connecting;
};

const receiver = startBackgroundReceive({ follow: true, ready: connected });
startBlockHost({ ready: connected, receiver });
