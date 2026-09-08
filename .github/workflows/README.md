# GitHub Actions workflow notes

The executable workflow is `build-and-release.yml` in this directory.

It builds the Manifest V3 extension with Node.js 24, runs the dependency audit,
lint checks and focused regression tests, creates a Chrome/Brave-ready ZIP with
`manifest.json` at its root, and publishes a SHA-256 checksum. A pushed tag
such as `v0.2.0.0` also creates or updates the matching GitHub Release.

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

The audit is deliberately a hard gate. The pinned `znn-ts-sdk` currently has
unresolved upstream advisories in its dependency graph; the workflow must stay
red until that SDK chain is replaced or patched and verified. Do not add an
ignore list or `continue-on-error` to make a real-funds release appear green.

If release creation is denied by repository policy, allow workflows to request
read/write permissions under Settings → Actions → General. The workflow still
grants `contents: write` only to the tag-only release job.
