#!/usr/bin/env bash
# Brings chain 69 (the shared devnet behind devnet.zenon.foo) back after the
# `syrius-test` spork.
#
# The wallet's Sporks page created and activated that spork as a test on
# 2026-10-11. A znnd stops at the enforcement height of any activated spork it
# does not list in `types.ImplementedSporksMap`, and a spork cannot be
# deactivated, so every pillar has been exiting at momentum 242,819 since
# ("Detected an unimplemented spork ... Please upgrade your znnd binary").
# The cure is a znnd that lists the id. It gates nothing; listing it only lets
# the nodes walk past the height.
#
# Run on the host that runs the chain (the VPS, as the user that owns ~/zenon):
#
#   ./recover-chain69-spork.sh status     what is running, and the frontier
#   ./recover-chain69-spork.sh prepare    add the id to the source, build the image; touches nothing running
#   ./recover-chain69-spork.sh rollout    stop the five nodes, back up their volumes, start them on the new image
#   ./recover-chain69-spork.sh rollback   put the five nodes back on the image they ran before
#
# `prepare` builds znnd from a clean export of the tree's HEAD plus the one
# line, and drops it into the image chain 69 already runs
# (`go-zenon-devnet:chain69`), so the baked genesis, configs, keys and
# entrypoint stay exactly as they are. That image was built from this HEAD
# (590f43c, checked out 2026-09-01 05:49 UTC, image built 06:26 UTC; the tree's
# other "modified" Go files differ in line endings only), and go.sum pins every
# module, so the new binary differs by the spork line and the Go patch release.
#
# Each step is safe to run again. Nothing here removes a volume.
set -euo pipefail

SPORK=716478e346a7c0c82b42d598627104f463b48b6bb83341d906d1261c42e1124f
HALT_HEIGHT=242818
TREE="${TREE:-$HOME/zenon/go-zenon}"
BUILD="${BUILD:-$HOME/zenon/_spork-build}"
OLD_IMAGE="${OLD_IMAGE:-go-zenon-devnet:chain69}"
NEW_IMAGE="${NEW_IMAGE:-go-zenon-devnet:chain69-spork-716478e3}"
RUNNING_TAG="${RUNNING_TAG:-go-zenon-devnet:latest}"
SERVICES=(pillar pillar2 pillar3 observer rpc)
VOLUMES=(go-zenon_pillar-data go-zenon_pillar2-data go-zenon_pillar3-data go-zenon_observer-data go-zenon_rpc-data)
# Set to `builder` to stop after compiling (a build check on a machine that
# does not have the chain's image).
TARGET="${TARGET:-}"

say() { printf '\n== %s\n' "$*"; }

# Adds the spork to one copy of common/types/spork.go, keeping its line
# endings. Does nothing when the id is already there; refuses a file whose
# anchors are not found exactly once.
patch_spork() {
  SPORK="$SPORK" perl -e '
    my ($path) = @ARGV;
    my $id = $ENV{SPORK};
    open(my $in, "<:raw", $path) or die "cannot read $path: $!";
    local $/; my $data = <$in>; close($in);
    if (index($data, $id) >= 0) { print "  already listed: $path\n"; exit 0; }
    my $eol = $data =~ /\r\n/ ? "\r\n" : "\n";
    my $map = "\tImplementedSporksMap = map[Hash]bool{";
    my $last = "\t\tDynamicPlasmaSpork.SporkId:      true,";
    my $maps = () = $data =~ /\Q$map\E/g;
    my $lasts = () = $data =~ /\Q$last\E/g;
    die "anchors not found exactly once in $path ($maps, $lasts)\n" unless $maps == 1 && $lasts == 1;
    my $comment = join($eol,
      "\t// DevnetSyriusTestSpork was created and activated on chain 69, the shared",
      "\t// devnet, on 2026-10-11 as a wallet test (enforcement height 242,819). It",
      "\t// gates nothing. It is listed because a node stops at the enforcement",
      "\t// height of any activated spork it does not list, and a spork cannot be",
      "\t// deactivated: without this line chain 69 halts at 242,818 for good.",
      "\tDevnetSyriusTestSpork = NewImplementedSpork(\"$id\")",
      "") . $eol;
    $data =~ s/\Q$map\E/$comment$map/;
    $data =~ s/\Q$last\E/$last$eol\t\tDevnetSyriusTestSpork.SporkId:   true,/;
    open(my $out, ">:raw", $path) or die "cannot write $path: $!";
    print $out $data; close($out);
    print "  added (" . ($eol eq "\r\n" ? "CRLF" : "LF") . "): $path\n";
  ' "$1"
}

rpc_frontier() {
  docker exec znnd-devnet-rpc sh -c 'wget -qO- --header="content-type: application/json" --post-data="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ledger.getFrontierMomentum\",\"params\":[]}" http://127.0.0.1:35997' 2>/dev/null \
    | grep -oE '"height":[0-9]+' | head -1 | cut -d: -f2
}

status() {
  say "containers"
  docker ps -a --filter name=znnd-devnet --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
  say "images"
  docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}' | grep -E '^go-zenon-devnet:' || true
  say "frontier (halted at $HALT_HEIGHT)"
  echo "  $(rpc_frontier || echo 'rpc node not answering')"
}

prepare() {
  say "source: $TREE"
  [ -f "$TREE/common/types/spork.go" ] || { echo "no go-zenon tree at $TREE" >&2; exit 1; }
  local head
  head="$(git -C "$TREE" rev-parse HEAD)"
  echo "  HEAD $head"
  [ -f "$TREE/common/types/spork.go.bak-pre-syrius-test-spork" ] || cp -p "$TREE/common/types/spork.go" "$TREE/common/types/spork.go.bak-pre-syrius-test-spork"
  # In the tree, so the next rebuild from it keeps the line.
  patch_spork "$TREE/common/types/spork.go"

  say "export: $BUILD"
  rm -rf "$BUILD/src"
  mkdir -p "$BUILD/src"
  git -C "$TREE" -c core.autocrlf=false archive "$head" | tar -x -C "$BUILD/src"
  patch_spork "$BUILD/src/common/types/spork.go"
  cat > "$BUILD/src/Dockerfile.spork" <<DOCKERFILE
FROM golang:1.23-alpine AS builder
RUN apk add --no-cache make gcc musl-dev git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN make znnd

FROM $OLD_IMAGE
COPY --from=builder /app/build/znnd /usr/local/bin/znnd
DOCKERFILE

  say "build: $NEW_IMAGE"
  if [ -n "$TARGET" ]; then
    docker build -f "$BUILD/src/Dockerfile.spork" --target "$TARGET" -t "$NEW_IMAGE-$TARGET" "$BUILD/src"
    docker run --rm --entrypoint sh "$NEW_IMAGE-$TARGET" -c "grep -c $SPORK /app/build/znnd" | sed 's/^/  spork id found in the binary, matching lines: /'
    return
  fi
  docker image inspect "$OLD_IMAGE" >/dev/null 2>&1 || { echo "the image chain 69 runs ($OLD_IMAGE) is not on this host" >&2; exit 1; }
  docker build -f "$BUILD/src/Dockerfile.spork" -t "$NEW_IMAGE" "$BUILD/src"
  say "the new binary lists the spork"
  docker run --rm --entrypoint sh "$NEW_IMAGE" -c "grep -c $SPORK /usr/local/bin/znnd && ls -la /usr/local/bin/znnd /entrypoint.sh /devnet"
  echo
  echo "Built. Nothing running was touched. Next: $0 rollout"
}

rollout() {
  docker image inspect "$NEW_IMAGE" >/dev/null 2>&1 || { echo "run '$0 prepare' first: $NEW_IMAGE does not exist" >&2; exit 1; }
  cd "$TREE"
  say "stop the five nodes"
  docker compose stop "${SERVICES[@]}"

  say "back up their volumes to $BUILD/backup (plain tar, about 6 GB)"
  mkdir -p "$BUILD/backup"
  for volume in "${VOLUMES[@]}"; do
    if [ -s "$BUILD/backup/$volume.tar" ]; then echo "  kept: $volume.tar"; continue; fi
    docker run --rm -v "$volume":/v:ro -v "$BUILD/backup":/b --entrypoint tar "$OLD_IMAGE" -cf "/b/$volume.tar.part" -C /v .
    # The helper runs as root; the rename happens inside it for the same reason.
    docker run --rm -v "$BUILD/backup":/b --entrypoint mv "$OLD_IMAGE" "/b/$volume.tar.part" "/b/$volume.tar"
    echo "  saved: $volume.tar"
  done

  say "point $RUNNING_TAG at the new image (the old one stays as $OLD_IMAGE)"
  docker tag "$NEW_IMAGE" "$RUNNING_TAG"

  say "start the five nodes"
  docker compose up -d --no-build "${SERVICES[@]}"

  say "waiting for momentum $((HALT_HEIGHT + 1)) (up to four minutes)"
  local height=""
  for _ in $(seq 1 48); do
    sleep 5
    height="$(rpc_frontier || true)"
    echo "  frontier ${height:-?}"
    if [ -n "$height" ] && [ "$height" -gt "$((HALT_HEIGHT + 2))" ]; then
      say "chain 69 is producing again"
      docker ps --filter name=znnd-devnet --format '{{.Names}}\t{{.Status}}'
      return
    fi
  done
  say "NOT past the halt after four minutes"
  docker ps -a --filter name=znnd-devnet --format '{{.Names}}\t{{.Status}}'
  docker logs --tail 15 znnd-devnet-pillar 2>&1 | cut -c1-240
  echo
  echo "To go back to the previous image: $0 rollback   (volumes are in $BUILD/backup)"
  exit 1
}

rollback() {
  cd "$TREE"
  say "back to $OLD_IMAGE"
  docker compose stop "${SERVICES[@]}"
  docker tag "$OLD_IMAGE" "$RUNNING_TAG"
  docker compose up -d --no-build "${SERVICES[@]}"
  echo "The nodes run the old binary again. If momentums past $HALT_HEIGHT were written, restore the volumes from $BUILD/backup before starting them."
}

case "${1:-}" in
  status) status ;;
  prepare) prepare ;;
  rollout) rollout ;;
  rollback) rollback ;;
  *) sed -n '2,26p' "$0"; exit 2 ;;
esac
