import { fail } from './errors';
// Asking a node whether it is there, independently of the SDK's connection.
//
// A fresh websocket and one call, `ledger.getFrontierMomentum`, with a hard
// deadline. The answer says more than "up": how long it took, the height it is
// at, and which chain it is on — a node that answers for another chain is
// reachable but no use to this wallet. Nothing here touches the SDK singleton,
// so pinging a node never disturbs the connection the wallet is waiting on.

const pingNode = (url, timeoutMs = 4000) => new Promise((resolve) => {
  const started = performance.now();
  let socket = null;
  let timer = null;
  const done = (result) => {
    clearTimeout(timer);
    try { socket?.close(); } catch (error) { /* already closed */ }
    resolve(result);
  };
  timer = setTimeout(() => done({ ok: false, error: `no answer within ${timeoutMs / 1000} s` }), timeoutMs);
  try {
    socket = new WebSocket(url);
  } catch (error) {
    done({ ok: false, error: 'not a node address' });
    return;
  }
  socket.onerror = () => done({ ok: false, error: 'connection failed' });
  socket.onopen = () => socket.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ledger.getFrontierMomentum', params: [] }));
  socket.onmessage = (event) => {
    try {
      const { result } = JSON.parse(event.data);
      if (!result || typeof result.height !== 'number') throw fail(107);
      done({ ok: true, ms: Math.round(performance.now() - started), height: result.height, chainIdentifier: result.chainIdentifier });
    } catch (error) {
      done({ ok: false, error: 'answered, but not as a Zenon node' });
    }
  };
});

export default pingNode;
