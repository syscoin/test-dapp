#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo 'Usage: bash scripts/pali-syscoin-qa.sh <pali-wallet-checkout> <unpacked-extension> <sentry-backend-checkout>' >&2
  exit 2
fi

pali_checkout=$(cd -- "$1" && pwd -P)
extension_build=$(cd -- "$2" && pwd -P)
backend_checkout=$(cd -- "$3" && pwd -P)
if [[ ! -f $extension_build/manifest.json ||
      ! -x $pali_checkout/node_modules/.bin/playwright ||
      ! -d $pali_checkout/apps/mobile/node_modules ||
      ! -d $backend_checkout/node_modules ]]; then
  echo 'Expected a built extension and installed Pali root, mobile, and pinned Sentry backend dependencies.' >&2
  exit 2
fi

cd -- "$pali_checkout"
# Pali's focused journeys assume the production provider and artifact identity.
manifest_version=$(node -p 'require(process.argv[1]).version' "$extension_build/manifest.json")
package_version=$(node -p 'require("./package.json").version')
if [[ $manifest_version != "$package_version" ]]; then
  echo 'Build the production extension in this checkout with yarn build:chrome.' >&2
  exit 2
fi
export PALI_TEST_DAPP_CHANNEL=production
export PALI_TEST_DAPP_EXTENSION_PATH="$extension_build"
export PALI_TEST_DAPP_REVISION="$(git rev-parse --verify HEAD)"
export SENTRY_BACKEND_ROOT="$backend_checkout"
export PALI_E2E_RUN_ID="pali-syscoin-qa-$(date -u +%Y%m%dT%H%M%SZ)-$$"
export PALI_E2E_HEADED=false
unset PALI_E2E_SEED PALI_E2E_PASSWORD
echo "Pali fixture checkout $PALI_TEST_DAPP_REVISION"

status=0
# These journeys set up separate synthetic wallets and local RPC/state fixtures.
node_modules/.bin/playwright test --config e2e/playwright.config.ts \
  utxo-psbt.journey.spec.ts spt-asset-matrix.journey.spec.ts \
  sentry-operator.journey.spec.ts sentry-batch-import.journey.spec.ts \
  sentry-wallet-authority.journey.spec.ts sentry-governance-vote.journey.spec.ts \
  sentry-management-fees.journey.spec.ts smart-account-dapp-switch.journey.spec.ts || status=1

cd apps/mobile
node --import ./scripts/register-shared-test-dependencies.mjs --test --test-concurrency=2 \
  tests/nativeConnections.test.ts tests/nativeDappSentry.test.ts tests/nativeSentryRequests.test.ts \
  tests/sentryApprovalsRuntime.test.ts tests/nativeSentryNodesScreen.test.ts \
  tests/utxoSend.integration.test.ts tests/nativeSmartAccount.test.ts || status=1
exit "$status"
