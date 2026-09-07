import { Zenon } from 'znn-ts-sdk';
import {
  storeChainIdentifier,
  storeIsConnected,
  storeNodeUrl,
} from '../redux/connectionParametersSlice';
import { walletUnlocked } from '../redux/walletSlice';
import { getAddressInfo, getCurrentNodeUrl, setCurrentNodeUrl } from '../utils/storage';
import { announceUnlock } from './announce';
import session from './session';
import vault from './vault';

// Everything that has to happen between "this is the right password" and "the
// wallet is on screen", in the one order that works.
//
// It was inline in the password screen, and the node connection was awaited in
// the middle of it: if the node was unreachable, `zenon.initialize` threw, the
// catch showed a toast, and the unlock was abandoned — a wallet that would not
// open because a server was down, with no way to reach the node settings that
// would have fixed it. Connecting is attempted here but is not allowed to fail
// the unlock; the header reports the connection separately.

const connectToNode = async (dispatch) => {
  const nodeUrl = getCurrentNodeUrl() || Zenon.getSingleton().defaultServerUrl;
  setCurrentNodeUrl(nodeUrl);
  dispatch(storeNodeUrl(nodeUrl));

  try {
    await Zenon.getSingleton().initialize(nodeUrl, false, 8000);
    dispatch(storeIsConnected(true));
    return true;
  } catch (err) {
    dispatch(storeIsConnected(false));
    return false;
  }
};

// `unlock` is either `{password}` for somebody typing one, or `{entropy}` for
// resuming a session that has not expired. The entropy path skips Argon2id
// entirely, which is the difference between a popup that opens instantly and
// one that hangs for a second every time.
const completeUnlock = async ({ walletName, password, entropy, dispatch }) => {
  if (entropy) {
    vault.unlockWithEntropy(walletName, entropy);
  } else {
    await vault.unlockWithPassword(walletName, password);
  }

  const addressInfo = getAddressInfo(walletName);
  vault.setSelectedIndex(addressInfo.selectedAddressIndex);
  const address = await vault.getAddress();

  dispatch(
    walletUnlocked({
      walletName,
      address,
      selectedAddressIndex: addressInfo.selectedAddressIndex,
      maxAddressIndex: addressInfo.maxAddressIndex,
    })
  );
  dispatch(storeChainIdentifier(Zenon.getChainIdentifier()));

  await session.save({
    walletName,
    entropy: vault.getEntropy(),
    selectedAddressIndex: addressInfo.selectedAddressIndex,
  });

  const isConnected = await connectToNode(dispatch);
  await announceUnlock(address);

  return { address, isConnected };
};

export { completeUnlock, connectToNode };
