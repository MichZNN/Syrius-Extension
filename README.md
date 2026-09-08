# Syrius Extension

A non-custodial browser wallet for the Zenon Network of Momentum.

Keys are generated and encrypted locally (BIP-39 mnemonic, Argon2id, AES-256-GCM
through `znn-ts-sdk`) and never leave the machine. The extension talks to a
Zenon node of your choosing over a websocket, and to web pages through an
injected provider that cannot do anything without being asked first.

Current version: **0.3.2**, Manifest V3. What changed against the published
`MichZNN/syrius-extension` build is in [CHANGELOG.md](CHANGELOG.md); the working
notes behind it are in [REFACTOR.md](REFACTOR.md).

## Features

- **Wallet** — create or import a 12/24-word recovery phrase (checked against
  the BIP-39 checksum), multiple named addresses per wallet, change password,
  remove a wallet.
- **Balances** — every ZTS the account holds, not just ZNN and QSR, on their own
  Tokens screen.
- **Transfers** — send and receive, with a history that names what each block
  actually did (fused/unfused, staked/unstaked, delegated/undelegated, swap
  created/unlocked/reclaimed) and marks anything the network has not confirmed
  yet. Incoming blocks can be received automatically.
- **Pillars** — delegate, undelegate, collect rewards.
- **Plasma** — fuse and cancel QSR fusions.
- **Staking** — lock ZNN, withdraw matured stakes, collect rewards.
- **Nodes** — keep a list of nodes, switch between them, and set the chain
  identifier the wallet signs for (detected from the node it is connected to).
- **dApp bridge** — a `window.zenon` provider with per-origin permissions and a
  Connected Sites screen.
- **Settings** — auto-lock timer, auto-receive, explorer choice, address labels,
  backup phrase export.

## Installation

### From a release

Every `v*.*.*` tag is built by GitHub Actions and published as a Chrome/Brave
ZIP on the [releases page](https://github.com/MichZNN/syrius-extension/releases).
Open `chrome://extensions/` or `brave://extensions/`, enable "Developer mode",
and drag the ZIP onto the extensions page. Alternatively, extract it and choose
**Load unpacked**.

### From source

1. **Prerequisites**
   - Node.js 18 or higher
   - npm 8 or higher

2. **Build the extension**

   ```bash
   git clone https://github.com/MichZNN/syrius-extension.git
   cd syrius-extension
   npm install
   npm run build
   ```

3. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `build` folder

## Development

```bash
npm install
npm run build      # production build into build/
npm run lint
npm run test       # checks the embedded-call decoder against go-zenon's ABIs
npm run prettier
```

`npm test` re-derives every embedded contract's method selectors straight from
`../go-zenon/vm/embedded/definition/*.go` and feeds synthetic blocks through the
decoder the wallet uses. It is the only check on the HTLC labels, since
`znn-ts-sdk` has no HTLC implementation to compare against. It skips itself if
go-zenon is not checked out alongside this repo.

### Dev harness

`utils/dev-harness.js` runs the extension in a Chrome of its own — separate
profile, separate debugging port — with a wallet that unlocks itself, so a
screen can be opened and worked on without clicking through the splash, the
password and the menus every time. It defaults to the
[go-zenon devnet](../go-zenon/docker/devnet) (`ws://localhost:35998`, chain 69)
and that repo's committed dev mnemonic, at address index 1.

```bash
npm run dev:start                     # build, launch Chrome, unlock, screenshot
npm run dev:reload                    # rebuild, reload the extension, screenshot
npm run dev:stop                      # close it again

node utils/dev-harness.js route tabs/settings/change-node
node utils/dev-harness.js shot --full --out node-settings.png
node utils/dev-harness.js click "text=Use chain 69"
node utils/dev-harness.js fill "input[name=chainIdField]" 3
node utils/dev-harness.js text .chain-id-card
node utils/dev-harness.js logs
```

Chrome stays up between commands, so each one lands on the screen the last one
left behind. Screenshots go to `.dev-harness/shots/`. The wallet it unlocks is
written to `.dev-harness/wallet.json` on first run — edit that file to point the
harness at a different mnemonic, node, chain or address index.

`node utils/dapp-test.js` drives a real web page against the injected provider
end to end — connect prompt, approval, and reconnecting without a second prompt
— against the Chrome the harness is already running.

The auto-unlock only exists in builds made by the harness: it needs
`SYRIUS_DEV_WALLET=true`, which nothing else sets, it refuses to run in a
production build, and even then it does nothing until the harness leaves a
wallet in the browser's own storage. Nothing about it is compiled into
`npm run build`.

### Releasing

`.github/workflows/build-and-release.yml` validates every pull request and push
to the development branches. A successful push to `main` creates the matching
version tag and publishes the Chrome/Brave ZIP plus its SHA-256 checksum. Bump
`src/manifest.json`, `package.json` and `package-lock.json` together before
merging a release. To use the tag-triggered path manually instead of the
automatic `main` release:

```bash
git tag v0.3.2 && git push origin v0.3.2
```

The normal `main` workflow creates the tag itself. The workflow does not
require a CRX private key: Chrome and Brave load the published ZIP as an
unpacked extension.

## Integrating a site

The extension injects `window.zenon` into every page, before the page's own
scripts run. It exposes nothing about the wallet until the person approves the
origin, and it never signs anything without asking.

```js
// The provider is injected at document_start, but a script that runs even
// earlier can wait for it.
const zenon = window.zenon ?? (await new Promise((resolve) =>
  window.addEventListener('zenon#initialized', () => resolve(window.zenon), { once: true })
));

// Read-only, never prompts. Empty until this origin is connected.
await zenon.getAccounts();   // [] | ['z1q…']
await zenon.getChainId();    // 1 for mainnet
await zenon.getNodeUrl();

// Opens the connect prompt. Resolves immediately for an origin already
// connected; rejects with {code: 4001} if the person declines.
const [address] = await zenon.connect();

// A transfer. `amount` is in the token's smallest unit.
const { hash } = await zenon.sendTransaction({
  to: 'z1q…',
  tokenStandard: 'zts1znnxxxxxxxxxxxxx9z4ulx',
  amount: '100000000',                    // 1 ZNN
});

// An arbitrary account block, including contract calls. Shown in full before
// anything is signed.
await zenon.sendAccountBlock(block);

zenon.on('accountsChanged', (accounts) => {});
zenon.on('chainChanged', (chainId) => {});
zenon.on('nodeChanged', (nodeUrl) => {});

await zenon.disconnect();
```

Errors follow EIP-1193 numbering: `4001` the person declined, `4100` the origin
is not connected, `4200` unknown method, `4900` the wallet is locked.

The flat `window.postMessage({method: 'znn.requestWalletAccess'})` protocol the
2023 build used is still relayed, so sites written against it keep working.

## Security notes

- The encrypted keystore lives in the extension's own storage and is opened once
  per unlock. An unlocked session is held in `chrome.storage.session`, which is
  memory-only, cleared when the browser closes, and unreadable by content
  scripts. It stores the keystore's entropy rather than your password, and it
  expires on the timer set under Settings → Lock after.
- The service worker holds no key material and does not link the SDK. It answers
  a site's read-only questions from a small non-secret record the popup
  publishes.
- Connecting a site grants read access to the selected address, the chain and
  the node URL. It is never permission to move anything: signing and sending are
  prompted every time, and connected origins can be revoked under
  Settings → Connected sites.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

---

**Disclaimer**: This is experimental software. Use at your own risk. Always verify transactions before signing.
