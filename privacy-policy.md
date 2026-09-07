# Privacy Policy for Syrius Extension

**Effective Date:** July 28, 2025
**Last Updated:** September 7, 2026

## Overview

Syrius Extension is a non-custodial cryptocurrency wallet for the Zenon Network blockchain. This privacy policy explains how we handle information when you use our browser extension.

## Information We Do Not Collect or Retain

We do **not** collect, retain, or transmit to Syrius-operated servers:
- Personal information (name, email, phone, address)
- Browsing history or website activity
- Private keys or seed phrases
- Usage analytics or tracking data
- Device information or identifiers

The extension does not send this information to a Syrius-operated server. A wallet address, network metadata or transaction result can still be shared with a compatible bridge page when you explicitly approve that request; see below. Syrius does not receive that bridge-page data.

## Information Stored Locally

The following data is stored **only on your device** and never transmitted to us:
- Encrypted wallet data (private keys, seed phrases)
- User preferences and settings
- Balance visibility preference
- Transaction history for display purposes
- Network configuration settings
- Temporary wallet session data, including the keystore entropy needed to
  reopen an unlocked session, held only in Chromium's in-memory extension
  storage while the wallet is unlocked; the wallet password is not cached

This data remains on your device and is never shared with us or third parties.

Closing the popup does not clear the temporary session. The session is automatically locked after the configured inactivity period (30 minutes by default), or when the browser or extension is restarted. Locking removes the temporary credentials; the encrypted wallet data remains stored locally.

## Blockchain Interactions

When using the extension:
- Transaction data is sent directly to the Zenon Network blockchain
- Blockchain transactions are public by nature and visible on the network
- We do not monitor, record, or have access to your transactions
- Network requests go directly from your device to blockchain nodes

## Third-Party Services

The extension connects to:
- **Zenon Network RPC nodes** - to read blockchain data and broadcast transactions
- **Compatible Zenon bridge applications** - an approved request can return the selected address, chain identifier, node URL or transaction result to the originating bridge tab. Those websites have their own privacy policies and data practices.
- **No analytics services** - we do not use Google Analytics, tracking pixels, or similar services

Bridge access is limited in the extension manifest to the explicitly configured origins documented in [README.md](README.md).

## Data Security

- Wallet keystores are written and read through the pinned Zenon SDK's
  encrypted `KeyStoreManager` format. The audited format uses AES-256-GCM and
  an Argon2id-derived key; plaintext private keys and seed phrases are not
  written to persistent extension storage.
- The extension does not introduce a second custom encryption format. This
  preserves compatibility with existing wallets; changing KDF parameters
  requires a separately tested, versioned migration.
- Temporary unlock data is held only in Chromium's in-memory session storage
  while the wallet is unlocked and is removed on lock, timeout, browser
  restart or extension reload. The password is not stored in the session;
  decrypted keystore/key material exists only in trusted extension-page memory
  until locking.
- Bridge responses are restricted to the explicitly approved origin and
  protocol. The future HTTP testnet entry is not confidential transport and
  should not be used for sensitive production activity.
- We never have access to your private keys or seed phrases
- Encrypted wallet data, private keys and seed phrases never leave your device
- The extension contains no analytics or remote-control service. As with any
  browser extension, a compromised browser profile, operating system or
  malicious replacement build can access data while the wallet is unlocked.

## Children's Privacy

Our extension is not directed at children under 13. We do not knowingly collect information from children.

## Changes to This Policy

We may update this privacy policy occasionally. Changes will be posted on this page with an updated "Last Updated" date.

## Your Rights

Since we do not collect personal data:
- There is no data to access, correct, or delete from our servers
- Your wallet data on your device can be removed by uninstalling the extension
- No data portability is needed as all data stays with you

## Contact Information

For questions about this privacy policy:
- **GitHub Issues:** [https://github.com/MichZNN/syrius-extension/issues](https://github.com/MichZNN/syrius-extension/issues)
- **Repository:** [https://github.com/MichZNN/syrius-extension](https://github.com/MichZNN/syrius-extension)

## Technical Details

- **Extension ID:** epgnegebjlojknnnhjjlcmobdljjenah
- **Manifest Version:** 3
- **Permissions Used:**
  - `storage` - for local wallet data storage
  - `alarms` - to enforce the inactivity lock while the popup is closed
  - Network and bridge access - for blockchain connectivity and explicitly approved bridge communication

---

*This privacy policy applies only to the Syrius Extension browser extension and not to any websites, services, or applications that may be accessed through the extension.*
