#!/usr/bin/env bash
# The Syrius lab: a go-zenon devnet for this repo's harnessed test runs.
#
#   tools/devnet/lab/lab.sh build    znnd image from go-zenon's HEAD
#   tools/devnet/lab/lab.sh up       start it (builds and makes assets if needed)
#   tools/devnet/lab/lab.sh status   containers, and whether it is producing
#   tools/devnet/lab/lab.sh down     stop it, chain kept
#   tools/devnet/lab/lab.sh wipe     stop it and delete the chain and assets
#
# See README.md for what it is and why it is not go-zenon's own compose file.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
go_zenon="${GO_ZENON_DIR:-$here/../../../../go-zenon}"
build="$here/.build"
assets="$here/assets"

# The image is tagged with the go-zenon commit it was built from, and that is
# remembered, so a later `up` runs what was built even if go-zenon has moved.
tag() {
  if [ ! -f "$build/revision" ]; then
    echo "No image yet: run 'lab.sh build'." >&2
    exit 1
  fi
  cat "$build/revision"
}

compose() {
  LAB_ZNND_TAG="$(tag)" docker compose -f "$here/docker-compose.yml" "$@"
}

do_build() {
  local revision
  revision="$(git -C "$go_zenon" rev-parse --short HEAD)"
  # A clean export of HEAD, not the working tree: the tree on this machine has
  # CRLF line endings and local edits, and an entrypoint with CRLF does not run.
  rm -rf "$build/src"
  mkdir -p "$build/src"
  git -C "$go_zenon" archive HEAD | tar -x -C "$build/src"
  docker build -t "syrius-lab-znnd:$revision" "$build/src"
  echo "$revision" > "$build/revision"
  echo "built syrius-lab-znnd:$revision"
}

do_assets() {
  [ -f "$assets/genesis.json" ] && return 0
  node "$here/make-assets.js" "$build/src/docker/devnet" "$assets"
}

case "${1:-}" in
  build)
    do_build
    ;;
  up)
    [ -f "$build/revision" ] || do_build
    docker image inspect "syrius-lab-znnd:$(tag)" > /dev/null
    do_assets
    compose up -d
    node "$here/frontier.js" 180 --wait 90
    ;;
  status)
    compose ps -a
    node "$here/frontier.js" 30
    ;;
  down)
    compose down
    ;;
  wipe)
    compose down -v
    rm -rf "$assets"
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 2
    ;;
esac
