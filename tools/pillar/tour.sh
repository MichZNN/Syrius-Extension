#!/usr/bin/env bash
# Opens every screen of the wallet in a running harness instance and prints,
# for each, the horizontal overflow in pixels and the console errors since the
# last screen. A screenshot of each goes to the instance's shots folder.
#
#   tools/pillar/tour.sh <instance> [prefix for the screenshots, default tour]
#
# Exit status 0 only when no screen overflows and none logged an error.
set -uo pipefail
instance="${1:?usage: tour.sh <instance> [prefix]}"
prefix="${2:-tour}"
h() { node "$(dirname "$0")/../../utils/dev-harness.js" "$@" --instance "$instance"; }

routes="tabs/dashboard tabs/dashboard/send tabs/dashboard/receive tabs/tokens tabs/tokens/manage tabs/tokens/issue
tabs/delegate tabs/plasma tabs/stake tabs/change-address tabs/settings tabs/settings/change-node
tabs/settings/node-stats tabs/settings/about tabs/settings/connected-sites tabs/settings/sign-message tabs/settings/zap
tabs/settings/sporks tabs/sentinel tabs/pillar tabs/rewards tabs/az tabs/az/new"

bad=0
h logs --clear > /dev/null 2>&1
for route in $routes; do
  h route "$route" > /dev/null 2>&1
  node -e "setTimeout(() => {}, 2500)"
  overflow="$(h eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>&1 | tail -1)"
  errors="$(h logs --clear 2>&1 | grep -c '\[error\]')"
  h shot --out "$prefix-$(echo "$route" | tr '/' '-').png" > /dev/null 2>&1
  echo "$route overflow $overflow errors $errors"
  if [ "$overflow" != "0" ] || [ "$errors" != "0" ]; then bad=1; fi
done
exit $bad
