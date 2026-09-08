# GitHub Actions workflow notes

The executable workflow is `build-and-release.yml` in this directory.

It builds the Manifest V3 extension with Node.js 24, runs the dependency audit,
lint checks and focused regression tests, creates a Chrome/Brave-ready ZIP with
`manifest.json` at its root, and publishes a SHA-256 checksum. The current
release is `0.3.0`; push the matching tag `v0.3.0` to create or update the
GitHub Release.

The pinned `znn-ts-sdk` commit is consumed as an HTTPS source archive rather
than a Git dependency. The upstream Git package runs a non-deterministic
`prepare` command that installs an unversioned `cipher-base` while applying a
patch for `cipher-base@1.0.4`; a fresh npm registry resolution can otherwise
make `npm ci` fail before the workflow reaches its checks.

No custom repository variables or secrets are required for this ZIP workflow.
The release job uses GitHub's built-in `GITHUB_TOKEN` with write permission
only in that tag-only job. A CRX private key is intentionally not used: CRX
signing is not needed for loading the ZIP as an unpacked extension and a
rotating key would change the extension ID.

The audit is deliberately a hard gate for moderate, high and critical
advisories. The current lockfile reports only the unpatched low-severity
elliptic advisory in the legacy ethers 5/SDK chain, and
`npm audit --audit-level=moderate` passes without an ignore list or
`continue-on-error`. The install tree removes
the old native `bigint-buffer` and Argon2/node-pre-gyp paths, pins safe `ws` and
`qs` versions, uses current copy/Webpack releases, and runs React Router 7.
The local
`vendor/bigint-buffer` implementation validates fixed-width conversions and is
covered by a focused round-trip/bounds test.

Do not lower the audit threshold, add an ignore list, or use
`continue-on-error` to make a real-funds release appear green. The remaining
The remaining elliptic advisory has no upstream patched release. It requires a
separate migration of the SDK's legacy ethers/crypto-browserify signing chain;
do not replace it with an unreviewed fork or suppress the audit result.

If release creation is denied by repository policy, allow workflows to request
read/write permissions under Settings → Actions → General. The workflow still
grants `contents: write` only to the tag-only release job.
