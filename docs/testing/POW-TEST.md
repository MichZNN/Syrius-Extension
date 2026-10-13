# Proof of work in Chrome and Firefox

`node utils/pow-browser-test.js` is registered in `npm run test:browser`. It
runs the wallet's proof of work (`src/services/wallet/powSearch.js`) in an
extension page under the product's content security policy: in the
Chromium-family browser at `CHROMIUM_PATH`, and in Firefox when `FIREFOX_PATH`
names one. CI passes the runner's Firefox when it has one.

Firefox is why the module exists. The SDK's own proof of work makes its worker
from a `blob:` URL; Chrome runs it, Firefox's extension pages refuse it, so
before 0.3.6 a block that needed plasma never got it there. The test logs what
each browser does with such a worker, for the record.

What it checks:

- The search runs in the expected number of workers (half the logical cores,
  one to four), and every one is terminated when the first answers.
- Each worker's benchmark yields an estimate while the search runs, and the
  estimate is cleared after it.
- The nonce is a real proof: the first 8 bytes of SHA3-256(nonce ‖ hash),
  little endian, reach 2^64 − 2^64/difficulty, which is go-zenon's check.

Firefox is driven over WebDriver BiDi: the extension is installed temporarily,
its `moz-extension` origin is fixed by a profile preference, and its own
background script opens the page, because BiDi may not navigate to one. That
needs `--remote-allow-system-access`.

It does not send a block, use a wallet or reach a node.
