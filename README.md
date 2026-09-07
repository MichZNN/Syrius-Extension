# Syrius Extension

Syrius is a non-custodial browser wallet extension for the [Zenon Network of Momentum](https://zenon.org/). It can approve wallet access, sign transactions and send account blocks from compatible Zenon bridge applications.

This repository is being modernized for Node.js 24 and Chromium Manifest V3. It is experimental software: always verify the target address, token, amount, network and node before approving a request.

## Supported bridge origins

The extension injects its bridge adapter only on these explicitly configured origins:

| Origin | Status |
| --- | --- |
| `https://nom-bridge.0x3639.com/` | Configured |
| `https://bridge.bagswap.com/` | Configured |
| `https://staging.bridge.bagswap.com/` | Configured staging origin |
| `https://bridge.0x3639.com/` | Configured |
| `https://staging.bridge.0x3639.com/` | Configured staging origin |
| `https://bridge.mainnet.zenon.community/` | Kept for future use; currently offline |
| `http://testnet.bridge.0x3639.com/` | Kept for future testnet use; HTTP is intentional |

The HTTP testnet origin is not suitable for sensitive production use. It is retained because it was requested as a future compatibility target; use HTTPS whenever that deployment becomes available.

## Requirements

- Node.js 24.x and npm 10 or newer.
- Chrome 102 or a compatible Chromium browser such as Brave.
- A Zenon node reachable from the browser for wallet reads and transactions.

The project pins the intended major Node.js version in [`.nvmrc`](.nvmrc) and declares the runtime requirement in [`package.json`](package.json).

## Build from source

```bash
git clone https://github.com/MichZNN/syrius-extension.git
cd syrius-extension
npm ci --legacy-peer-deps
npm run build
```

The production extension is written to `build/`. The legacy peer-dependency flag is currently required by the existing React/SDK dependency tree; dependency upgrades should be validated together with the wallet SDK before removing it.

## Automated Chrome/Brave package

The [GitHub Actions workflow](.github/workflows/build-and-release.yml) builds a
production package with Node.js 24, runs the dependency audit and lint checks,
and creates a ZIP named
`syrius-extension-<manifest-version>-chrome-brave.zip`. The ZIP contains
`manifest.json` at its root and is suitable for loading as an unpacked
extension in Chrome, Brave and other Chromium browsers. A SHA-256 checksum is
published alongside it.

The dependency audit is a release gate. At the time of this release the
upstream `znn-ts-sdk` dependency still brings in advisories for
`bigint-buffer`, `tar` and `ws`; npm reports those instead of silently
allowing a release. Do not bypass that gate for a build holding real funds.

The workflow runs for pull requests, pushes to `main` or `development`, manual
runs and version tags. Pushing a matching tag such as `v0.2.0.0` also creates
or updates the corresponding GitHub Release. No custom GitHub variables or
secrets are required: the workflow uses the built-in `GITHUB_TOKEN` only for
the tag-only release job. It intentionally does not create a `.crx` with a
temporary private key, because that would change the extension ID between
builds and is unnecessary for unpacked Chrome/Brave installation.

## Load the unpacked extension

1. Build the project as described above.
2. Open `chrome://extensions/` in Chrome or `brave://extensions/` in Brave.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the repository's `build` directory.
5. Pin or open **Syrius Extension** from the browser toolbar.

After changing source files, run `npm run build` again and press **Reload** on the unpacked extension. A full browser restart is normally not required. See [`SETUP.md`](SETUP.md) for a Windows walkthrough and troubleshooting checklist.

## Session and auto-lock

Closing the extension popup does not log the wallet out. After unlocking, the temporary session credentials are kept in Chromium's in-memory extension storage so the popup can be reopened without entering the password again.

The session is automatically locked after inactivity. The default is 30 minutes and it can be changed in **Settings → Auto-lock** from 1 minute up to 24 hours. Locking removes the temporary session credentials and returns the extension to the password screen; the encrypted wallet data remains stored locally.

The temporary session is intentionally cleared when the browser or the unpacked extension is restarted. The password is never copied to persistent extension storage. Use **Lock wallet** in the menu whenever you want to end the session immediately.

## Balance privacy

Use the eye button next to the Dashboard balance to hide or show the selected token balance. Hidden balances are displayed as `***`; the preference is stored locally and is visible by default on a fresh installation. Transaction confirmation values and amount input fields remain visible so every action can be checked before signing.

## Development

```bash
npm ci --legacy-peer-deps
npm start
```

The development server writes bundles to `build/` and listens on port `3001`. Keep the unpacked extension pointed at `build`, then reload the extension after a rebuild. The normal production check is:

```bash
npm run build
npm run lint
```

Use a production build for any wallet that holds real funds. The development
server enables development tooling and source maps for local debugging and is
not a release build.

## How the bridge integration works

The bridge applications can use either the modern provider or the established
`znn.*` page-message protocol. The extension keeps the legacy protocol
compatible while adapting the transport to Manifest V3:

- `inpage.bundle.js` runs in the page's `MAIN` world and exposes
  `window.zenon` with request IDs, read-only account/Chain ID/node methods,
  connect/disconnect, EIP-1193-style error codes and account/chain/node
  change events. It never receives a password, private key or seed phrase.
- `contentScript.bundle.js` validates page messages and relays only known methods to the extension service worker.
- The service worker opens an approval window with `chrome.windows.create` and keeps the short-lived request context in `chrome.storage.session`.
- Approval responses and wallet events are sent back to the originating bridge tab.
- Account-block and signed-transaction payloads are converted to JSON before crossing extension boundaries.

Modern provider methods are `znn_accounts`, `znn_chainId`, `znn_nodeUrl`,
`znn_connect`, `znn_disconnect`, `znn_sendTransaction` and
`znn_signAndSendBlock`; the common `eth_accounts`, `eth_chainId` and
`eth_requestAccounts` aliases are also accepted. Read access is scoped to the
exact configured bridge origin and persisted under **Settings → Connected
sites**. A signature always opens a fresh approval prompt, even for a
previously connected site.

The legacy adapter supports these requests:

- `znn.requestWalletAccess`
- `znn.sendTransactionToSigning`
- `znn.sendAccountBlockToSend`

Responses and events include `znn.grantedWalletRead`, `znn.deniedWalletRead`,
`znn.signedTransaction`, `znn.deniedSignTransaction`, `znn.accountBlockSent`,
`znn.deniedSendAccountBlock`, `znn.addressChanged`, `znn.chainIdChanged` and
`znn.nodeChanged`.

## Network nodes

The node selector includes these configured Zenon endpoints:

- Local node: `wss://127.0.0.1:35998`
- Mainnet: `wss://node.zenonhub.io:35998`
- Mainnet: `wss://my.hc1node.com:35998`
- Mainnet: `wss://node.atsocy.com:35998`
- Testnet: `wss://rpc.testnet.zenon.info`

Chain identifier `1` is the mainnet default and chain identifier `3` is available for testnet. Every saved node has an associated Chain ID: the built-in mainnet nodes use `1`, while the built-in testnet node uses `3`. When you add your own node under **Settings → Node management**, its Chain ID field defaults to `1` (mainnet); change it to the correct value before saving a testnet or other network node.

Selecting a saved node applies its saved Chain ID as well as its URL. You can still use **Settings → ChainId management** to deliberately override the active Chain ID. The local endpoint requires a locally running node with WSS enabled.

For a testnet session, select `wss://rpc.testnet.zenon.info` under **Settings → Node management**; it is configured with Chain ID `3`. For a custom testnet node, enter Chain ID `3` when adding it. A bridge staging or testnet page does not by itself make a mainnet transaction safe.

## Related projects

- [Bridge dApp](https://github.com/0x3639/bridge-dapp)
- [0x3639 bridge deployment](https://github.com/0x3639/bridge.0x3639.com)
- [Staging bridge deployment](https://github.com/0x3639/staging.bridge.0x3639.com)
- [Zenon Network repositories](https://github.com/zenon-network/)
- [Zenon library](https://zenon.org/en/library)

## Privacy and security

The extension has no analytics or tracking service; blockchain and node
requests go directly from the browser to the configured network endpoints.

- Runtime wallet code contains no `console.*` or debugger output. SDK/node
  failures are reduced to generic user-facing errors and are never copied to a
  bridge page.
- Bridge messages are restricted by exact origin, sender, method, payload
  shape and size. The originating tab's URL is checked again before a result
  is forwarded.
- Private keys and seed phrases remain inside the SDK's encrypted keystore
  flow. The pinned SDK format uses AES-256-GCM and Argon2id; this project does
  not add an unverified second encryption format that could break existing
  wallets. A future KDF-parameter change needs a versioned, backward-compatible
  migration and independent test vectors.
- Unlock credentials are temporary browser-session data, not persistent
  extension storage. They are removed on lock, timeout, browser restart or
  extension reload. The session stores the keystore entropy needed to reopen
  the already-unlocked wallet; it never caches the password. The decrypted
  keystore and derived key material remain only in trusted extension-page
  memory until the wallet is locked.
- Production builds emit no source maps. The extension CSP does not enable
  JavaScript `unsafe-eval`; the narrower `wasm-unsafe-eval` allowance exists
  for the SDK's Argon2 browser module.
- Only encrypted WebSocket (`wss://`) node URLs can be saved. Verify custom
  node certificates, ownership and Chain ID yourself. The requested future
  HTTP testnet bridge remains inherently exposed to network interception and
  is warned about in the approval screen.

See [`privacy-policy.md`](privacy-policy.md) and [`SETUP.md`](SETUP.md) for the
release checklist and operational precautions.

## License

MIT License — see [`LICENSE`](LICENSE) for details.
