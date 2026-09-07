# Changelog

## 0.3.0

Everything below is the difference between this tree and
[`MichZNN/syrius-extension`](https://github.com/MichZNN/syrius-extension) at
`8cf005c` ("Added extension id"), which is version **0.1.10**. That build was a
Manifest V3 port of the 2023 DexterLabZ extension: a wallet that worked, wired
into a Create-React-App-shaped extension boilerplate it had outgrown, and
injected into exactly one website.

The reasoning behind each change, and what was measured rather than assumed, is
in [REFACTOR.md](REFACTOR.md).

### Wallet correctness

These were live defects in 0.1.10, not cleanups.

- **Sending signed with the wrong address.** The vault defaulted every accessor
  to address index 0 while balances came from the selected index, so a wallet on
  its second address showed one account and signed with another. Six call sites
  shared the defect; the vault now holds the selected index and it is the
  default everywhere.
- **Amounts lost a base unit.** Send used `parseInt(amount * 10**decimals)` and
  staking used `parseInt(amount) * 1e8` — 4.35 ZNN sent 434999999 instead of
  435000000, and staking 1.5 ZNN staked 1.0. One BigNumber-correct parser and
  formatter (`services/utils/format.js`) replaces about twenty copies of the old
  expression. Confirmed against a devnet node, not by inspection.
- **A mistyped recovery word silently imported a different wallet.** A phrase
  was accepted on word count alone, with no BIP-39 checksum check, and reported
  success on an empty wallet. The checksum is verified now.
- **Wallets were written after the flow moved on.** `saveKeyStore` was never
  awaited in either the create or the import path.
- **A wallet sitting on address 0 was reset to defaults** on every load, because
  the stored index was tested for truthiness.
- **The password prompt reappeared at random.** The credential cache lived in a
  service-worker module variable, which MV3 evaporates whenever it feels like
  it.
- **Recipient addresses were never parsed** — only checked for being non-empty.
  Max send was hardcoded to 999.
- **Plasma's fuse field** wrote a stale value into the form on change, so its
  validation never saw what was typed.
- **Delegate** divided the ZNN reward by the QSR token's decimals and vice versa
  (latent while both are 8).
- **A site asking about a token the account does not hold** threw, from an
  unguarded `balanceInfoMap[tokenStandard]`.
- **A dead message channel hung the wallet forever.** `sendInternal` had no
  deadline and unlock awaited it, so an extension update — which orphans an open
  popup's context — left a blank splash with no error and no way forward. Every
  internal call has a deadline now.
- Token dropdown compared a `TokenStandard` object to a string and so never
  showed the selection; a dropdown effect keyed on `value` re-entered form
  validation on every render; "Staked N ZNN" read a state value that was never
  assigned and so always said zero.

### Transaction history

0.1.10 knew where a block went but never what it did: both halves of every
contract pair rendered as the same word, and anything else rendered as "Sent 0".

- Embedded calls are decoded from their four-byte selector — the first four
  bytes of `SHA3-256` over the canonical signature, the way go-zenon dispatches
  them — so **Fused/Unfused**, **Staked/Unstaked**, **Delegated/Undelegated**
  are distinct rows.
- HTLC calls (`Create`, `Unlock`, `Reclaim`, `AllowProxyUnlock`,
  `DenyProxyUnlock`) are labelled as **Swap created / unlocked / reclaimed**,
  even though `znn-ts-sdk` has no HTLC support of any kind.
- `npm test` re-derives all of it from `go-zenon/vm/embedded/definition/*.go`;
  it is the only check on the HTLC labels.
- Unconfirmed blocks are marked as such (a block with no `confirmationDetail`
  gets a pulsing dot), and the dashboard polls only while a row is pending.
- Explorer links follow the chain instead of pointing at the mainnet explorer
  from every network, and are switchable between zenonhub.io and
  explorer.zenon.network.
- Embedded contracts are named ("From Plasma") rather than printed as forty
  characters of address, and zero amounts are no longer rendered next to
  contract calls.

### dApp bridge

- **`window.zenon` provider**, injected into every page at `document_start` in
  the MAIN world, with `request()`, `connect()`/`disconnect()`, EIP-1193 error
  codes, and `accountsChanged` / `chainChanged` / `nodeChanged` events.
  0.1.10 injected only into `https://bridge.mainnet.zenon.community/*` and spoke
  a flat `postMessage` protocol, which is still relayed so existing sites keep
  working.
- **Per-origin permissions**, persisted, with a Connected Sites screen and
  revocation. Connecting grants read access to the address, chain and node URL
  only; every signature is prompted.
- **Service worker rewritten as a router** with sender validation, a single
  reused approval window instead of stacked popups, and no key material or SDK
  linked into it at all. It answers read-only questions from a small non-secret
  record the popup publishes.

### Security

Against the security audit of 0.1.10 (kept outside this repo, as
`../syrius-extension-security-audit.md`):

- The unauthenticated plaintext-password oracle in the background script is gone
  with the credential cache itself. The wallet's control surface is gated on the
  sender's extension-origin URL — the previous check tested `!sender.tab`, which
  wrongly refused an extension page opened in a tab.
- MV3 `window.open` in the service worker is gone.
- The audit's suspected CSP break on the plasma PoW blob worker was tested under
  the shipped CSP and does not exist: the blob inherits the extension's origin,
  which `script-src 'self'` covers.
- An unlocked session lives in `chrome.storage.session` (memory-only,
  unreadable by content scripts) and holds the keystore's entropy rather than
  the password, expiring on a real auto-lock timer.

### New screens

Tokens (all ZTS the account holds, not just ZNN and QSR), change password,
remove wallet, connected sites, address labels, auto-receive, auto-lock and
explorer settings.

### Performance and build

| | 0.1.10 | 0.3.0 |
|---|---|---|
| popup entrypoint | 14.9 MiB | 6.1 MiB |
| popup bundle | 7.95 MiB | 146 KiB |
| production build | 33 s | ~21 s |
| keystore decryptions per navigation | 1 (Argon2id, 64 MiB) | 0 |

- Dropped `three` (a 3D ball on the password screen), `react-lottie-player`
  (a three-second intro animation), `framer-motion`, `react-transition-group`,
  `react-hot-loader`, `@hot-loader/react-dom` and `webpack-obj-loader`, plus the
  assets they existed for: 3D models, cyber-eye cubemap textures, ten Lottie
  files.
- `znn-ts-sdk` comes from npm (`0.1.3`) rather than a GitHub tarball.
- Removed the unreachable `newtab`, `options`, `panel` and `devtools` entry
  points and `devtools_page` from the manifest.
- Vendor chunking for the popup only, so the content and page scripts stay
  standalone; `drop_console` and no source maps in production.
- The keystore is decrypted once per unlock and the key pair cached, instead of
  running Argon2id on every screen.
- The stylesheet went from 1801 lines of `!important` utilities and dead classes
  to a token-driven system, with a fixed 360×600 shell and scrolling contained
  to the screen body — previously any screen could scroll the whole document,
  which is why the header slid away mid-transaction.
- Shared code extracted where there had been copies: one signing/plasma-progress
  path (was six), one paginated list (was four, all with the same "more pages"
  bug), one error formatter (was ten), one toast helper (was twenty). The
  spinner and modal hooks were toggles over stale closures and are counted
  show/hide pairs now.
- Three-second splash replaced by a still logo shown only while storage is read.

### Repository

- `npm test` (`utils/contract-calls-test.js`) and `utils/dapp-test.js`, an
  end-to-end drive of a real page against the provider.
- `utils/dev-harness.js`: the extension in its own Chrome, on its own profile
  and debugging port, with a self-unlocking devnet wallet. The auto-unlock
  requires `SYRIUS_DEV_WALLET=true`, which only the harness sets, and is dead
  code in any production build.
- `.github/workflows/release.yml`: builds on a `v*.*.*` tag, refuses a tag that
  does not match the manifest version, and publishes a signed `.crx`.
- Removed the `npm start` webpack-dev-server path with `webpack-dev-server` and
  `cross-env`. Its hot-reload wiring hung off a `chromeExtensionBoilerplate` key
  the webpack config no longer has, and it injected HMR clients into the content
  and page scripts, which breaks them. The dev harness replaced it.
- Deleted a stray `nul` file (a Windows shell redirect that landed as a 2000-line
  copy of the stylesheet); untracked `desktop.ini`.
- Manifest name is "Syrius — Zenon Wallet"; `alarms` added to permissions for
  the auto-lock; `web_accessible_resources` for the old single-site bridge
  removed.

### Not included

Sentinels (excluded by request), Accelerator-Z, P2P/HTLC swaps and
WalletConnect — desktop-shaped features that do not fit a 360px popup.
