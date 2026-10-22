import { Constants, Primitives, Zenon } from 'znn-ts-sdk';
import { ethers } from 'ethers';

import { sdkBytes } from '../utils/sdkBytes';
import { encodeCall } from '../pillar/encode';
import { userAddressError } from '../pillar/rules';

// ZTS tokens: issuing one, and what its owner can do with it afterwards.
//
// Every rule is go-zenon's (`vm/embedded/implementation/token.go`, limits in
// `vm/constants/embedded.go`), checked before a block is built: an IssueToken
// the contract refuses has already carried its 1 ZNN fee there and back, and
// costs the plasma either way. `utils/operator-mode-test.js` pins them and
// checks the call data against the SDK byte for byte.
//
// Owner only: Mint (and only while mintable), UpdateToken. Burn is the tokens
// themselves sent to the contract: the owner's always, anyone's when the token
// is burnable. A non-mintable token's burn lowers its max supply as well.

const tokenAddress = 'z1qxemdeddedxt0kenxxxxxxxxxxxxxxxxh9amk0';

// TokenIssueAmount: 1 ZNN, kept by the contract.
const issueFeeZnn = 100000000n;
const nameMax = 40;
const symbolMax = 10;
const domainMax = 128;
const decimalsMax = 18;
// common.BigP255m1, written out: the build turns `**` into Math.pow, which
// throws on a BigInt as the module loads.
const supplyMax = 57896044618658097711785492504343953926634992332820282019728792003956564819967n;

// go-zenon's name pattern is `^([a-zA-Z0-9]+[-._]?)*[a-zA-Z0-9]$`, the pillar
// one; written without the nested repeat (services/pillar/rules.js).
const namePattern = /^[a-zA-Z0-9]+([-._][a-zA-Z0-9]+)*$/;
const symbolPattern = /^[A-Z0-9]+$/;
const domainPattern = /^([A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9]\.)+[A-Za-z]{2,}$/;

const byteLength = (text) => new TextEncoder().encode(text || '').length;

const toBig = (value) => {
  try {
    return BigInt(value?.toString() ?? '');
  } catch (error) {
    return null;
  }
};

// What is wrong with an issue, or null. Supplies are in base units.
const issueError = ({ name, symbol, domain, totalSupply, maxSupply, decimals, isMintable }) => {
  if (!name || byteLength(name) > nameMax) return `Name: 1 to ${nameMax} characters.`;
  if (!namePattern.test(name)) return 'Name: letters and digits, with single - . or _ between them.';
  if (!symbol || byteLength(symbol) > symbolMax) return `Symbol: 1 to ${symbolMax} characters.`;
  if (!symbolPattern.test(symbol)) return 'Symbol: capital letters and digits.';
  if (symbol === 'ZNN' || symbol === 'QSR') return `${symbol} is taken.`;
  if (byteLength(domain) > domainMax) return `Domain: at most ${domainMax} characters.`;
  if (domain && !domainPattern.test(domain)) return 'Domain: a name such as zenon.org, or nothing.';
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > decimalsMax) return `Decimals: 0 to ${decimalsMax}.`;
  const total = toBig(totalSupply);
  const max = toBig(maxSupply);
  if (total === null || total < 0n) return 'Enter a supply.';
  if (max === null || max <= 0n) return 'Max supply must be above zero.';
  if (max > supplyMax) return 'Max supply is too large.';
  if (max < total) return 'Max supply is below the supply.';
  if (!isMintable && max !== total) return 'Without minting, max supply is the supply.';
  return null;
};

// Mint: owner, mintable, room left under the max.
const mintError = (token, amount, receiveAddress) => {
  if (!token?.isMintable) return 'This token can no longer be minted.';
  const units = toBig(amount);
  if (units === null || units <= 0n) return 'Enter an amount.';
  const room = toBig(token.maxSupply) - toBig(token.totalSupply);
  if (units > room) return 'More than the max supply leaves.';
  return userAddressError(receiveAddress);
};

const burnError = (token, amount, balance, address) => {
  if (!token) return 'Unknown token.';
  if (!token.isBurnable && token.owner !== address) return 'Only the owner can burn this token.';
  const units = toBig(amount);
  if (units === null || units <= 0n) return 'Enter an amount.';
  if (units > (toBig(balance) ?? 0n)) return 'More than you hold.';
  return null;
};

// UpdateToken rewrites owner and both flags. Mintable can only be given up.
const updateError = (token, next) => {
  if (!token) return 'Unknown token.';
  if (next.isMintable && !token.isMintable) return 'Minting cannot be turned back on.';
  const ownerError = userAddressError(next.owner);
  if (ownerError) return ownerError;
  if (next.owner === token.owner && next.isMintable === token.isMintable && next.isBurnable === token.isBurnable) {
    return 'Nothing to update.';
  }
  return null;
};

// The bytes behind a z1 address or a zts, as hex for ./encode.
const addressHex = (address) => ethers.utils.hexlify(Primitives.Address.parse(address).core);
const ztsHex = (zts) => ethers.utils.hexlify(Primitives.TokenStandard.parse(zts).getBytes());

const call = (token, amount, data) =>
  Primitives.AccountBlockTemplate.callContract(
    Primitives.Address.parse(tokenAddress),
    typeof token === 'string' ? Primitives.TokenStandard.parse(token) : token,
    ethers.BigNumber.from(amount.toString()),
    sdkBytes(`0x${data}`)
  );

const templates = {
  issue: (token) =>
    call(Constants.znnZts, issueFeeZnn, encodeCall('token', 'IssueToken', [
      token.name,
      token.symbol,
      token.domain || '',
      token.totalSupply.toString(),
      token.maxSupply.toString(),
      Number(token.decimals),
      Boolean(token.isMintable),
      Boolean(token.isBurnable),
      Boolean(token.isUtility),
    ])),
  mint: (zts, amount, receiveAddress) =>
    call(Constants.znnZts, 0, encodeCall('token', 'Mint', [ztsHex(zts), amount.toString(), addressHex(receiveAddress)])),
  // The tokens themselves are the argument.
  burn: (zts, amount) => call(zts, amount, encodeCall('token', 'Burn', [])),
  update: (zts, { owner, isMintable, isBurnable }) =>
    call(Constants.znnZts, 0, encodeCall('token', 'UpdateToken', [ztsHex(zts), addressHex(owner), Boolean(isMintable), Boolean(isBurnable)])),
};

// Plain requests: the node's JSON, not the SDK's Token objects, whose
// BigNumber fields do not survive router state.
const request = (method, params) => Zenon.getSingleton().embedded.pillar.client.sendRequest(method, params);

const reads = {
  // Every token this address owns. The node's page limit is 1,024.
  owned: async (address) => (await request('embedded.token.getByOwner', [address, 0, 1024]))?.list || [],
  byZts: (zts) => request('embedded.token.getByZts', [zts]),
};

export {
  tokenAddress,
  issueFeeZnn,
  nameMax,
  symbolMax,
  domainMax,
  decimalsMax,
  supplyMax,
  issueError,
  mintError,
  burnError,
  updateError,
  templates,
  reads,
};
