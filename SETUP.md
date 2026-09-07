# Syrius Extension setup

This guide covers building and loading the unpacked extension in Chrome, Brave and other Chromium-based browsers on Windows.

## 1. Check the required runtime

Install Node.js 24.x. This project is configured for the following executables:

```powershell
& 'C:\Program Files\nodejs\node.exe' --version
& 'C:\Program Files\nodejs\npm.cmd' --version
```

The first command should report Node `v24.x` and npm should be version 10 or newer. Do not create a second virtual environment or install another Node runtime for this project.

## 2. Install and build

Run these commands from the repository root in PowerShell:

```powershell
git clone -b development --single-branch https://github.com/MichZNN/syrius-extension.git
Set-Location syrius-extension
& 'C:\Program Files\nodejs\npm.cmd' ci --legacy-peer-deps
& 'C:\Program Files\nodejs\npm.cmd' run build
```

The generated extension is in the `build` directory. Keep that directory available; the browser loads the generated files, not `src`.

## 3. Load in Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `build` directory.
5. Open the extension popup from the toolbar and complete wallet setup or unlock an existing local wallet.

## 4. Load in Brave

1. Open `brave://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the same `build` directory.
5. Open the extension popup from the toolbar.

Other Chromium browsers use the same procedure, although their extensions page URL may differ.

## Automated Chrome/Brave package

The repository includes [`build-and-release.yml`](.github/workflows/build-and-release.yml).
It uses the Node.js version from `.nvmrc`, installs the locked dependencies,
runs `npm audit --audit-level=high`, lints the source, builds the production
extension and uploads a Chrome/Brave-ready ZIP plus a SHA-256 checksum. The
audit is a release gate; do not bypass it for a wallet containing real funds.

The current pinned `znn-ts-sdk` chain still causes npm audit findings for
`bigint-buffer`, `tar` and `ws` without a compatible upstream SDK release. The
workflow therefore reports a failure until that dependency chain is replaced
or fixed; this is intentional and is not a GitHub secret/configuration issue.

No repository variables or custom secrets need to be created. For a tagged
release, GitHub Actions uses its automatically provided `GITHUB_TOKEN` with
write permission only in the release job. Create a release by pushing a tag
that exactly matches the four-part Chrome manifest version, for example:

```powershell
git tag v0.2.0.0
git push origin v0.2.0.0
```

If GitHub refuses to create the Release, check the repository's **Settings →
Actions → General → Workflow permissions** and allow workflows to request
read/write permissions. The workflow still limits `contents: write` to the
tag-only release job.

Download the ZIP from the workflow artifact or GitHub Release, extract it and
select the extracted directory with **Load unpacked**. The ZIP is deliberately
used instead of an automatically signed `.crx`; a generated CRX key would
change the extension ID and would require secure long-term key management.

## Session and auto-lock

Closing the popup keeps the wallet session active, so reopening it does not require another password entry. By default, the extension locks the session after 30 minutes without activity.

To change this period, open **Settings → Auto-lock** and choose a whole number between 1 minute and 24 hours. Auto-lock clears only the temporary session credentials; the encrypted wallet remains in local extension storage. A browser restart or extension reload clears the temporary session as a safety measure.

## Balance privacy

On the Dashboard, select the eye button next to the balance to show or hide the selected token amount. Hidden balances appear as `***`. This preference is stored locally and defaults to visible. Transaction confirmation values and amount fields stay visible for review before signing.

## 5. Test a bridge connection

Use a staging or testnet deployment first. The extension only activates on the configured origins in [`src/manifest.json`](src/manifest.json).

1. Open one of the supported bridge URLs.
2. Confirm that the page is using the exact configured scheme and hostname.
3. Start the bridge's wallet connection flow.
4. Approve or deny the read-access prompt in the Syrius approval window.
5. Confirm that the bridge receives the selected address, chain identifier and node URL.
6. For a testnet signing test, select `wss://rpc.testnet.zenon.info` under **Settings → Node management**; its associated Chain ID is `3`. For a custom testnet node, add it there with Chain ID `3`.
7. Use a harmless testnet transaction and verify the destination, token and amount in the approval window before approving.
8. Repeat once with **No** to confirm that denial is returned to the bridge.
9. After approving read access, open **Settings → Connected sites**, confirm
   the origin is listed, revoke it, and verify a later `znn_accounts` request
   returns no account until the site is connected again.

Never use a real mainnet transfer as the first integration test. No automated test in this repository broadcasts a real transaction.

## 6. Rebuild and reload

After source changes:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Return to the extensions page and click **Reload** for Syrius. Refresh the bridge tab as well so its content scripts are injected again.

## Security release checklist

Before using a build with real funds:

1. Run `npm ci --legacy-peer-deps` with the prescribed Node.js 24/npm runtime.
2. Run `npm run lint`, `npm run build` and `npm audit`.
3. Inspect the generated `build` directory and confirm that no source-map
   files are present in the production build.
4. Load the unpacked extension in a clean browser profile and test a harmless
   testnet bridge flow first.
5. Verify the origin, destination address, token, exact amount, node and Chain
   ID in the approval window before every signing action.

Do not use `npm start` or a development build for a wallet containing real
funds. The development configuration is intended only for local debugging.

## Troubleshooting

### The extension does not appear on a bridge page

Check that the address exactly matches an origin in the manifest. `https://` and `http://` are different origins, and the future testnet entry is intentionally HTTP-only.

### The approval window does not open

On the extensions page, open the **service worker** inspector for Syrius and check for an error. Rebuild, reload the extension, refresh the bridge tab, and retry. The old MV2 background-page model is not used.

### The bridge does not receive the result

Keep the originating bridge tab open while approving. Reloading or closing that tab cancels its temporary integration context. Also make sure the unpacked extension was reloaded after the last build.

### A listed bridge is unavailable

`https://bridge.mainnet.zenon.community/` is retained for future use but is currently offline. `http://testnet.bridge.0x3639.com/` is also a future compatibility entry and may not currently resolve. These entries being present in the manifest does not mean the remote deployment is online.

### Node connection fails

Use the extension's node selector and choose a reachable endpoint with the correct chain identifier. The current public defaults are:

- Local: `wss://127.0.0.1:35998`
- Mainnet: `wss://node.zenonhub.io:35998`
- Mainnet: `wss://my.hc1node.com:35998`
- Mainnet: `wss://node.atsocy.com:35998`
- Testnet: `wss://rpc.testnet.zenon.info` with chain identifier `3`

Each saved node has an associated Chain ID. Built-in mainnet nodes use `1`, the built-in testnet node uses `3`, and a newly added node defaults to Chain ID `1` (mainnet). To add a node, open **Settings → Node management**, enter its `wss://` URL, set the Chain ID for the network it serves, and select **Add node**. Only encrypted WebSocket endpoints are accepted; this prevents accidentally sending wallet traffic over an unencrypted `ws://` connection. Selecting that saved node applies both its URL and associated Chain ID. The separate **ChainId management** screen remains available when you need to override the active Chain ID deliberately. The local endpoint only works when a local WSS node is running and trusted by the browser.

## Useful diagnostics

- `chrome://extensions/` or `brave://extensions/`: reload the extension and inspect the service worker.
- Browser DevTools on the bridge page: inspect the non-sensitive
  `window.zenon` provider and its request/event behavior. Never paste wallet
  secrets into the console.
- The extension intentionally does not log secrets or raw SDK/node errors. Use the generic message shown in the UI and reproduce issues only with a local development build.
