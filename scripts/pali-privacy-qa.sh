#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/pali-privacy-qa.sh <pali-wallet-checkout>
           [--browser <unpacked-chromium-extension> <local-proving-key-file>]

Runs Pali's synthetic Privacy fixtures for the extension and mobile hosts.
Install the checkout's dependencies before running. The optional browser phase
also requires Playwright Chromium and an unpacked extension built from the
specified checkout. Pali checks the local proving key against its public pin.
EOF
}

if [[ $# -eq 1 && $1 == --help ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 && ( $# -ne 4 || $2 != --browser ) ]]; then
  usage >&2
  exit 2
fi

pali_checkout=$(cd -- "$1" && pwd -P)
if [[ ! -x $pali_checkout/node_modules/.bin/jest ||
      ! -d $pali_checkout/apps/mobile/node_modules ||
      ! -d $pali_checkout/source/pages/Privacy ||
      ! -f $pali_checkout/apps/mobile/scripts/register-shared-test-dependencies.mjs ]]; then
  printf '%s\n' 'Expected a Pali checkout with installed root and mobile dependencies.' >&2
  exit 2
fi

if [[ $# -eq 4 ]]; then
  extension_build=$(cd -- "$3" && pwd -P)
  proving_key_dir=$(cd -- "$(dirname -- "$4")" && pwd -P)
  proving_key="$proving_key_dir/$(basename -- "$4")"
  if [[ ! -x $pali_checkout/node_modules/.bin/playwright ||
        ! -f $extension_build/manifest.json || ! -r $proving_key || ! -f $proving_key ]]; then
    printf '%s\n' 'Expected Playwright, a Chromium extension manifest and a readable local proving key.' >&2
    exit 2
  fi
fi

cd -- "$pali_checkout"
revision=$(git rev-parse --verify HEAD)
printf 'Pali fixture checkout %s (%s)\n' "$pali_checkout" "$revision"
status=0

printf '\nExtension Privacy fixtures\n'
NODE_ENV=test node_modules/.bin/jest --runInBand --coverage=false \
  source/pages/Privacy/ source/utils/privacy/ source/shared/privacyPoolActivity.spec.ts \
  source/wallet/privacy*.spec.ts source/wallet/private*.spec.ts source/wallet/noteBackup*.spec.ts \
  source/scripts/Background/privacyRegistration.spec.ts \
  source/scripts/Background/controllers/MainController.privacyWithdrawal*.spec.ts \
  source/scripts/Background/controllers/{noteBackup,privacy,privacySettings,privateVault,MainController.privateVault}.spec.ts || status=1

printf '\nMobile Privacy host fixtures\n'
(
  cd apps/mobile &&
  node --import ./scripts/register-shared-test-dependencies.mjs --test --test-concurrency=2 \
    tests/nativePrivacy*.test.ts tests/nativePrivate*.test.ts tests/nativeNote*.test.ts \
    tests/private*.test.ts tests/{noteBackupFileIntake,noteVaultStorage,privacyServiceSettings}.test.ts
) || status=1

if [[ $# -eq 4 ]]; then
  printf '\nFenced Chromium Privacy fixtures\n'
  export PALI_TEST_DAPP_EXTENSION_PATH="$extension_build"
  export PALI_TEST_DAPP_REVISION="$revision"
  export PALI_PRIVACY_PROVING_KEY_FILE="$proving_key"
  export PALI_E2E_RUN_ID="pali-privacy-qa-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  export PALI_E2E_HEADED=false
  node_modules/.bin/playwright test --config e2e/playwright.visual.config.ts privacyPoolSync.spec.ts || status=1
  node_modules/.bin/playwright test --config e2e/playwright.config.ts private-note-backup.journey.spec.ts || status=1
fi

exit "$status"
