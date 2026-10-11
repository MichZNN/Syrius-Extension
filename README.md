# Syrius Extension

A non-custodial browser wallet for the Zenon Network of Momentum.

Keys are generated and encrypted on your machine and never leave it. The
extension talks to a Zenon node of your choosing, and to web pages through an
injected provider that does nothing without being asked first.

Version **0.3.5**, Manifest V3, Chrome or Brave 112 or later.
[What changed](CHANGELOG.md).

## Features

- **Wallet**: create or import a recovery phrase, several named addresses,
  balances of every ZTS token, an approximate value in dollars.
- **Send and receive**, with a history that names what each block did.
- **Delegate, stake, fuse plasma**, and collect the rewards.
- **Tokens**: issue, mint, burn and update your own ZTS tokens.
- **Operator modes** (Settings): pillar management with rewards and
  Accelerator-Z voting, sentinels, sporks.
- **Sites**: a `window.zenon` provider with per-site, per-account consent, and
  message signing compatible with desktop Syrius.
- **Settings**: nodes and chain identifier, auto-lock, auto-receive, theme,
  explorer, backup phrase.

## Install

From a release: download the ZIP from the
[releases page](https://github.com/sol-znn/syrius-extension/releases), open
`chrome://extensions`, turn on Developer mode and drag the ZIP in.

From source (Node.js 24, npm 10):

```bash
git clone https://github.com/sol-znn/syrius-extension.git
cd syrius-extension
npm ci --legacy-peer-deps
npm run build
```

Then **Load unpacked** and pick the `build` folder.

## Documentation

| | |
|---|---|
| [Development](docs/DEVELOPMENT.md) | Build, tests, the dev harness, releasing |
| [Setup](docs/SETUP.md) | A checkout that passes the same checks as CI |
| [Integrating a site](docs/INTEGRATION.md) | The `window.zenon` API, signatures, request limits, consent |
| [Security notes](docs/SECURITY.md) | Where keys live, what a connection grants, locking |
| [Release checklist](docs/RELEASE-CHECKLIST.md) | Gates for a release candidate |
| [Browser test notes](docs/testing/) | What each browser fixture establishes |
| [Refactor notes](docs/REFACTOR.md) | The working notes behind the 0.3 rewrite |
| [Local test chain](tools/devnet/lab/README.md) | The devnet that harnessed test runs send to |
| [Privacy policy](privacy-policy.md) | |

## Layout

| | |
|---|---|
| `src/` | The extension: `pages`, `components`, `layouts`, `services`, `sections` (popup, worker, content scripts) |
| `utils/` | The build, the dev harness and the test suites |
| `tools/` | Developer tools: the local test chain, deliberate-regression lists, probes |
| `vendor/` | Vendored dependencies |
| `docs/` | Everything in the table above |

## License

MIT, see [LICENSE](LICENSE).

Experimental software. Use at your own risk, and check every transaction before
signing.
