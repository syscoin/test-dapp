# Syscoin Test Dapp

This is a Syscoin-maintained fork of the MetaMask test dapp for manual QA and wallet integration testing.

Currently hosted [here](https://syscoin-test-dapp.vercel.app/).

## Usage

If you wish to use this dapp in your e2e tests, install this package and set up a script of e.g. the following form:

```shell
static-server node_modules/@syscoin/test-dapp/dist --port 9011
```

The main page of the test dapp includes a simple UI featuring buttons for common dapp interactions.

There is a second page (`request.html`) that allows making requests directly to the provider using query parameters. This provides a simple way of testing RPC methods using an in-page provider.

It can be used by navigating to `/request.html?method=${METHOD}&params=${PARAMS}` (e.g. `/request.html?method=eth_getLogs&params=[{ "address": "0x0000000000000000000000000000000000000000" }]`). The page will make a request with the given RPC method and parameters using `ethereum.request`, and report the result as plain text.

## Pali Mobile Testing

1. Add the Ethereum test network you want to use in Pali Mobile. For a local
   chain, configure an RPC the emulator can reach. Use a disposable wallet
   funded on that chain for transaction tests.
2. In **Connect Actions**, enter the decimal or hex chain ID. To test chain
   switching, enter comma-separated IDs with the initial chain first.
3. Select **WalletConnect**. Scan the QR code with Pali Mobile and approve the
   session. A browser on the same device can also open the pairing in Pali.
4. Use the existing signing, transaction and **Pali Smart Account** cards.
   Pali approves the available methods for the selected session. The dapp sends
   wallet requests through that session and displays its return values and
   rejection codes.

For Smart Account testing, use a test network with the Pali Smart Account
infrastructure available. Select a connected Smart Account or use the Smart
Account card to prepare one, then check capabilities, submit an atomic batch
and check its status.

## Pali Smart Account Testing

The Syscoin fork adds a **Pali Smart Account** card to the main page. Use it with the Pali extension or a Pali Mobile WalletConnect session to exercise the full dapp-facing ERC-4337 / ERC-7579 surface:

- `wallet_prepareSmartAccount` — create and register an account with either a passkey (P-256 WebAuthn) or an ECDSA authenticator (connected-key bootstrap or explicit owners + threshold).
- `wallet_getCapabilities` — confirm atomic batch support for the account.
- `wallet_sendCalls` / `wallet_getCallsStatus` / `wallet_showCallsStatus` — run an editable atomic batch, poll its EIP-5792 status (`100` pending, `200` confirmed, `500` reverted, `600` partially reverted) with on-chain receipts, or open the wallet's own status popup. An optional custom batch id exercises dapp-provided ids (resubmitting the same id must fail with `5720`). Helpers load an ERC20 `approve` + spender `transferFrom` batch or append a zero-value call to the deployed **Failing Contract**. Deploy that fixture using the Send card, then copy the displayed address into the Smart Account card before testing atomic rollback.
- `wallet_getSmartAccountModules` — list installed ERC-7579 modules and the active validator.
- `wallet_requestSmartAccountModuleInstall` / `wallet_requestSmartAccountModuleUninstall` — request module install/uninstall (with optional init data and label).

Existing transaction cards can also be used once the smart account is connected as the active account.

## Syscoin UTXO and Sentry Nodes

Select a Syscoin UTXO network in Pali. For the extension, use the **Syscoin UTXO and Sentry Nodes** card and start with `sys_requestAccounts`. For mobile, select the same network in the card and use **Connect Pali Mobile** to request a Syscoin WalletConnect session. The EVM connection in **Connect Actions** is independent.

The card sends JSON parameters to the wallet for public UTXO reads, PSBT signing, Sentry capabilities, node linking, operation authorization and voting. Prepare Sentry operation and PSBT fixtures with disposable test data. Pali obtains node state through the service configured in the wallet and reviews each approval. The dapp does not need an operator key or recovery phrase.

## Automated Pali Coverage

The fork runs its build, lint, smoke, WalletConnect and Chromium fixture checks on PRs, manual dispatch and nightly. The Chromium tests open the built dapp and drive the existing Smart Account controls and Syscoin UTXO and Sentry card using synthetic wallet responses. WalletConnect tests cover the approved Ethereum and Syscoin namespaces, method forwarding and session changes. These checks need no wallet credentials or network funds.

Pali's existing browser-conformance job drives the actual extension with the upstream dapp and Pali-specific fixture pages. To run focused Syscoin checks closer to the wallet:

```shell
bash scripts/pali-syscoin-qa.sh <pali-checkout> <unpacked-chromium-build> <sentry-backend-checkout>
bash scripts/pali-privacy-qa.sh <pali-checkout>
bash scripts/pali-privacy-qa.sh <pali-checkout> --browser <unpacked-chromium-build> <local-proving-key-file>
```

Use the wallet checkout's pinned toolchain and installed root and mobile dependencies. Build the production extension from that checkout with `yarn build:chrome` and install its Playwright Chromium. Use the Sentry backend revision specified in Pali's `sentry-management-fees.journey.spec.ts`. The Syscoin runner reuses Pali's local UTXO, SPT, Sentry signing, collateral and Smart Account connection journeys and selected native host tests. Privacy is internal to Pali. Its runner exercises deposit and withdrawal flows, relayer handling, backups and public-only bulk pool reads without adding a dapp RPC for secrets. The optional browser checks use Pali's pinned public proving key and isolated fixtures.

## Contributing

### Setup

- Install [Node.js](https://nodejs.org) >=24.22.1
  - If you are using [nvm](https://github.com/creationix/nvm#installation) (recommended), running `nvm use` will automatically choose the version from `.nvmrc`.
  - Node.js 24.22.1 or later is required, including when installing the published package.
- Install [Yarn 1.22.22](https://classic.yarnpkg.com/en/docs/install)
- Run `yarn setup` to install dependencies and run any required post-install scripts
  - **Warning:** Do not use the `yarn` / `yarn install` command directly. Use `yarn setup` instead. The normal install command will skip required post-install scripts, leaving your development environment in an invalid state.

### Testing and Linting

Run `yarn lint` to run the linter, or run `yarn lint:fix` to run the linter and fix any automatically fixable issues.

Run `yarn build && yarn test:smoke` to check that the production artifact contains both pages and their local assets. This does not execute the browser JavaScript, test wallet flows, or verify the deployed GitHub Pages site.

### Deploying

The Syscoin fork is deployed by Vercel. Merges to `main` publish to the hosted test dapp, and pull requests receive preview deployments.

Vercel project settings:

- Install command: `yarn install --frozen-lockfile`
- Build command: `yarn build`
- Output directory: `dist`

### Development

#### Elements Must Be Selectable by XPath

All HTML elements should be easily selectable by XPath.
This means that appearances can be misleading.
For example, consider this old bug:

```html
<button
  class="btn btn-primary btn-lg btn-block mb-3"
  id="approveTokensWithoutGas"
  disabled
>
  Approve Tokens Without Gas
</button>
```

This appears on the page as `Approve Tokens Without Gas`. In reality, the value included the whitespace on the second line, and caused XPath queries for the intended value to fail.
