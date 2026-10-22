# Syrius lab

A go-zenon devnet of this repo's own. Every harnessed test run that sends a
block goes here, and never to `devnet.zenon.foo`: a spork activated from the
wallet as a test stopped that chain on 2026-10-11.

```sh
tools/devnet/lab/lab.sh up       # builds the image and the assets on first use
tools/devnet/lab/lab.sh status   # containers, and whether momentums are being produced
tools/devnet/lab/lab.sh down     # stop, chain kept
tools/devnet/lab/lab.sh wipe     # stop, delete the chain and the assets
```

## What it is

go-zenon's five-node devnet (three pillars, an RPC node, an observer), built
from a clean export of `../go-zenon` at HEAD. It is not started with go-zenon's
own `docker-compose.yml`, because on this machine that file's containers and
volumes are the stopped copy of chain 69 kept as the public devnet's rollback.
The lab shares nothing with it:

| | go-zenon's compose | The lab |
|---|---|---|
| Compose project | `go-zenon` | `syrius-lab` |
| Containers | `znnd-devnet-*` | `syrius-lab-*` |
| Network | `znnd-devnet`, 172.30.0.0/24 | `syrius-lab`, 172.37.0.0/24 |
| RPC on the host | 35997, 35998 on every interface | `127.0.0.1:45997` HTTP, `127.0.0.1:45998` WS |
| Chain identifier | 69 | 321 |
| Restart policy | `unless-stopped` | none: it stays down until `up` |

The chain identifier is the one change to go-zenon's genesis
(`make-assets.js`). It is signed into every block and is the p2p network id,
so a block signed for the lab is worth nothing on chain 69, and a wallet left
pointed at the public devnet with the lab's settings is refused there.

Everything else is go-zenon's committed devnet, so its README's accounts hold:
the devnet mnemonic's index 1 (`z1qq6eg8n43g032hanpsfp02qcdmv7zfj3y2lt5d`) has
10,000 ZNN and 100,000 QSR and owns pillar `dev1`, index 0 produces for it and
is the spork address, and the genesis carries three fuses of 10,000 QSR owned
by index 1.

## An account that pays with proof of work

Index 1's fuses mean its blocks never need proof of work. For a test that
does, fund another index from it and point the harness there:

```sh
node tools/devnet/lab/fund.js 7 50        # 50 ZNN to index 7; refuses any chain but 321
node utils/dev-harness.js start --instance lab --node ws://127.0.0.1:45998 --chain 321 --address-index 7
```

The receive, and every send after it, generates plasma in the wallet.

## Pointing the harness at it

```sh
node utils/dev-harness.js start --instance lab --node ws://127.0.0.1:45998 --chain 321
```

The instance keeps that in `.dev-harness-lab/wallet.json`. Check `status`
says "producing" before the first send: a stopped chain accepts blocks into
its pool and looks alive.

## Limits

- The three genesis fuses cannot be cancelled: the plasma contract answers
  CancelFuse for one with an error (its receive block carries code 2 and sends
  nothing back), seen 2026-10-11 at momentum 33; the reason was not found. A
  fuse made on the lab can be cancelled only after 3,600 momentums
  (`FuseExpiration`, about 15 hours here), so a batch cancel needs a lab that
  has been left running.
- Momentums take about 15 s on Docker Desktop, not 10.
- The bridge contract is not usable: the `bridge-liq` spork is inactive in
  go-zenon's devnet genesis and the bridge administrator is an address
  compiled into znnd that no devnet key holds.
- The Sporks page is read-only here: the wallet knows the spork administrator
  of chains 1 and 69 only. Do not activate a spork as a test on any chain.
